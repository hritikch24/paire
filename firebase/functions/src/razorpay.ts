import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { promoCheckout } from "./launchOffer";
import { normalizePromo } from "./lib/launch-offer";
import { handleChatUnlockWebhook } from "./chatAccess";
import { razorpayConfigured, razorpayPlusOpen, storeExpiryIfEnabled, syncPremium, webPassBenefits, webPassExpiry } from "./billing";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { checkoutHost, requireHostedCheckout } from "./lib/kraftai";
import { CHECKOUT_PRODUCTS } from "./lib/checkout-products";
import {
  isPlusPlan,
  isRazorpayId,
  planWindow,
  paymentMatchesOrder,
  PLUS_PASSES,
  PlusPlan,
  validCheckoutSignature,
  validWebhookSignature
} from "./lib/razorpay";
import { consumeDailyQuota } from "./quota";
import { razorpay } from "./razorpayClient";
import { verifiedUsers } from "./trust";
import { razorpayMode } from "./lib/chatAccess";

/**
 * Paire Plus on the web, through Razorpay (UPI, cards, netbanking).
 *
 * 1. createPlusOrder: the server picks the price for the plan and creates a Razorpay order.
 * 2. The browser opens Razorpay Checkout for that order.
 * 3. confirmPlusPayment: checks Checkout's signature, then asks Razorpay itself that the
 *    payment is captured for this exact order and amount, and grants the pass once.
 * 4. razorpayWebhook: the same grant from Razorpay's signed events (covers closed tabs
 *    and late captures), plus refunds.
 *
 * razorpayOrders/{orderId} is server-only (firestore.rules denies all client access).
 */

// syncPremium also reads store passes, so the RevenueCat key must be bound here too.
const SECRETS = ["RAZORPAY_KEY_SECRET", "REVENUECAT_SECRET_KEY"];

type OrderRecord = {
  uid: string;
  plan: PlusPlan;
  amountPaise: number;
  status: "created" | "paid" | "refunded" | "duplicate" | "orphaned" | "rejected";
  paymentId?: string;
  expiresAt?: number;
};

type RazorpayPayment = {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  amount_refunded?: number;
};

/**
 * Grants the pass for a captured payment, exactly once per order. The pass
 * starts now (capture time), or when the member's current pass ends: web
 * passes queue through webPassLedger/{uid}, read and written in the same
 * transaction so two payments at once can't overlap, and store passes are
 * counted too. Returns the member's uid, or null when the order is unknown.
 */
async function refundUnneededPass(orderId: string, paymentId: string, amountPaise: number, reason: string, extra = false): Promise<void> {
  const ref = db.doc(`razorpayOrders/${orderId}`);
  try {
    const refund = await razorpay<{ id?: string }>(`/payments/${paymentId}/refund`, { method: "POST", body: { amount: amountPaise, speed: "normal", notes: { reason, product: CHECKOUT_PRODUCTS.plus } } });
    await ref.update(extra ? { extraRefunds: FieldValue.arrayUnion({ paymentId, refundId: refund.id ?? null, at: Date.now() }) } : { refundRequestedAt: Date.now(), refundId: refund.id ?? null, refundReason: reason });
  } catch (error) {
    await ref.update(extra ? { extraRefundErrors: FieldValue.arrayUnion({ paymentId, error: String(error).slice(0, 300), at: Date.now() }) } : { refundError: String(error).slice(0, 300), refundReason: reason });
    logger.error("Plus duplicate refund failed", { orderId, reason });
  }
}

export async function grantWebPass(orderId: string, paymentId: string): Promise<string | null> {
  const ref = db.doc(`razorpayOrders/${orderId}`), snap = await ref.get();
  if (!snap.exists) return null;
  const order = snap.data() as OrderRecord;
  const storeExpiry = order.plan === "lifetime" ? 0 : await storeExpiryIfEnabled(order.uid, Date.now());
  const ledgerRef = db.doc(`webPassLedger/${order.uid}`);
  const outcome = await db.runTransaction(async tx => {
    const [fresh, ledger, user, moderation] = await tx.getAll(ref, ledgerRef, db.doc(`users/${order.uid}`), db.doc(`moderation/${order.uid}`));
    if (fresh.get("status") === "paid" && fresh.get("paymentId") !== paymentId && !((fresh.get("extraPaymentIds") as string[] | undefined) ?? []).includes(paymentId)) {
      tx.update(ref, { extraPaymentIds: FieldValue.arrayUnion(paymentId) }); return "extra";
    }
    if (fresh.get("status") !== "created") return "closed";
    // Read the clock after this attempt's locked reads. An earlier callback can
    // retry after a later callback granted lifetime; its old timestamp must not
    // make that permanent purchase appear to start in the future.
    const now = Date.now();
    const benefits = await webPassBenefits(order.uid, now, tx);
    const record = { paymentId, updatedAt: FieldValue.serverTimestamp() };
    if (!user.exists) { tx.update(ref, { ...record, status: "orphaned" }); return "orphaned"; }
    if (order.plan === "lifetime" && fresh.get("mode") === "test" && process.env.FUNCTIONS_EMULATOR !== "true" && moderation.get("cohort") !== "test") {
      tx.update(ref, { ...record, status: "rejected" }); return "rejected";
    }
    if (benefits.lifetime) { tx.update(ref, { ...record, status: "duplicate" }); return "duplicate"; }
    const queuedUntil = Math.max(Number(ledger.get("until")) || 0, storeExpiry, benefits.expiresAt);
    const window = planWindow(now, order.plan, queuedUntil);
    tx.update(ref, { ...record, ...window, status: "paid", paidAt: now });
    tx.set(ledgerRef, { until: window.expiresAt ?? queuedUntil, updatedAt: FieldValue.serverTimestamp() });
    return "granted";
  });
  if (["duplicate", "orphaned", "rejected", "extra"].includes(outcome)) await refundUnneededPass(orderId, paymentId, order.amountPaise, outcome, outcome === "extra");
  return order.uid;
}

/** Marks an order refunded and pulls the member's queue back to their remaining passes. */
async function refundWebPass(ref: DocumentReference): Promise<string | null> {
  const snap = await ref.get();
  if (!snap.exists) return null;
  const uid = snap.get("uid") as string;
  await ref.update({ status: "refunded", updatedAt: FieldValue.serverTimestamp() });
  await db.doc(`webPassLedger/${uid}`).set({ until: await webPassExpiry(uid), updatedAt: FieldValue.serverTimestamp() });
  return uid;
}

/** Recomputes premium only for members who still exist (late webhooks must not recreate data). */
async function syncIfMember(uid: string | null): Promise<void> {
  if (uid && (await db.doc(`users/${uid}`).get()).exists) await syncPremium(uid);
}

export const createPlusOrder = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  const plan = (request.data as { plan?: unknown } | null)?.plan;
  if (!isPlusPlan(plan)) throw new HttpsError("invalid-argument", "Choose a day, week, monthly, six-month or lifetime Plus pass.");
  if (!(await razorpayPlusOpen())) throw new HttpsError("failed-precondition", "Card payments aren't available right now. You haven't been charged.");
  requireHostedCheckout();
  if ((await webPassBenefits(uid)).lifetime) throw new HttpsError("failed-precondition", "You already have Lifetime Plus. No purchase is needed.");
  await consumeDailyQuota(uid, "plusOrders", 20);
  if (!(await verifiedUsers([uid])).has(uid)) {
    throw new HttpsError("failed-precondition", "Verify your photos before buying a pass, so you can use it straight away.");
  }
  if (plan === "lifetime" && normalizePromo((request.data as { promoCode?: unknown } | null)?.promoCode)) {
    const previous = await db.doc(`lifetimePlusCheckout/${uid}`).get();
    const age = Date.now() - Number(previous.get("updatedAt") || 0);
    if (previous.get("state") === "open" && age < 6 * 3600_000) {
      const order = await db.doc(`razorpayOrders/${previous.get("orderId")}`).get();
      if (!order.get("promo")) throw new HttpsError("failed-precondition", "Finish your earlier Lifetime checkout before using a promo code.");
    }
  }
  return promoCheckout(uid, plan, (request.data as { promoCode?: unknown } | null)?.promoCode, async (amountPaise, promoNotes) => {
    const pass = { ...PLUS_PASSES[plan], amountPaise };
    const checkoutRef = db.doc(`lifetimePlusCheckout/${uid}`);
    const previousId = plan === "lifetime" ? await db.runTransaction(async tx => {
      const previous = await tx.get(checkoutRef), age = Date.now() - Number(previous.get("updatedAt") || 0);
      if (previous.get("state") === "creating" && age < 60_000) throw new HttpsError("aborted", "Checkout is already opening. Try again in a moment.");
      if (previous.get("state") === "open" && age < 6 * 3600_000 && isRazorpayId(previous.get("orderId"), "order")) return previous.get("orderId") as string;
      tx.set(checkoutRef, { state: "creating", updatedAt: Date.now() }); return null;
    }) : null;
    if (previousId) {
      if (promoNotes.promo) throw new HttpsError("failed-precondition", "Finish your earlier Lifetime checkout before using a promo code.");
      const prior = await db.doc(`razorpayOrders/${previousId}`).get();
      if (prior.get("uid") === uid && prior.get("plan") === "lifetime" && prior.get("status") === "created" && prior.get("amountPaise") === pass.amountPaise) return { orderId: previousId, amount: pass.amountPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, description: pass.razorpayLabel, email: request.auth?.token.email ?? null, ...checkoutHost(previousId) };
      await checkoutRef.set({ state: "closed", updatedAt: Date.now() });
      throw new HttpsError("aborted", "Your earlier checkout changed. Refresh your pass status and try again.");
    }
    let order: { id: string; amount: number; currency: string };
    try { order = await razorpay<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: {
        amount: pass.amountPaise,
        currency: "INR",
        receipt: `plus_${plan}_${Date.now()}`,
        notes: { plan, product: CHECKOUT_PRODUCTS.plus, ...promoNotes }
      }
    });
    } catch (error) { if (plan === "lifetime") await checkoutRef.set({ state: "failed", updatedAt: Date.now() }); throw error; }
    if (!isRazorpayId(order.id, "order") || order.amount !== pass.amountPaise || order.currency !== "INR") {
      throw new HttpsError("unavailable", "The payment service returned an unexpected order. Please try again.");
    }
    await db.doc(`razorpayOrders/${order.id}`).set({
      uid,
      plan,
      amountPaise: pass.amountPaise,
      ...promoNotes,
      currency: "INR",
      status: "created",
      mode: razorpayMode(process.env.RAZORPAY_KEY_ID),
      createdAt: FieldValue.serverTimestamp()
    });
    if (plan === "lifetime") await checkoutRef.set({ state: "open", orderId: order.id, updatedAt: Date.now() });
    return {
      orderId: order.id,
      amount: pass.amountPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      description: pass.razorpayLabel,
      email: (request.auth?.token.email as string | undefined) ?? null,
      // name, and hostedUrl when Checkout opens on kraftai.in (lib/kraftai.ts).
      ...checkoutHost(order.id)
    };
  }, (request.data as { expectedAmount?: unknown } | null)?.expectedAmount);
});

export const confirmPlusPayment = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  const body = (request.data ?? {}) as { orderId?: unknown; paymentId?: unknown; signature?: unknown };
  if (!isRazorpayId(body.orderId, "order") || !isRazorpayId(body.paymentId, "pay")) {
    throw new HttpsError("invalid-argument", "Payment details are missing.");
  }
  // Not webBillingEnabled(): a payment already taken must still be confirmed if sales were paused meanwhile.
  if (!razorpayConfigured()) throw new HttpsError("failed-precondition", "Payments aren't available yet.");
  if (!validCheckoutSignature(body.orderId, body.paymentId, body.signature, process.env.RAZORPAY_KEY_SECRET)) {
    throw new HttpsError("permission-denied", "We couldn't verify that payment.");
  }
  const orderSnap = await db.doc(`razorpayOrders/${body.orderId}`).get();
  if (!orderSnap.exists || orderSnap.get("uid") !== uid) throw new HttpsError("not-found", "We couldn't find that order.");

  // The signature proves Checkout returned this pair; Razorpay itself confirms the money moved.
  const payment = await razorpay<RazorpayPayment>(`/payments/${body.paymentId}`);
  const verdict = paymentMatchesOrder(payment, { orderId: body.orderId, amountPaise: orderSnap.get("amountPaise") });
  if (verdict === "mismatch") throw new HttpsError("failed-precondition", "That payment doesn't match your order. Contact support if you were charged.");
  if (verdict === "captured") await grantWebPass(body.orderId, body.paymentId);
  const status = await syncPremium(uid);
  return { ...status, pending: verdict === "pending" };
});

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    refund?: { entity?: { payment_id?: string } };
    dispute?: { entity?: { payment_id?: string } };
  };
};

/**
 * Razorpay → Dashboard → Webhooks: point at this URL with the secret stored as
 * RAZORPAY_WEBHOOK_SECRET; events payment.captured, refund.processed, payment.dispute.created,
 * payment.dispute.lost, payment.dispute.won and payment.dispute.closed.
 */
export const razorpayWebhook = onRequest(
  { region: REGION, secrets: ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"], timeoutSeconds: 60 },
  async (request, response) => {
    if (request.method !== "POST") {
      response.sendStatus(405);
      return;
    }
    if (!validWebhookSignature(request.rawBody, request.get("x-razorpay-signature"), process.env.RAZORPAY_WEBHOOK_SECRET)) {
      response.sendStatus(401);
      return;
    }
    const body = request.body as WebhookPayload;
    try {
      const eventPayment = body.payload?.payment?.entity;
      const event = typeof body.event === "string" ? body.event : "";
      const paymentId = body.payload?.refund?.entity?.payment_id ?? body.payload?.dispute?.entity?.payment_id ?? eventPayment?.id;
      // Unlimited Chat orders live in their own collection, so a Plus pass can never be granted for one (or the reverse).
      if (await handleChatUnlockWebhook(event, paymentId, eventPayment?.order_id)) {
        response.sendStatus(200);
        return;
      }
      if (body.event === "payment.captured" && isRazorpayId(eventPayment?.id, "pay")) {
        // Re-read the payment: events can arrive late or out of order (e.g. after a refund).
        const payment = await razorpay<RazorpayPayment>(`/payments/${eventPayment.id}`);
        if (isRazorpayId(payment.order_id, "order")) {
          const order = await db.doc(`razorpayOrders/${payment.order_id}`).get();
          if (order.exists && paymentMatchesOrder(payment, { orderId: payment.order_id, amountPaise: order.get("amountPaise") }) === "captured") {
            await syncIfMember(await grantWebPass(payment.order_id, eventPayment.id));
          }
        }
      } else if (body.event === "refund.processed" || body.event === "payment.refunded" || body.event === "payment.dispute.lost") {
        // A lost chargeback ends the pass like a refund does.
        const byPayment = isRazorpayId(paymentId, "pay")
          ? await db.collection("razorpayOrders").where("paymentId", "==", paymentId).limit(1).get()
          : null;
        // A refund can arrive before the capture was granted: fall back to the order id.
        const ref = byPayment?.docs[0]?.ref ?? (isRazorpayId(eventPayment?.order_id, "order") ? db.doc(`razorpayOrders/${eventPayment.order_id}`) : null);
        if (ref) {
          const recorded = await ref.get();
          // A refund for an extra captured attempt never revokes the original purchase.
          if (!recorded.get("paymentId") || recorded.get("paymentId") === paymentId) await syncIfMember(await refundWebPass(ref));
        }
      }
      response.sendStatus(200);
    } catch (error) {
      logger.error("Razorpay webhook failed", { event: body.event, error: String(error) });
      response.sendStatus(503);
    }
  }
);
