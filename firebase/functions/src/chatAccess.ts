import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { razorpayConfigured, syncPremium } from "./billing";
import { chatPolicy, syncChatAccess } from "./chatEntitlement";
import { CHAT_UNLOCK, REGION } from "./config";
import { requireAuth, requireReadAuth, isSupportSession } from "./lib/auth";
import { ChatAccessMirror, entitled, paidChatEnforced, razorpayMode, RazorpayMode, unlockPaymentVerdict, UnlockPayment, unlockReceipt } from "./lib/chatAccess";
import { checkoutHost } from "./lib/kraftai";
import { isRazorpayId, validCheckoutSignature } from "./lib/razorpay";
import { consumeDailyQuota } from "./quota";
import { razorpay } from "./razorpayClient";
import { verifiedUsers } from "./trust";
import { openUpiOrder, upiSalesOpen } from "./upiPayments";
import { openCcavenueOrder } from "./ccavenue";
import { ccavenueSalesOpen, upiVpa } from "./chatEntitlement";

/**
 * Unlimited Chat: ₹49 once, for the buyer's account only, unlocks sending in
 * every current and future mutual match. Server-only records:
 *
 * - chatUnlockOrders/{orderId}: every order and what became of it (the audit
 *   trail: uid, amount, currency, product, Razorpay mode, payment id, status).
 * - chatUnlocks/{uid}: the entitlement itself, one per account (the document
 *   id is the uid, so it can't be granted twice).
 * - chatUnlockCheckout/{uid}: the member's open checkout, so a second tab or a
 *   retry reuses the same order instead of taking a second payment.
 *
 * A redirect, a Checkout callback or a client write never unlocks anything:
 * access is granted only after Razorpay itself reports the payment captured
 * for this exact order, amount and currency, from confirmChatUnlock (signed
 * Checkout response) or the signed webhook, whichever comes first.
 */

const SECRETS = ["RAZORPAY_KEY_SECRET", "REVENUECAT_SECRET_KEY"];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const emulator = () => process.env.FUNCTIONS_EMULATOR === "true";

type OrderStatus = "created" | "paid" | "refunded" | "chargeback" | "duplicate" | "orphaned" | "rejected";
type UnlockOrder = {
  uid: string;
  product: string;
  amountPaise: number;
  currency: string;
  mode: RazorpayMode;
  status: OrderStatus;
  paymentId?: string;
};

/** The Razorpay environment the server is configured for, if it may sell Unlimited Chat at all. */
function sellingMode(): RazorpayMode | null {
  const mode = razorpayMode(process.env.RAZORPAY_KEY_ID);
  if (mode === "live") return process.env.MUSE_CHAT_UNLOCK_LIVE === "true" ? "live" : null;
  if (mode === "test") return process.env.MUSE_BILLING_SANDBOX === "true" ? "test" : null;
  return null;
}

/** New Unlimited Chat checkouts can open (payments already taken are always confirmed). */
async function salesOpen(): Promise<boolean> {
  return process.env.MUSE_CHAT_UNLOCK_ENABLED === "true" && razorpayConfigured() && sellingMode() !== null && (await chatPolicy()).unlockSales;
}

/** Test-mode money isn't real: outside the emulator it can only unlock shared test-cohort accounts. */
function testModeAllowedFor(mode: RazorpayMode, cohort: unknown): boolean {
  return mode === "live" || emulator() || cohort === "test";
}

/** The offer appears only after a real mutual match (one the server created). */
async function hasHadMatch(uid: string): Promise<boolean> {
  return !(await db.collection("matches").where("participants", "array-contains", uid).limit(1).get()).empty;
}

export type UnlockOffer = {
  status: "owned" | "available" | "pending" | "unavailable";
  priceInr: number;
  reason?: "sales-off" | "no-match" | "verification-required" | "account";
  /** How it can be paid right now: Razorpay Checkout, UPI into Paire's own account, and/or CCAvenue. */
  methods: Array<"razorpay" | "upi" | "ccavenue">;
  /** A UPI payment waiting for confirmation (the member has entered its UTR). */
  upiPending?: boolean;
  /** A CCAvenue payment the bank is still confirming ("Check payment status" asks CCAvenue). */
  ccavenuePending?: boolean;
};

async function unlockOffer(uid: string, access: ChatAccessMirror | null): Promise<UnlockOffer> {
  const priceInr = CHAT_UNLOCK.amountPaise / 100;
  const methods: UnlockOffer["methods"] = [
    ...((await salesOpen()) ? ["razorpay" as const] : []),
    ...((await upiSalesOpen()) ? ["upi" as const] : []),
    ...((await ccavenueSalesOpen()) ? ["ccavenue" as const] : [])
  ];
  if (access?.unlimited) return { status: "owned", priceInr, methods };
  const checkout = await db.doc(`chatUnlockCheckout/${uid}`).get();
  if (checkout.get("state") === "pending" && Date.now() - (Number(checkout.get("updatedAt")) || 0) < CHAT_UNLOCK.checkoutReuseMs) return { status: "pending", priceInr, methods };
  // Even after direct UPI gives way to CCAvenue, a UPI payment already submitted is still being confirmed.
  const upiOrder = methods.includes("upi") || upiVpa() ? await openUpiOrder(uid) : null;
  if (upiOrder?.get("status") === "submitted") return { status: "pending", priceInr, methods, upiPending: true };
  // Any open CCAvenue order the bank is still confirming, even if sales were paused since.
  const ccavenueOrder = await openCcavenueOrder(uid, "chat");
  if (ccavenueOrder?.get("awaiting") === true) return { status: "pending", priceInr, methods, ccavenuePending: true };
  if (!access) return { status: "unavailable", priceInr, methods, reason: "account" };
  if (!methods.length) return { status: "unavailable", priceInr, methods, reason: "sales-off" };
  if (!(await hasHadMatch(uid))) return { status: "unavailable", priceInr, methods, reason: "no-match" };
  if (!(await verifiedUsers([uid])).has(uid)) return { status: "unavailable", priceInr, methods, reason: "verification-required" };
  return { status: "available", priceInr, methods };
}

export type ChatAccessStatus = {
  /** The sending gate is on right now. */
  enforced: boolean;
  /** An announced start date for the gate, while it is still in the future. */
  enforceFrom: number | null;
  /** Chats created before this keep sending free until legacyGraceUntil. */
  legacyCutoff: number | null;
  legacyGraceUntil: number | null;
  /** The member's own entitlement (Unlimited Chat or a running Plus pass). */
  canSend: boolean;
  unlimited: boolean;
  premiumUntil: number | null;
  unlock: UnlockOffer;
  serverNow: number;
};

/** Authoritative state for the app: never trusts anything the client says. */
export async function chatAccessStatus(uid: string, readOnly = false): Promise<ChatAccessStatus> {
  const billing = await db.doc(`billing/${uid}`).get();
  const fresh = typeof billing.get("checkedAt") === "number" && Date.now() - billing.get("checkedAt") < 5 * 60_000;
  // syncPremium also refreshes the chat mirror; otherwise refresh it here.
  if (!fresh && !readOnly) await syncPremium(uid).catch(() => null);
  const cached = readOnly ? await db.doc(`moderation/${uid}`).get() : null;
  const access = cached ? (cached.get("chatAccess") as ChatAccessMirror | undefined) ?? null : await syncChatAccess(uid);
  const policy = await chatPolicy();
  const now = Date.now();
  const graceOpen = policy.enforceFrom > 0 && policy.legacyGraceUntil > now;
  return {
    enforced: paidChatEnforced(policy, now),
    enforceFrom: policy.enforcePaidChat && policy.enforceFrom > now ? policy.enforceFrom : null,
    legacyCutoff: graceOpen ? policy.enforceFrom : null,
    legacyGraceUntil: graceOpen ? policy.legacyGraceUntil : null,
    canSend: entitled(access ?? undefined, now),
    unlimited: access?.unlimited === true,
    premiumUntil: access && access.premiumUntil > now ? access.premiumUntil : null,
    unlock: await unlockOffer(uid, access),
    serverNow: now
  };
}

export const getChatAccess = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request): Promise<ChatAccessStatus> => {
  const uid = await requireReadAuth(request);
  await consumeDailyQuota(isSupportSession(request) ? request.auth!.uid : uid, "chatAccessChecks", CHAT_UNLOCK.accessChecksPerDay);
  // "Check payment status": settle an open or settling checkout with Razorpay first.
  if (!isSupportSession(request) && (request.data as { reconcile?: unknown } | null)?.reconcile === true && razorpayConfigured()) await reconcileCheckout(uid);
  return chatAccessStatus(uid, isSupportSession(request));
});

type RefundResult = { id?: string };

/** Returns money for a payment that must not (or can no longer) buy anything. */
async function refundPayment(orderId: string, paymentId: string, reason: string): Promise<void> {
  const ref = db.doc(`chatUnlockOrders/${orderId}`);
  // A second payment on an order that's already paid is recorded on the side, never over the paid one.
  const extra = reason === "second-payment-on-paid-order";
  try {
    const refund = await razorpay<RefundResult>(`/payments/${paymentId}/refund`, {
      method: "POST",
      body: { amount: CHAT_UNLOCK.amountPaise, speed: "normal", notes: { reason, product: CHAT_UNLOCK.product } }
    });
    await ref.update(extra
      ? { extraRefunds: FieldValue.arrayUnion({ paymentId, refundId: refund.id ?? null, at: Date.now() }) }
      : { refundRequestedAt: Date.now(), refundId: refund.id ?? null, refundReason: reason });
  } catch (error) {
    // Left for support: the order stays marked, so it's easy to find and refund by hand.
    logger.error("Unlimited Chat refund failed", { orderId, reason, error: String(error) });
    await ref.update(extra
      ? { extraRefundErrors: FieldValue.arrayUnion({ paymentId, error: String(error).slice(0, 300), at: Date.now() }) }
      : { refundError: String(error).slice(0, 300), refundReason: reason });
  }
}

export type GrantOutcome = "granted" | "duplicate" | "extra" | "orphaned" | "rejected" | "unknown" | "closed";

/**
 * Grants Unlimited Chat for a payment Razorpay reported captured, exactly once.
 * Idempotent across retries, delayed and duplicate webhooks and the Checkout
 * confirmation. A second payment for an account that already owns it, or a
 * payment for a deleted account, is refunded instead.
 */
export async function grantChatUnlock(orderId: string, payment: UnlockPayment): Promise<{ outcome: GrantOutcome; uid: string | null }> {
  const orderRef = db.doc(`chatUnlockOrders/${orderId}`);
  const paymentId = typeof payment.id === "string" ? payment.id : "";
  let uid: string | null = null;
  const outcome = await db.runTransaction(async (tx): Promise<GrantOutcome> => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return "unknown";
    const order = orderSnap.data() as UnlockOrder;
    uid = order.uid;
    const captured = isRazorpayId(paymentId, "pay") && unlockPaymentVerdict(payment, { orderId, amountPaise: order.amountPaise, currency: order.currency }) === "captured";
    if (order.status === "paid") {
      if (order.paymentId === paymentId) return "granted";
      // Razorpay can capture a second attempt on an order that's already paid: money back, nothing changes.
      if (!captured || ((orderSnap.get("extraPaymentIds") as string[] | undefined) ?? []).includes(paymentId)) return "closed";
      tx.update(orderRef, { extraPaymentIds: FieldValue.arrayUnion(paymentId), updatedAt: FieldValue.serverTimestamp() });
      return "extra";
    }
    if (order.status !== "created" || !captured) return "closed";
    const [unlock, user, moderation] = await tx.getAll(db.doc(`chatUnlocks/${order.uid}`), db.doc(`users/${order.uid}`), db.doc(`moderation/${order.uid}`));
    const now = Date.now();
    const record = { paymentId, updatedAt: FieldValue.serverTimestamp() };
    if (!user.exists) {
      tx.update(orderRef, { ...record, status: "orphaned" });
      return "orphaned";
    }
    if (!testModeAllowedFor(order.mode, moderation.get("cohort"))) {
      tx.update(orderRef, { ...record, status: "rejected", rejectedReason: "test-mode-payment-for-real-account" });
      return "rejected";
    }
    if (unlock.get("status") === "active") {
      tx.update(orderRef, { ...record, status: unlock.get("orderId") === orderId ? "paid" : "duplicate" });
      return unlock.get("orderId") === orderId ? "granted" : "duplicate";
    }
    tx.set(db.doc(`chatUnlocks/${order.uid}`), {
      status: "active",
      product: CHAT_UNLOCK.product,
      orderId,
      paymentId,
      amountPaise: order.amountPaise,
      currency: order.currency,
      mode: order.mode,
      source: "razorpay",
      grantedAt: now,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.update(orderRef, { ...record, status: "paid", paidAt: now });
    tx.set(db.doc(`chatUnlockCheckout/${order.uid}`), { state: "done", orderId, updatedAt: now });
    return "granted";
  });
  if (outcome === "duplicate" || outcome === "orphaned" || outcome === "extra") {
    await refundPayment(orderId, paymentId, outcome === "duplicate" ? "already-owned" : outcome === "orphaned" ? "account-deleted" : "second-payment-on-paid-order");
  }
  if (uid && outcome !== "unknown") await syncChatAccess(uid);
  if (outcome !== "granted" && outcome !== "closed") logger.info("Unlimited Chat payment not granted", { orderId, outcome });
  return { outcome, uid };
}

async function findOrder(paymentId: unknown, orderId: unknown) {
  if (isRazorpayId(paymentId, "pay")) {
    const byPayment = await db.collection("chatUnlockOrders").where("paymentId", "==", paymentId).limit(1).get();
    if (!byPayment.empty) return byPayment.docs[0].ref;
  }
  if (isRazorpayId(orderId, "order")) {
    const ref = db.doc(`chatUnlockOrders/${orderId}`);
    if ((await ref.get()).exists) return ref;
  }
  return null;
}

/**
 * A refund or a lost chargeback ends the unlock it paid for (never a separate
 * Plus pass, and never an unlock bought with a different payment). Returns
 * false when the payment isn't an Unlimited Chat payment.
 */
export async function revokeChatUnlock(paymentId: unknown, orderId: unknown, reason: "refund" | "chargeback"): Promise<boolean> {
  const ref = await findOrder(paymentId, orderId);
  if (!ref) return false;
  let uid: string | null = null;
  await db.runTransaction(async (tx) => {
    const order = await tx.get(ref);
    uid = order.get("uid") as string;
    const unlockRef = db.doc(`chatUnlocks/${uid}`);
    const unlock = await tx.get(unlockRef);
    const now = Date.now();
    const paidWith = order.get("paymentId");
    // Found by order id, but the refund is for a different payment on it (an extra attempt we
    // refunded, or an unknown one): record it, never revoke what the paid payment bought.
    if (typeof paidWith === "string" && paidWith !== paymentId) {
      tx.update(ref, { otherPaymentEvents: FieldValue.arrayUnion({ paymentId: typeof paymentId === "string" ? paymentId : null, reason, at: now }), updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    tx.update(ref, { status: reason === "chargeback" ? "chargeback" : "refunded", [reason === "chargeback" ? "chargebackAt" : "refundedAt"]: now, updatedAt: FieldValue.serverTimestamp() });
    if (unlock.get("status") === "active" && unlock.get("orderId") === ref.id) {
      tx.update(unlockRef, { status: "revoked", revokedAt: now, revokedReason: reason, updatedAt: FieldValue.serverTimestamp() });
    }
  });
  if (uid) await syncChatAccess(uid);
  return true;
}

/** Disputes: flagged while open; a lost dispute is a chargeback. */
export async function disputeChatUnlock(paymentId: unknown, orderId: unknown, event: string): Promise<boolean> {
  if (event === "payment.dispute.lost") return revokeChatUnlock(paymentId, orderId, "chargeback");
  const ref = await findOrder(paymentId, orderId);
  if (!ref) return false;
  // Only a dispute about the payment that bought the unlock flags it.
  if ((await ref.get()).get("paymentId") === paymentId) {
    await ref.update({ disputed: event === "payment.dispute.created", disputeEvent: event, updatedAt: FieldValue.serverTimestamp() });
  }
  return true;
}

type RazorpayOrder = { id?: string; status?: string; amount?: number; currency?: string };
type CheckoutPayload = { orderId: string; amount: number; currency: string; keyId: string | undefined; name: string; description: string; email: string | null; hostedUrl: string | null };
type CreateResult = { status: "checkout"; checkout: CheckoutPayload } | { status: "owned" } | { status: "pending" };

const checkoutPayload = (orderId: string, email: string | null): CheckoutPayload => ({
  orderId,
  amount: CHAT_UNLOCK.amountPaise,
  currency: CHAT_UNLOCK.currency,
  keyId: process.env.RAZORPAY_KEY_ID,
  description: CHAT_UNLOCK.razorpayLabel,
  email,
  // name, and hostedUrl when Checkout opens on kraftai.in (lib/kraftai.ts).
  ...checkoutHost(orderId)
});

/**
 * Settles the member's open checkout from earlier (another tab, a closed
 * window, a UPI payment still settling) against Razorpay: "owned" if it was
 * paid (and is now granted), "pending" while a payment is still settling,
 * "reusable" when the same order can be reopened, or "none".
 */
export async function reconcileCheckout(uid: string): Promise<{ state: "owned" | "pending" | "reusable" | "none"; orderId?: string }> {
  const checkoutRef = db.doc(`chatUnlockCheckout/${uid}`);
  const checkout = await checkoutRef.get();
  const orderId = checkout.get("orderId");
  const updatedAt = Number(checkout.get("updatedAt")) || 0;
  if (!["open", "pending"].includes(checkout.get("state")) || !isRazorpayId(orderId, "order")) return { state: "none" };
  const order = await db.doc(`chatUnlockOrders/${orderId}`).get();
  if (!order.exists || order.get("mode") !== razorpayMode(process.env.RAZORPAY_KEY_ID)) return { state: "none" };
  if (order.get("status") === "paid") return { state: "owned", orderId };
  if (order.get("status") !== "created") return { state: "none" };
  const remote = await razorpay<RazorpayOrder>(`/orders/${orderId}`);
  if (remote.status !== "created") {
    const payments = await razorpay<{ items?: UnlockPayment[] }>(`/orders/${orderId}/payments`);
    let pending = false;
    for (const payment of payments.items ?? []) {
      const verdict = unlockPaymentVerdict(payment, { orderId, amountPaise: order.get("amountPaise"), currency: order.get("currency") });
      if (verdict === "captured" && (await grantChatUnlock(orderId, payment)).outcome === "granted") return { state: "owned", orderId };
      if (verdict === "pending") pending = true;
    }
    if (pending || remote.status === "paid") {
      await checkoutRef.set({ state: "pending", orderId, updatedAt: Date.now() });
      return { state: "pending", orderId };
    }
  }
  // Nothing settling: the same order can be paid (a stale one is replaced).
  if (Date.now() - updatedAt > CHAT_UNLOCK.checkoutReuseMs) return { state: "none" };
  if (checkout.get("state") === "pending") await checkoutRef.set({ state: "open", orderId, updatedAt });
  return { state: "reusable", orderId };
}

export const createChatUnlockOrder = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request): Promise<CreateResult> => {
  const uid = requireAuth(request);
  if (!(await salesOpen())) throw new HttpsError("failed-precondition", "Unlimited Chat isn't available yet. You haven't been charged.", { reason: "sales-off" });
  await consumeDailyQuota(uid, "chatUnlockOrders", CHAT_UNLOCK.ordersPerDay);
  const mode = sellingMode()!;
  const [user, moderation, unlock] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`), db.doc(`chatUnlocks/${uid}`));
  if (!user.exists) throw new HttpsError("failed-precondition", "Finish creating your profile first.");
  if (moderation.get("status") === "banned") throw new HttpsError("permission-denied", "This account is unavailable. Contact support for help.");
  if (!testModeAllowedFor(mode, moderation.get("cohort"))) throw new HttpsError("failed-precondition", "Test payments are only for test accounts.");
  if (unlock.get("status") === "active") {
    await syncChatAccess(uid);
    return { status: "owned" };
  }
  if (!(await hasHadMatch(uid))) throw new HttpsError("failed-precondition", "Unlimited Chat opens up once you have a mutual match.", { reason: "no-match" });
  if (!(await verifiedUsers([uid])).has(uid)) throw new HttpsError("failed-precondition", "Verify your photos first, so you can use it straight away.", { reason: "verification-required" });
  const email = (request.auth?.token.email as string | undefined) ?? null;

  const checkoutRef = db.doc(`chatUnlockCheckout/${uid}`);
  const seenOrder = (await checkoutRef.get()).get("orderId") ?? null;
  const previous = await reconcileCheckout(uid);
  if (previous.state === "owned" || previous.state === "pending") return { status: previous.state };
  if (previous.state === "reusable" && sellingMode() === razorpayMode(process.env.RAZORPAY_KEY_ID)) {
    return { status: "checkout", checkout: checkoutPayload(previous.orderId!, email) };
  }

  // One checkout at a time: a second tab waits instead of creating a second order, and an
  // order another tab opened since we looked is reused on the next try, not replaced.
  await db.runTransaction(async (tx) => {
    const checkout = await tx.get(checkoutRef);
    const state = checkout.get("state");
    if ((state === "creating" && Date.now() - (Number(checkout.get("updatedAt")) || 0) < CHAT_UNLOCK.creatingLockMs) ||
      ((state === "open" || state === "pending") && (checkout.get("orderId") ?? null) !== seenOrder)) {
      throw new HttpsError("aborted", "Checkout is already opening in another window. Try again in a moment.");
    }
    tx.set(checkoutRef, { state: "creating", updatedAt: Date.now() });
  });

  let order: RazorpayOrder;
  try {
    order = await razorpay<RazorpayOrder>("/orders", {
      method: "POST",
      body: {
        amount: CHAT_UNLOCK.amountPaise,
        currency: CHAT_UNLOCK.currency,
        receipt: unlockReceipt(hash(uid), Date.now()),
        notes: { product: CHAT_UNLOCK.product, uid }
      }
    });
    if (!isRazorpayId(order.id, "order") || order.amount !== CHAT_UNLOCK.amountPaise || order.currency !== CHAT_UNLOCK.currency) {
      throw new HttpsError("unavailable", "The payment service returned an unexpected order. Please try again.");
    }
  } catch (error) {
    await checkoutRef.delete();
    throw error;
  }
  const now = Date.now();
  const batch = db.batch();
  batch.set(db.doc(`chatUnlockOrders/${order.id}`), {
    uid,
    product: CHAT_UNLOCK.product,
    amountPaise: CHAT_UNLOCK.amountPaise,
    currency: CHAT_UNLOCK.currency,
    mode,
    status: "created",
    createdAt: now,
    updatedAt: FieldValue.serverTimestamp()
  });
  batch.set(checkoutRef, { state: "open", orderId: order.id, updatedAt: now });
  await batch.commit();
  return { status: "checkout", checkout: checkoutPayload(order.id, email) };
});

export type ConfirmResult = { status: "owned" | "pending"; access: ChatAccessStatus };

export const confirmChatUnlock = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request): Promise<ConfirmResult> => {
  const uid = requireAuth(request);
  const body = (request.data ?? {}) as { orderId?: unknown; paymentId?: unknown; signature?: unknown };
  if (!isRazorpayId(body.orderId, "order") || !isRazorpayId(body.paymentId, "pay")) throw new HttpsError("invalid-argument", "Payment details are missing.");
  // Not salesOpen(): a payment already taken must still be confirmed if sales were paused meanwhile.
  if (!razorpayConfigured()) throw new HttpsError("failed-precondition", "Payments aren't available yet.");
  if (!validCheckoutSignature(body.orderId, body.paymentId, body.signature, process.env.RAZORPAY_KEY_SECRET)) {
    throw new HttpsError("permission-denied", "We couldn't verify that payment.");
  }
  const order = await db.doc(`chatUnlockOrders/${body.orderId}`).get();
  if (!order.exists || order.get("uid") !== uid) throw new HttpsError("not-found", "We couldn't find that order.");
  if (order.get("mode") !== razorpayMode(process.env.RAZORPAY_KEY_ID)) throw new HttpsError("failed-precondition", "That order belongs to a different payment environment. Contact support if you were charged.");

  // The signature proves Checkout returned this pair; Razorpay itself confirms the money moved.
  const payment = await razorpay<UnlockPayment>(`/payments/${body.paymentId}`);
  const verdict = unlockPaymentVerdict(payment, { orderId: body.orderId, amountPaise: order.get("amountPaise"), currency: order.get("currency") });
  if (verdict === "mismatch" || payment.id !== body.paymentId) throw new HttpsError("failed-precondition", "That payment doesn't match your order. Contact support if you were charged.");
  if (verdict === "pending") {
    await db.doc(`chatUnlockCheckout/${uid}`).set({ state: "pending", orderId: body.orderId, updatedAt: Date.now() });
    return { status: "pending", access: await chatAccessStatus(uid) };
  }
  const { outcome } = await grantChatUnlock(body.orderId, payment);
  const access = await chatAccessStatus(uid);
  if (outcome === "rejected") throw new HttpsError("failed-precondition", "Test payments can't unlock this account.");
  return { status: access.unlimited ? "owned" : "pending", access };
});

/** Razorpay webhook events for Unlimited Chat orders. Returns false when the event isn't about one. */
export async function handleChatUnlockWebhook(event: string, paymentId: unknown, orderId: unknown): Promise<boolean> {
  if (event === "payment.captured") {
    if (!isRazorpayId(orderId, "order") || !isRazorpayId(paymentId, "pay")) return false;
    const order = await db.doc(`chatUnlockOrders/${orderId}`).get();
    if (!order.exists) return false;
    if (order.get("mode") !== razorpayMode(process.env.RAZORPAY_KEY_ID)) return true;
    // Re-read the payment: events can arrive late, twice or out of order (e.g. after a refund).
    const payment = await razorpay<UnlockPayment>(`/payments/${paymentId}`);
    if (payment.order_id === orderId) await grantChatUnlock(orderId, payment);
    return true;
  }
  if (event === "refund.processed" || event === "payment.refunded") return revokeChatUnlock(paymentId, orderId, "refund");
  if (event.startsWith("payment.dispute.")) return disputeChatUnlock(paymentId, orderId, event);
  return false;
}
