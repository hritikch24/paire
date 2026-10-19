import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { handleChatUnlockWebhook } from "./chatAccess";
import { razorpayConfigured, razorpayPlusOpen, storeExpiryIfEnabled, syncPremium, webPassExpiry } from "./billing";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { checkoutHost, requireHostedCheckout } from "./lib/kraftai";
import { CHECKOUT_PRODUCTS } from "./lib/checkout-products";
import {
  isPlusPlan,
  isRazorpayId,
  passDays,
  passWindow,
  paymentMatchesOrder,
  PLUS_PASSES,
  PlusPlan,
  validCheckoutSignature,
  validWebhookSignature
} from "./lib/razorpay";
import { consumeDailyQuota } from "./quota";
import { razorpay } from "./razorpayClient";
import { verifiedUsers } from "./trust";

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
  status: "created" | "paid" | "refunded";
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
export async function grantWebPass(orderId: string, paymentId: string): Promise<string | null> {
  const ref = db.doc(`razorpayOrders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const order = snap.data() as OrderRecord;
  if (order.status !== "created") return order.uid;
  const now = Date.now();
  const storeExpiry = await storeExpiryIfEnabled(order.uid, now);
  const ledgerRef = db.doc(`webPassLedger/${order.uid}`);
  await db.runTransaction(async (tx) => {
    const [fresh, ledger] = await tx.getAll(ref, ledgerRef);
    if (fresh.get("status") !== "created") return;
    const queuedUntil = Math.max(Number(ledger.get("until")) || 0, storeExpiry);
    const { startsAt, expiresAt } = passWindow(now, passDays(order.plan), queuedUntil);
    tx.update(ref, { status: "paid", paymentId, paidAt: now, startsAt, expiresAt, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ledgerRef, { until: expiresAt, updatedAt: FieldValue.serverTimestamp() });
  });
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
  if (!isPlusPlan(plan)) throw new HttpsError("invalid-argument", "Choose a 1-day, 7-day or 30-day pass.");
  if (!(await razorpayPlusOpen())) throw new HttpsError("failed-precondition", "Card payments aren't available right now. You haven't been charged.");
  requireHostedCheckout();
  await consumeDailyQuota(uid, "plusOrders", 20);
  if (!(await verifiedUsers([uid])).has(uid)) {
    throw new HttpsError("failed-precondition", "Verify your photos before buying a pass, so you can use it straight away.");
  }
  const status = await syncPremium(uid);
  if (status.active) throw new HttpsError("failed-precondition", "Your Plus pass is already active.");

  const pass = PLUS_PASSES[plan];
  const order = await razorpay<{ id: string; amount: number; currency: string }>("/orders", {
    method: "POST",
    body: {
      amount: pass.amountPaise,
      currency: "INR",
      receipt: `plus_${plan}_${Date.now()}`,
      notes: { plan, product: CHECKOUT_PRODUCTS.plus }
    }
  });
  if (!isRazorpayId(order.id, "order") || order.amount !== pass.amountPaise) {
    throw new HttpsError("unavailable", "The payment service returned an unexpected order. Please try again.");
  }
  await db.doc(`razorpayOrders/${order.id}`).set({
    uid,
    plan,
    amountPaise: pass.amountPaise,
    currency: "INR",
    status: "created",
    createdAt: FieldValue.serverTimestamp()
  });
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
        if (ref) await syncIfMember(await refundWebPass(ref));
      }
      response.sendStatus(200);
    } catch (error) {
      logger.error("Razorpay webhook failed", { event: body.event, error: String(error) });
      response.sendStatus(503);
    }
  }
);
