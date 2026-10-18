import { randomInt } from "crypto";
import { DocumentSnapshot, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import QRCode from "qrcode";
import { db } from "./admin";
import { billingEnabled, storeExpiryIfEnabled, syncPremium, webPassExpiry } from "./billing";
import { syncChatAccess, upiSalesOpen, upiVpa } from "./chatEntitlement";
import { isPlusPlan, passDays, passWindow, PLUS_PASSES, PlusPlan, plusPricePaise } from "./lib/razorpay";
import { CHAT_UNLOCK, REGION } from "./config";
import { requireAuth, requireReadAuth } from "./lib/auth";
import { consumeDailyQuota } from "./quota";
import { photoVerified, verifiedUsers } from "./trust";

/**
 * Unlimited Chat paid by UPI straight into Paire's own account (MUSE_UPI_VPA),
 * with no payment gateway. A UPI payment can't be confirmed automatically
 * without the bank's merchant API, so:
 *
 * 1. createUpiUnlockOrder gives the member a unique amount (₹49.01–₹49.99) and a
 *    reference, as a UPI link and QR code for their own order.
 * 2. After paying, the member taps "I've paid" (the 12-digit UPI reference,
 *    UTR, is optional: the unique amount already identifies the payment).
 * 3. A moderator checks the payment arrived in the bank statement (the exact
 *    amount, and the UTR if given) and approves it; only then is it unlocked.
 *
 * Records (server-only): upiUnlockOrders/{orderId}, upiUtrs/{utr} (one use per
 * UTR across all accounts), upiSlots/{amountPaise} (keeps open amounts unique).
 */

const ORDER_PAY_WINDOW_MS = 48 * 60 * 60_000;
const ORDER_ID = /^[A-Z0-9]{8}$/;
const UTR = /^[0-9]{12}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type UpiStatus = "awaiting_payment" | "submitted" | "approved" | "rejected" | "expired" | "revoked";

const payeeName = () => (process.env.MUSE_UPI_PAYEE_NAME?.trim() || "Paire").slice(0, 50);

export { upiSalesOpen };

type Kind = "chat" | "plus";
const kindOf = (doc: DocumentSnapshot): Kind => (doc.get("kind") === "plus" ? "plus" : "chat");

/** What an order buys, for people: "Unlimited Chat" or "Paire Plus · 7 days". */
const productLabel = (doc: DocumentSnapshot) => (kindOf(doc) === "plus" ? PLUS_PASSES[doc.get("plan") as PlusPlan]?.label ?? "Paire Plus" : "Unlimited Chat");

/** The member's newest UPI order of this kind that's still open (waiting for payment or for review). */
export async function openUpiOrder(uid: string, kind: Kind = "chat") {
  const snap = await db.collection("upiUnlockOrders").where("uid", "==", uid).where("status", "in", ["awaiting_payment", "submitted"]).get();
  const now = Date.now();
  const open = snap.docs
    .filter((doc) => kindOf(doc) === kind)
    .filter((doc) => doc.get("status") === "submitted" || (Number(doc.get("createdAt")) || 0) + ORDER_PAY_WINDOW_MS > now)
    .sort((a, b) => (Number(b.get("createdAt")) || 0) - (Number(a.get("createdAt")) || 0));
  return open[0] ?? null;
}

const newOrderId = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

function upiLink(vpa: string, amountPaise: number, orderId: string, kind: Kind): string {
  const params = new URLSearchParams({ pa: vpa, pn: payeeName(), am: (amountPaise / 100).toFixed(2), cu: "INR", tn: `${kind === "plus" ? "Paire Plus" : "Paire chat"} ${orderId}` });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

export type UpiOrderView = {
  orderId: string;
  kind: Kind;
  product: string;
  status: UpiStatus;
  amountPaise: number;
  amountLabel: string;
  vpa: string;
  payeeName: string;
  upiLink: string;
  qrDataUrl: string;
  expiresAt: number;
  utr: string | null;
};

async function viewOf(doc: DocumentSnapshot): Promise<UpiOrderView> {
  const vpa = String(doc.get("vpa"));
  const amountPaise = Number(doc.get("amountPaise"));
  const link = upiLink(vpa, amountPaise, doc.id, kindOf(doc));
  return {
    orderId: doc.id,
    kind: kindOf(doc),
    product: productLabel(doc),
    status: doc.get("status"),
    amountPaise,
    amountLabel: `₹${(amountPaise / 100).toFixed(2)}`,
    vpa,
    payeeName: payeeName(),
    upiLink: link,
    qrDataUrl: await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" }),
    expiresAt: (Number(doc.get("createdAt")) || 0) + ORDER_PAY_WINDOW_MS,
    utr: (doc.get("utr") as string | undefined) ?? null
  };
}

/** Holds a free amount (the price plus 1–99 paise) for this order, so it's easy to find in the bank statement. */
async function reserveAmount(orderId: string, basePaise: number, now: number): Promise<number> {
  const candidates = Array.from(new Set(Array.from({ length: 12 }, () => basePaise + 1 + randomInt(99))));
  return db.runTransaction(async (tx) => {
    const slots = await tx.getAll(...candidates.map((amount) => db.doc(`upiSlots/${amount}`)));
    const free = candidates.find((_, index) => !slots[index].exists || (Number(slots[index].get("until")) || 0) < now);
    // All taken (very busy): any amount works; the reference and UTR still identify the payment.
    const amount = free ?? candidates[0];
    tx.set(db.doc(`upiSlots/${amount}`), { orderId, until: now + ORDER_PAY_WINDOW_MS });
    return amount;
  });
}

/**
 * Starts (or reopens) a UPI order: Unlimited Chat by default, or a Paire Plus
 * pass with `plan` ("day" | "week" | "month"). The server sets the price.
 */
export const createUpiUnlockOrder = onCall({ region: REGION, secrets: ["REVENUECAT_SECRET_KEY", "RAZORPAY_KEY_SECRET"], timeoutSeconds: 30 }, async (request): Promise<{ status: "owned" } | { status: "order"; order: UpiOrderView }> => {
  const uid = requireAuth(request);
  const plan = (request.data as { plan?: unknown } | null)?.plan;
  if (plan !== undefined && !isPlusPlan(plan)) throw new HttpsError("invalid-argument", "Choose a 1-day, 7-day or 30-day pass.");
  const kind: Kind = plan ? "plus" : "chat";
  const vpa = upiVpa();
  if (!vpa || !(await upiSalesOpen()) || (kind === "plus" && !billingEnabled())) throw new HttpsError("failed-precondition", "UPI payments aren't available right now. You haven't been charged.", { reason: "sales-off" });
  const [user, moderation, unlock] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`), db.doc(`chatUnlocks/${uid}`));
  if (!user.exists) throw new HttpsError("failed-precondition", "Finish creating your profile first.");
  if (moderation.get("status") === "banned") throw new HttpsError("permission-denied", "This account is unavailable. Contact support for help.");
  if (kind === "chat" && unlock.get("status") === "active") {
    await syncChatAccess(uid);
    return { status: "owned" };
  }
  // One open order of each kind at a time: reopening shows the same amount and QR, never a second charge.
  const open = await openUpiOrder(uid, kind);
  if (open) return { status: "order", order: await viewOf(open) };
  await consumeDailyQuota(uid, "upiUnlockOrders", CHAT_UNLOCK.ordersPerDay);
  if (kind === "chat" && (await db.collection("matches").where("participants", "array-contains", uid).limit(1).get()).empty) {
    throw new HttpsError("failed-precondition", "Unlimited Chat opens up once you have a mutual match.", { reason: "no-match" });
  }
  if (kind === "plus" && (await syncPremium(uid)).active) throw new HttpsError("failed-precondition", "Your Plus pass is already active.");
  if (!(await verifiedUsers([uid])).has(uid)) throw new HttpsError("failed-precondition", "Verify your photos first, so you can use it straight away.", { reason: "verification-required" });

  const now = Date.now();
  let orderId = newOrderId();
  while ((await db.doc(`upiUnlockOrders/${orderId}`).get()).exists) orderId = newOrderId();
  const base = kind === "plus" ? plusPricePaise(plan as PlusPlan, await photoVerified(uid)) : CHAT_UNLOCK.amountPaise;
  const amountPaise = await reserveAmount(orderId, base, now);
  const ref = db.doc(`upiUnlockOrders/${orderId}`);
  await ref.set({
    uid,
    kind,
    ...(kind === "plus" ? { plan, product: "paire_plus" } : { product: CHAT_UNLOCK.product }),
    amountPaise,
    currency: "INR",
    vpa,
    status: "awaiting_payment",
    createdAt: now,
    updatedAt: FieldValue.serverTimestamp()
  });
  return { status: "order", order: await viewOf(await ref.get()) };
});

export const submitUpiPayment = onCall({ region: REGION }, async (request): Promise<{ status: "submitted"; order: UpiOrderView }> => {
  const uid = requireAuth(request);
  const { orderId, utr } = (request.data ?? {}) as { orderId?: unknown; utr?: unknown };
  const cleanUtr = typeof utr === "string" ? utr.replace(/\s+/g, "") : "";
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) throw new HttpsError("invalid-argument", "That order isn't valid.");
  // The UTR is optional: the unique amount (paise included) already identifies the payment.
  if (cleanUtr && !UTR.test(cleanUtr)) throw new HttpsError("invalid-argument", "A UPI reference (UTR) has 12 digits. Leave it empty if you don't have it.");
  await consumeDailyQuota(uid, "upiSubmissions", 20);
  const ref = db.doc(`upiUnlockOrders/${orderId}`);
  await db.runTransaction(async (tx) => {
    const [order, used] = cleanUtr ? await tx.getAll(ref, db.doc(`upiUtrs/${cleanUtr}`)) : [await tx.get(ref), null];
    if (!order.exists || order.get("uid") !== uid) throw new HttpsError("not-found", "We couldn't find that order.");
    if (order.get("status") === "submitted" && (order.get("utr") ?? "") === cleanUtr) return;
    if (order.get("status") !== "awaiting_payment" && order.get("status") !== "submitted") throw new HttpsError("failed-precondition", "This order is closed. Contact support if you paid.");
    if (used?.exists && used.get("orderId") !== orderId) throw new HttpsError("already-exists", "That UPI reference has already been used. Check the number, or contact support.");
    const previous = order.get("utr") as string | undefined;
    if (previous && previous !== cleanUtr) tx.delete(db.doc(`upiUtrs/${previous}`));
    if (cleanUtr) tx.set(db.doc(`upiUtrs/${cleanUtr}`), { orderId, uid, at: Date.now() });
    tx.update(ref, { status: "submitted", utr: cleanUtr || null, submittedAt: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { status: "submitted", order: await viewOf(await ref.get()) };
});

/** The member's open UPI order (`kind`: "chat", default, or "plus"), for showing its state in the app. */
export const getUpiUnlockOrder = onCall({ region: REGION }, async (request): Promise<{ order: UpiOrderView | null }> => {
  const uid = await requireReadAuth(request);
  const open = await openUpiOrder(uid, (request.data as { kind?: unknown } | null)?.kind === "plus" ? "plus" : "chat");
  return { order: open ? await viewOf(open) : null };
});

function requireModerator(request: CallableRequest<unknown>): string {
  const uid = requireAuth(request);
  if (request.auth?.token.moderator !== true) throw new HttpsError("permission-denied", "Moderator access is required.");
  return uid;
}

export type UpiReviewItem = { orderId: string; product: string; status: UpiStatus; amountLabel: string; utr: string | null; memberName: string; submittedAt: number | null; createdAt: number };

/** Payments waiting for a moderator: check each against the bank statement (amount + UTR). */
export const getUpiReviewQueue = onCall({ region: REGION }, async (request): Promise<{ items: UpiReviewItem[] }> => {
  requireModerator(request);
  const snap = await db.collection("upiUnlockOrders").where("status", "==", "submitted").limit(100).get();
  const users = snap.empty ? [] : await db.getAll(...snap.docs.map((doc) => db.doc(`users/${doc.get("uid")}`)));
  const items = snap.docs.map((doc, index) => ({
    orderId: doc.id,
    product: productLabel(doc),
    status: doc.get("status") as UpiStatus,
    amountLabel: `₹${(Number(doc.get("amountPaise")) / 100).toFixed(2)}`,
    utr: (doc.get("utr") as string | undefined) ?? null,
    memberName: (users[index]?.get("displayName") as string | undefined) ?? "Deleted account",
    submittedAt: (doc.get("submittedAt") as number | undefined) ?? null,
    createdAt: Number(doc.get("createdAt")) || 0
  }));
  items.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
  return { items };
});

/**
 * approve: the payment is in the bank statement with this amount and UTR → unlock.
 * reject: no such payment (or wrong amount) → nothing unlocked; the member can resubmit.
 * revoke: undo an approval after a refund or reversal (refund the money by hand).
 */
export const reviewUpiPayment = onCall({ region: REGION, secrets: ["REVENUECAT_SECRET_KEY", "RAZORPAY_KEY_SECRET"] }, async (request): Promise<{ status: UpiStatus }> => {
  const moderator = requireModerator(request);
  const { orderId, decision, note } = (request.data ?? {}) as { orderId?: unknown; decision?: unknown; note?: unknown };
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) throw new HttpsError("invalid-argument", "That order isn't valid.");
  if (decision !== "approve" && decision !== "reject" && decision !== "revoke") throw new HttpsError("invalid-argument", "Choose approve, reject or revoke.");
  const ref = db.doc(`upiUnlockOrders/${orderId}`);
  const first = await ref.get();
  if (!first.exists) throw new HttpsError("not-found", "We couldn't find that order.");
  const kind = kindOf(first);
  // A Plus pass queues after any pass already running (web or store), so nobody loses days.
  const storeExpiry = kind === "plus" && decision === "approve" ? await storeExpiryIfEnabled(String(first.get("uid"))) : 0;
  let uid: string | null = null;
  const status = await db.runTransaction(async (tx): Promise<UpiStatus> => {
    const order = await tx.get(ref);
    if (!order.exists) throw new HttpsError("not-found", "We couldn't find that order.");
    uid = order.get("uid") as string;
    const ledgerRef = db.doc(`webPassLedger/${uid}`);
    const ledger = kind === "plus" ? await tx.get(ledgerRef) : null;
    const [unlock, user] = await tx.getAll(db.doc(`chatUnlocks/${uid}`), db.doc(`users/${uid}`));
    const now = Date.now();
    const audit = { reviewedBy: moderator, reviewedAt: now, reviewNote: typeof note === "string" ? note.slice(0, 300) : null, updatedAt: FieldValue.serverTimestamp() };
    if (decision === "approve") {
      if (order.get("status") === "approved") return "approved";
      if (order.get("status") !== "submitted") throw new HttpsError("failed-precondition", "Only payments with a submitted UPI reference can be approved.");
      if (!user.exists) throw new HttpsError("failed-precondition", "This account was deleted. Refund the payment by hand.");
      if (kind === "plus") {
        const queuedUntil = Math.max(Number(ledger?.get("until")) || 0, storeExpiry);
        const { startsAt, expiresAt } = passWindow(now, passDays(order.get("plan") as PlusPlan), queuedUntil);
        tx.set(ledgerRef, { until: expiresAt, updatedAt: FieldValue.serverTimestamp() });
        tx.update(ref, { ...audit, status: "approved", startsAt, expiresAt });
        return "approved";
      }
      if (unlock.get("status") !== "active") {
        tx.set(db.doc(`chatUnlocks/${uid}`), {
          status: "active",
          product: CHAT_UNLOCK.product,
          orderId,
          paymentId: order.get("utr") ? `upi:${order.get("utr")}` : `upi-order:${orderId}`,
          amountPaise: order.get("amountPaise"),
          currency: "INR",
          mode: "live",
          source: "upi",
          grantedAt: now,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      tx.update(ref, { ...audit, status: "approved", duplicateOfActiveUnlock: unlock.get("status") === "active" });
      return "approved";
    }
    if (decision === "reject") {
      if (order.get("status") !== "submitted" && order.get("status") !== "awaiting_payment") throw new HttpsError("failed-precondition", "Only open orders can be rejected.");
      // The UTR is freed, so a corrected one (or the right order) can use it.
      const utr = order.get("utr") as string | undefined;
      if (utr) tx.delete(db.doc(`upiUtrs/${utr}`));
      tx.update(ref, { ...audit, status: "rejected" });
      return "rejected";
    }
    if (order.get("status") !== "approved") throw new HttpsError("failed-precondition", "Only approved payments can be revoked.");
    if (kind === "chat" && unlock.get("status") === "active" && unlock.get("orderId") === orderId) {
      tx.update(db.doc(`chatUnlocks/${uid}`), { status: "revoked", revokedAt: now, revokedReason: "refund", updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(ref, { ...audit, status: "revoked" });
    return "revoked";
  });
  if (uid && kind === "plus") {
    // A revoked pass pulls the queue back to the passes that remain.
    if (decision === "revoke") await db.doc(`webPassLedger/${uid}`).set({ until: await webPassExpiry(uid), updatedAt: FieldValue.serverTimestamp() });
    await syncPremium(uid);
  } else if (uid) await syncChatAccess(uid);
  logger.info("UPI payment reviewed", { orderId, decision, kind });
  return { status };
});
