import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { billingEnabled, razorpayConfigured, webPassBenefits } from "./billing";
import { chatPolicy } from "./chatEntitlement";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { razorpayMode, RazorpayMode } from "./lib/chatAccess";
import { canGift, GiftDenied, giftAmountPaise, GIFT_PENDING_MS, GiftPlan, isGiftPlan } from "./lib/gifts";
import { GIFT_CHECKOUT_REUSE_MS, giftCaptureVerdict, giftCheckoutKey, giftDayStart, giftOrderBody, giftPushCopy, GIFT_PRODUCT, isMatchId } from "./lib/giftPayments";
import { pairId } from "./lib/ids";
import { checkoutHost, requireHostedCheckout } from "./lib/kraftai";
import { isRazorpayId, paymentMatchesOrder, PLUS_PASSES, validCheckoutSignature, validWebhookSignature } from "./lib/razorpay";
import { sendPushToUser } from "./push";
import { consumeDailyQuota } from "./quota";
import { razorpay } from "./razorpayClient";
import { verifiedUsers } from "./trust";
import { WEB_PUSH_SECRETS } from "./webPush";

/**
 * Gifts: a member buys a Paire Plus pass (day, week or month, at the existing
 * price) for someone she is matched with. The Plus flow, replicated as its own
 * product so nothing about Plus changes (docs/kraftai-checkout.md):
 *
 * 1. createGiftOrder: the server prices the plan and creates a Razorpay order
 *    (notes { plan, product: "gift_plan" }, never a uid); Checkout opens on kraftai.in.
 * 2. confirmGiftPayment: checks Checkout's signature, re-reads the payment from
 *    Razorpay (paymentMatchesOrder), then grantGift creates gifts/{orderId} once.
 * 3. razorpayGiftWebhook: the same grant from Razorpay's signed events, on its
 *    own URL and secret (RAZORPAY_GIFT_WEBHOOK_SECRET). razorpayWebhook is untouched.
 *
 * Server-only records: giftOrders/{orderId} (never razorpayOrders, so Plus
 * accounting, revenue and the Plus webhook never see a gift) and
 * giftCheckout/{key} (one open checkout per sender, match and plan). gifts/{id}
 * is readable by the sender and the recipient. Off until runtime/trust.giftSales.
 */

// The same secrets as the Plus callables; confirming also sends the recipient's browser push.
const SECRETS = ["RAZORPAY_KEY_SECRET", "REVENUECAT_SECRET_KEY"];
const ORDERS_PER_DAY = 20;
const EXTRA_REASON = "second-payment-on-paid-order";
const emulator = () => process.env.FUNCTIONS_EMULATOR === "true";

type GiftOrderStatus = "created" | "paid" | "refunded" | "orphaned" | "rejected";
type GiftOrderRecord = {
  fromUid: string;
  toUid: string;
  matchId: string;
  plan: GiftPlan;
  amountPaise: number;
  currency: "INR";
  status: GiftOrderStatus;
  mode: RazorpayMode | null;
  createdAt: number;
  paymentId?: string;
};

type RazorpayPayment = { id?: string; order_id?: string; status?: string; amount?: number; currency?: string; amount_refunded?: number };

/** New gift checkouts can open (a payment already taken is always confirmed). */
async function giftSalesOpen(): Promise<boolean> {
  return billingEnabled() && razorpayConfigured() && razorpayMode(process.env.RAZORPAY_KEY_ID) !== null && (await chatPolicy()).giftSales === true;
}

const DENIED: Record<GiftDenied, string> = {
  "no-match": "You can only send a gift to someone you're matched with.",
  blocked: "You can't send a gift to this member.",
  unavailable: "This member can't receive a gift right now.",
  limit: "You've sent today's gifts. Try again tomorrow.",
  "already-lifetime": "They already have Lifetime Plus, so they don't need a pass."
};
const denied = (reason: GiftDenied) => new HttpsError("failed-precondition", DENIED[reason], { reason });

const checkoutPayload = (orderId: string, plan: GiftPlan, email: string | null) => ({
  orderId,
  amount: giftAmountPaise(plan),
  currency: "INR" as const,
  keyId: process.env.RAZORPAY_KEY_ID,
  description: PLUS_PASSES[plan].razorpayLabel,
  email,
  // name, and hostedUrl when Checkout opens on kraftai.in (lib/kraftai.ts).
  ...checkoutHost(orderId)
});

export const createGiftOrder = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  const body = (request.data ?? {}) as { matchId?: unknown; plan?: unknown };
  const plan = body.plan, matchId = body.matchId;
  if (!isGiftPlan(plan)) throw new HttpsError("invalid-argument", "Choose a day, week or monthly pass to gift.");
  if (!isMatchId(matchId)) throw new HttpsError("invalid-argument", "Choose who the gift is for.");
  if (!(await giftSalesOpen())) throw new HttpsError("failed-precondition", "Gifts aren't available yet. You haven't been charged.", { reason: "sales-off" });
  requireHostedCheckout();
  await consumeDailyQuota(uid, "giftOrders", ORDERS_PER_DAY);

  const [sender, senderModeration, match] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`), db.doc(`matches/${matchId}`));
  if (!sender.exists) throw new HttpsError("failed-precondition", "Finish creating your profile first.");
  if (senderModeration.get("status") === "banned") throw new HttpsError("permission-denied", "This account is unavailable. Contact support for help.");
  if (!(await verifiedUsers([uid])).has(uid)) {
    throw new HttpsError("failed-precondition", "Verify your photos before sending a gift.", { reason: "verification-required" });
  }

  // The recipient comes from the match itself, never from the client.
  const participants = (match.get("participants") as unknown[] | undefined)?.filter((p): p is string => typeof p === "string") ?? [];
  const toUid = participants.length === 2 && participants.includes(uid) ? participants.find((p) => p !== uid) : undefined;
  if (!match.exists || !toUid || match.get("kind") === "duo" || pairId(uid, toUid) !== matchId) throw denied("no-match");

  const now = Date.now();
  const checkoutRef = db.doc(`giftCheckout/${giftCheckoutKey(uid, matchId, plan)}`);
  const [recipient, recipientModeration, blocked, blockedBy, checkout] = await db.getAll(
    db.doc(`users/${toUid}`),
    db.doc(`moderation/${toUid}`),
    db.doc(`blocks/${uid}/blocked/${toUid}`),
    db.doc(`blocks/${toUid}/blocked/${uid}`),
    checkoutRef
  );
  const today = await db.collection("giftOrders").where("fromUid", "==", uid).where("createdAt", ">=", giftDayStart(now)).get();
  // Reopening today's open checkout for this match and plan is not another gift.
  const reusable = checkout.get("state") === "open" && now - (Number(checkout.get("updatedAt")) || 0) < GIFT_CHECKOUT_REUSE_MS ? checkout.get("orderId") : null;
  const sentToday = today.docs.filter((doc) => ["created", "paid"].includes(doc.get("status")) && !(doc.id === reusable && doc.get("status") === "created")).length;
  const verdict = canGift({
    fromUid: uid,
    toUid,
    match: { active: match.get("active") !== false, participants },
    blocked: blocked.exists || blockedBy.exists,
    recipientBanned: recipientModeration.get("status") === "banned",
    recipientVerified: (await verifiedUsers([toUid])).has(toUid),
    recipientExists: recipient.exists,
    sentToday,
    recipientLifetime: recipient.exists ? (await webPassBenefits(toUid)).lifetime : false
  });
  if (!verdict.ok) throw denied(verdict.reason);

  const email = (request.auth?.token.email as string | undefined) ?? null;
  const mode = razorpayMode(process.env.RAZORPAY_KEY_ID);
  const amountPaise = giftAmountPaise(plan);
  // One checkout at a time for this match and plan, so two tabs pay one order, not two.
  const previousId = await db.runTransaction(async (tx) => {
    const previous = await tx.get(checkoutRef), age = Date.now() - Number(previous.get("updatedAt") || 0);
    if (previous.get("state") === "creating" && age < 60_000) throw new HttpsError("aborted", "Checkout is already opening. Try again in a moment.");
    if (previous.get("state") === "open" && age < GIFT_CHECKOUT_REUSE_MS && isRazorpayId(previous.get("orderId"), "order")) return previous.get("orderId") as string;
    tx.set(checkoutRef, { state: "creating", updatedAt: Date.now() });
    return null;
  });
  if (previousId) {
    const prior = await db.doc(`giftOrders/${previousId}`).get();
    if (prior.get("fromUid") === uid && prior.get("toUid") === toUid && prior.get("matchId") === matchId && prior.get("plan") === plan
      && prior.get("status") === "created" && prior.get("amountPaise") === amountPaise && prior.get("mode") === mode) {
      return checkoutPayload(previousId, plan, email);
    }
    // Paid or changed since: start a fresh checkout.
    await checkoutRef.set({ state: "creating", updatedAt: Date.now() });
  }

  let order: { id?: string; amount?: number; currency?: string };
  try {
    order = await razorpay<{ id?: string; amount?: number; currency?: string }>("/orders", { method: "POST", body: giftOrderBody(plan, Date.now()) });
  } catch (error) {
    await checkoutRef.set({ state: "failed", updatedAt: Date.now() });
    throw error;
  }
  if (!isRazorpayId(order.id, "order") || order.amount !== amountPaise || order.currency !== "INR") {
    await checkoutRef.set({ state: "failed", updatedAt: Date.now() });
    throw new HttpsError("unavailable", "The payment service returned an unexpected order. Please try again.");
  }
  const createdAt = Date.now();
  const record: GiftOrderRecord = { fromUid: uid, toUid, matchId, plan, amountPaise, currency: "INR", status: "created", mode, createdAt };
  const batch = db.batch();
  batch.set(db.doc(`giftOrders/${order.id}`), record);
  batch.set(checkoutRef, { state: "open", orderId: order.id, updatedAt: createdAt });
  await batch.commit();
  return checkoutPayload(order.id, plan, email);
});

/**
 * Returns money for a gift payment that must not (or can no longer) buy a gift.
 * Written afresh after refundUnneededPass (razorpay.ts): the same Razorpay
 * refund call, and a failure is recorded on the order for support.
 */
export async function refundGiftPayment(orderId: string, paymentId: string, amountPaise: number, reason: string): Promise<void> {
  const ref = db.doc(`giftOrders/${orderId}`);
  // A second payment on an order that's already paid is recorded on the side, never over the paid one.
  const extra = reason === EXTRA_REASON;
  try {
    const refund = await razorpay<{ id?: string }>(`/payments/${paymentId}/refund`, {
      method: "POST",
      body: { amount: amountPaise, speed: "normal", notes: { reason, product: GIFT_PRODUCT } }
    });
    await ref.update(extra
      ? { extraRefunds: FieldValue.arrayUnion({ paymentId, refundId: refund.id ?? null, at: Date.now() }) }
      : { refundRequestedAt: Date.now(), refundId: refund.id ?? null, refundReason: reason });
  } catch (error) {
    logger.error("Gift refund failed", { orderId, reason, error: String(error) });
    await ref.update(extra
      ? { extraRefundErrors: FieldValue.arrayUnion({ paymentId, error: String(error).slice(0, 300), at: Date.now() }) }
      : { refundError: String(error).slice(0, 300), refundReason: reason });
  }
}

/** Tells the recipient. A push failure never fails the payment path. */
async function notifyRecipient(orderId: string, order: GiftOrderRecord): Promise<void> {
  try {
    const [settings, match] = await db.getAll(db.doc(`users/${order.toUid}/private/settings`), db.doc(`matches/${order.matchId}`));
    const profiles = match.get("profiles") as Record<string, { displayName?: unknown } | undefined> | undefined;
    const copy = giftPushCopy(settings.get("notifications.previews"), profiles?.[order.fromUid]?.displayName);
    await sendPushToUser(order.toUid, { kind: "matches", ...copy, data: { type: "gift", matchId: order.matchId, giftId: orderId }, tag: `gift-${orderId}` });
  } catch (error) {
    logger.warn("Gift push failed", { orderId, error: String(error) });
  }
}

export type GiftGrantOutcome = "granted" | "duplicate" | "extra" | "orphaned" | "rejected" | "closed";

/**
 * Creates gifts/{orderId} for a payment Razorpay reported captured (callers
 * check that first), exactly once, in the transaction that marks the order
 * paid. Eligibility is checked again here: a recipient who is gone, banned,
 * unmatched or blocked by now orphans the payment; test money for a real
 * account is rejected; a second payment on a paid order is an extra. All
 * three are refunded. A repeat for the payment already granted is "duplicate".
 */
export async function grantGift(orderId: string, paymentId: string): Promise<{ outcome: GiftGrantOutcome; toUid?: string }> {
  const ref = db.doc(`giftOrders/${orderId}`);
  const giftRef = db.doc(`gifts/${orderId}`);
  let order: GiftOrderRecord | undefined;
  const outcome = await db.runTransaction(async (tx): Promise<GiftGrantOutcome> => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return "closed";
    order = fresh.data() as GiftOrderRecord;
    if (order.status === "paid") {
      if (order.paymentId === paymentId || ((fresh.get("extraPaymentIds") as string[] | undefined) ?? []).includes(paymentId)) return "duplicate";
      tx.update(ref, { extraPaymentIds: FieldValue.arrayUnion(paymentId), updatedAt: FieldValue.serverTimestamp() });
      return "extra";
    }
    if (order.status !== "created") return "closed";
    const [gift, recipient, recipientModeration, senderModeration, match, blocked, blockedBy] = await tx.getAll(
      giftRef,
      db.doc(`users/${order.toUid}`),
      db.doc(`moderation/${order.toUid}`),
      db.doc(`moderation/${order.fromUid}`),
      db.doc(`matches/${order.matchId}`),
      db.doc(`blocks/${order.fromUid}/blocked/${order.toUid}`),
      db.doc(`blocks/${order.toUid}/blocked/${order.fromUid}`)
    );
    if (gift.exists) return "duplicate";
    const participants = (match.get("participants") as string[] | undefined) ?? [];
    const verdict = giftCaptureVerdict({
      fromUid: order.fromUid,
      toUid: order.toUid,
      match: match.exists ? { active: match.get("active") !== false, participants } : undefined,
      blocked: blocked.exists || blockedBy.exists,
      recipientExists: recipient.exists,
      recipientBanned: recipientModeration.get("status") === "banned",
      mode: order.mode,
      emulator: emulator(),
      senderCohort: senderModeration.get("cohort"),
      recipientCohort: recipientModeration.get("cohort")
    });
    const record = { paymentId, updatedAt: FieldValue.serverTimestamp() };
    if (verdict === "orphaned") {
      tx.update(ref, { ...record, status: "orphaned" });
      return "orphaned";
    }
    if (verdict === "rejected") {
      tx.update(ref, { ...record, status: "rejected", rejectedReason: "test-mode-payment-for-real-account" });
      return "rejected";
    }
    const now = Date.now();
    tx.set(giftRef, {
      fromUid: order.fromUid,
      toUid: order.toUid,
      matchId: order.matchId,
      plan: order.plan,
      amountPaise: order.amountPaise,
      status: "pending",
      createdAt: now,
      expiresAt: now + GIFT_PENDING_MS,
      paymentId
    });
    tx.update(ref, { ...record, status: "paid", paidAt: now, giftId: orderId });
    return "granted";
  });
  if (order && (outcome === "orphaned" || outcome === "rejected" || outcome === "extra")) {
    await refundGiftPayment(orderId, paymentId, order.amountPaise, outcome === "extra" ? EXTRA_REASON : outcome);
  }
  if (order && outcome === "granted") await notifyRecipient(orderId, order);
  if (outcome !== "granted" && outcome !== "duplicate") logger.info("Gift payment not granted", { orderId, outcome });
  return { outcome, toUid: order?.toUid };
}

export type GiftConfirmResult = { status: "paid" | "pending"; giftId: string };

export const confirmGiftPayment = onCall({ region: REGION, secrets: [...SECRETS, ...WEB_PUSH_SECRETS], timeoutSeconds: 30 }, async (request): Promise<GiftConfirmResult> => {
  const uid = requireAuth(request);
  const body = (request.data ?? {}) as { orderId?: unknown; paymentId?: unknown; signature?: unknown };
  if (!isRazorpayId(body.orderId, "order") || !isRazorpayId(body.paymentId, "pay")) throw new HttpsError("invalid-argument", "Payment details are missing.");
  // Not giftSalesOpen(): a payment already taken must still be confirmed if sales were paused meanwhile.
  if (!razorpayConfigured()) throw new HttpsError("failed-precondition", "Payments aren't available yet.");
  if (!validCheckoutSignature(body.orderId, body.paymentId, body.signature, process.env.RAZORPAY_KEY_SECRET)) {
    throw new HttpsError("permission-denied", "We couldn't verify that payment.");
  }
  const orderSnap = await db.doc(`giftOrders/${body.orderId}`).get();
  if (!orderSnap.exists || orderSnap.get("fromUid") !== uid) throw new HttpsError("not-found", "We couldn't find that order.");
  if (orderSnap.get("mode") !== razorpayMode(process.env.RAZORPAY_KEY_ID)) {
    throw new HttpsError("failed-precondition", "That order belongs to a different payment environment. Contact support if you were charged.");
  }

  // The signature proves Checkout returned this pair; Razorpay itself confirms the money moved.
  const payment = await razorpay<RazorpayPayment>(`/payments/${body.paymentId}`);
  const verdict = paymentMatchesOrder(payment, { orderId: body.orderId, amountPaise: orderSnap.get("amountPaise") });
  if (verdict === "mismatch" || payment.id !== body.paymentId) {
    throw new HttpsError("failed-precondition", "That payment doesn't match your order. Contact support if you were charged.");
  }
  if (verdict === "pending") return { status: "pending", giftId: body.orderId };
  await grantGift(body.orderId, body.paymentId);
  const status = (await db.doc(`giftOrders/${body.orderId}`).get()).get("status") as GiftOrderStatus;
  if (status === "paid") return { status: "paid", giftId: body.orderId };
  if (status === "rejected") throw new HttpsError("failed-precondition", "Test payments can't send gifts. Your payment is being refunded.", { reason: "test-payment" });
  if (status === "orphaned" || status === "refunded") {
    throw new HttpsError("failed-precondition", "This gift can't be delivered any more, so your payment is being refunded.", { reason: "refunded" });
  }
  return { status: "pending", giftId: body.orderId };
});

async function findGiftOrder(paymentId: unknown, orderId: unknown) {
  if (isRazorpayId(paymentId, "pay")) {
    const byPayment = await db.collection("giftOrders").where("paymentId", "==", paymentId).limit(1).get();
    if (!byPayment.empty) return byPayment.docs[0].ref;
  }
  if (isRazorpayId(orderId, "order")) {
    const ref = db.doc(`giftOrders/${orderId}`);
    if ((await ref.get()).exists) return ref;
  }
  return null;
}

/**
 * Minimal handling of a refund or a lost dispute on a gift payment (ruling R1).
 * Task 8 replaces this with reverseGift. An unclaimed (pending) gift is marked
 * refunded; a gift already claimed or declined is only flagged needsReview for
 * support. Events for another payment on the order (an extra we refunded) are
 * recorded on the side and change nothing. Returns false when it isn't a gift.
 */
export async function minimalGiftReversal(paymentId: unknown, orderId: unknown, event: string): Promise<boolean> {
  const ref = await findGiftOrder(paymentId, orderId);
  if (!ref) return false;
  const giftRef = db.doc(`gifts/${ref.id}`);
  const flagged = await db.runTransaction(async (tx) => {
    const [order, gift] = await tx.getAll(ref, giftRef);
    const now = Date.now();
    const note = { event, paymentId: typeof paymentId === "string" ? paymentId : null, at: now };
    const updatedAt = FieldValue.serverTimestamp();
    const paidWith = order.get("paymentId");
    if (typeof paidWith === "string" && paidWith !== paymentId) {
      tx.update(ref, { otherPaymentEvents: FieldValue.arrayUnion(note), updatedAt });
      return false;
    }
    if (!gift.exists) {
      // Never delivered: our own refund of an orphaned or rejected payment, or a refund that
      // arrived before the capture (the order is closed, so a late capture grants nothing).
      tx.update(ref, { ...(order.get("status") === "created" ? { status: "refunded", refundedAt: now } : {}), refundEvents: FieldValue.arrayUnion(note), updatedAt });
      return false;
    }
    if (gift.get("status") === "pending") {
      tx.update(giftRef, { status: "refunded", refundedAt: now });
      tx.update(ref, { status: "refunded", refundedAt: now, refundEvents: FieldValue.arrayUnion(note), updatedAt });
      return false;
    }
    if (gift.get("status") !== "refunded") tx.update(giftRef, { needsReview: true, needsReviewReason: event, needsReviewAt: now });
    tx.update(ref, { refundEvents: FieldValue.arrayUnion(note), updatedAt });
    return gift.get("status") !== "refunded";
  });
  if (flagged) logger.warn("Gift payment reversed after the gift was used; needs review", { giftId: ref.id, event });
  return true;
}

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    refund?: { entity?: { payment_id?: string } };
    dispute?: { entity?: { payment_id?: string } };
  };
};

/**
 * Razorpay → Dashboard → Webhooks: a second webhook (the Plus one is unchanged)
 * pointing at this URL with the secret stored as RAZORPAY_GIFT_WEBHOOK_SECRET;
 * events payment.captured, refund.processed, payment.dispute.created,
 * payment.dispute.lost, payment.dispute.won and payment.dispute.closed.
 * Orders that aren't gift orders are acknowledged and ignored.
 */
export const razorpayGiftWebhook = onRequest(
  { region: REGION, secrets: ["RAZORPAY_KEY_SECRET", "RAZORPAY_GIFT_WEBHOOK_SECRET", ...WEB_PUSH_SECRETS], timeoutSeconds: 60 },
  async (request, response) => {
    if (request.method !== "POST") {
      response.sendStatus(405);
      return;
    }
    if (!validWebhookSignature(request.rawBody, request.get("x-razorpay-signature"), process.env.RAZORPAY_GIFT_WEBHOOK_SECRET)) {
      response.sendStatus(401);
      return;
    }
    const body = request.body as WebhookPayload;
    const event = typeof body.event === "string" ? body.event : "";
    try {
      const eventPayment = body.payload?.payment?.entity;
      const paymentId = body.payload?.refund?.entity?.payment_id ?? body.payload?.dispute?.entity?.payment_id ?? eventPayment?.id;
      if (event === "payment.captured" && isRazorpayId(eventPayment?.id, "pay") && isRazorpayId(eventPayment?.order_id, "order")) {
        const order = await db.doc(`giftOrders/${eventPayment.order_id}`).get();
        if (order.exists && order.get("mode") === razorpayMode(process.env.RAZORPAY_KEY_ID)) {
          // Re-read the payment: events can arrive late, twice or out of order (e.g. after a refund).
          const payment = await razorpay<RazorpayPayment>(`/payments/${eventPayment.id}`);
          if (payment.id === eventPayment.id && paymentMatchesOrder(payment, { orderId: eventPayment.order_id, amountPaise: order.get("amountPaise") }) === "captured") {
            await grantGift(eventPayment.order_id, eventPayment.id);
          }
        }
      } else if (event === "refund.processed" || event === "payment.refunded" || event === "payment.dispute.lost") {
        await minimalGiftReversal(paymentId, eventPayment?.order_id, event);
      } else if (event.startsWith("payment.dispute.")) {
        logger.info("Gift webhook dispute update", { event, hasPayment: isRazorpayId(paymentId, "pay") });
      }
      response.sendStatus(200);
    } catch (error) {
      logger.error("Razorpay gift webhook failed", { event, error: String(error) });
      response.sendStatus(503);
    }
  }
);
