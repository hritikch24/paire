import { randomInt } from "crypto";
import { DocumentSnapshot, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import QRCode from "qrcode";
import { db } from "./admin";
import { chatPolicy, syncChatAccess } from "./chatEntitlement";
import { CHAT_UNLOCK, REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { consumeDailyQuota } from "./quota";
import { verifiedUsers } from "./trust";

/**
 * Unlimited Chat paid by UPI straight into Paire's own account (MUSE_UPI_VPA),
 * with no payment gateway. A UPI payment can't be confirmed automatically
 * without the bank's merchant API, so:
 *
 * 1. createUpiUnlockOrder gives the member a unique amount (₹49.01–₹49.99) and a
 *    reference, as a UPI link and QR code for their own order.
 * 2. After paying, the member submits the 12-digit UPI reference (UTR).
 * 3. A moderator checks the payment arrived in the bank statement (amount,
 *    UTR, time) and approves it; only then is chat unlocked.
 *
 * Records (server-only): upiUnlockOrders/{orderId}, upiUtrs/{utr} (one use per
 * UTR across all accounts), upiSlots/{amountPaise} (keeps open amounts unique).
 */

const ORDER_PAY_WINDOW_MS = 48 * 60 * 60_000;
const ORDER_ID = /^[A-Z0-9]{8}$/;
const UTR = /^[0-9]{12}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type UpiStatus = "awaiting_payment" | "submitted" | "approved" | "rejected" | "expired" | "revoked";

export const upiVpa = () => {
  const vpa = process.env.MUSE_UPI_VPA?.trim() ?? "";
  return /^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9]{2,64}$/.test(vpa) ? vpa : null;
};
const payeeName = () => (process.env.MUSE_UPI_PAYEE_NAME?.trim() || "Paire").slice(0, 50);

/** UPI checkout is on: a valid UPI ID is configured and runtime/trust.upiSales is set. */
export async function upiSalesOpen(): Promise<boolean> {
  return Boolean(upiVpa()) && (await chatPolicy()).upiSales;
}

/** The member's newest UPI order that's still open (waiting for payment or for review). */
export async function openUpiOrder(uid: string) {
  const snap = await db.collection("upiUnlockOrders").where("uid", "==", uid).where("status", "in", ["awaiting_payment", "submitted"]).get();
  const now = Date.now();
  const open = snap.docs
    .filter((doc) => doc.get("status") === "submitted" || (Number(doc.get("createdAt")) || 0) + ORDER_PAY_WINDOW_MS > now)
    .sort((a, b) => (Number(b.get("createdAt")) || 0) - (Number(a.get("createdAt")) || 0));
  return open[0] ?? null;
}

const newOrderId = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

function upiLink(vpa: string, amountPaise: number, orderId: string): string {
  const params = new URLSearchParams({ pa: vpa, pn: payeeName(), am: (amountPaise / 100).toFixed(2), cu: "INR", tn: `Paire chat ${orderId}` });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

export type UpiOrderView = {
  orderId: string;
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
  const link = upiLink(vpa, amountPaise, doc.id);
  return {
    orderId: doc.id,
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

/** Holds a free amount between ₹49.01 and ₹49.99 for this order, so it's easy to find in the bank statement. */
async function reserveAmount(orderId: string, now: number): Promise<number> {
  const candidates = Array.from(new Set(Array.from({ length: 12 }, () => CHAT_UNLOCK.amountPaise + 1 + randomInt(99))));
  return db.runTransaction(async (tx) => {
    const slots = await tx.getAll(...candidates.map((amount) => db.doc(`upiSlots/${amount}`)));
    const free = candidates.find((_, index) => !slots[index].exists || (Number(slots[index].get("until")) || 0) < now);
    // All taken (very busy): any amount works; the reference and UTR still identify the payment.
    const amount = free ?? candidates[0];
    tx.set(db.doc(`upiSlots/${amount}`), { orderId, until: now + ORDER_PAY_WINDOW_MS });
    return amount;
  });
}

export const createUpiUnlockOrder = onCall({ region: REGION, timeoutSeconds: 30 }, async (request): Promise<{ status: "owned" } | { status: "order"; order: UpiOrderView }> => {
  const uid = requireAuth(request);
  const vpa = upiVpa();
  if (!vpa || !(await upiSalesOpen())) throw new HttpsError("failed-precondition", "UPI payments aren't available right now. You haven't been charged.", { reason: "sales-off" });
  const [user, moderation, unlock] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`), db.doc(`chatUnlocks/${uid}`));
  if (!user.exists) throw new HttpsError("failed-precondition", "Finish creating your profile first.");
  if (moderation.get("status") === "banned") throw new HttpsError("permission-denied", "This account is unavailable. Contact support for help.");
  if (unlock.get("status") === "active") {
    await syncChatAccess(uid);
    return { status: "owned" };
  }
  // One open order at a time: reopening the panel shows the same amount and QR, never a second charge.
  const open = await openUpiOrder(uid);
  if (open) return { status: "order", order: await viewOf(open) };
  await consumeDailyQuota(uid, "upiUnlockOrders", CHAT_UNLOCK.ordersPerDay);
  if ((await db.collection("matches").where("participants", "array-contains", uid).limit(1).get()).empty) {
    throw new HttpsError("failed-precondition", "Unlimited Chat opens up once you have a mutual match.", { reason: "no-match" });
  }
  if (!(await verifiedUsers([uid])).has(uid)) throw new HttpsError("failed-precondition", "Verify your photos first, so you can use it straight away.", { reason: "verification-required" });

  const now = Date.now();
  let orderId = newOrderId();
  while ((await db.doc(`upiUnlockOrders/${orderId}`).get()).exists) orderId = newOrderId();
  const amountPaise = await reserveAmount(orderId, now);
  const ref = db.doc(`upiUnlockOrders/${orderId}`);
  await ref.set({
    uid,
    product: CHAT_UNLOCK.product,
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
  if (!UTR.test(cleanUtr)) throw new HttpsError("invalid-argument", "Enter the 12-digit UPI reference number (UTR) from your UPI app.");
  await consumeDailyQuota(uid, "upiSubmissions", 20);
  const ref = db.doc(`upiUnlockOrders/${orderId}`);
  await db.runTransaction(async (tx) => {
    const [order, used] = await tx.getAll(ref, db.doc(`upiUtrs/${cleanUtr}`));
    if (!order.exists || order.get("uid") !== uid) throw new HttpsError("not-found", "We couldn't find that order.");
    if (order.get("status") === "submitted" && order.get("utr") === cleanUtr) return;
    if (order.get("status") !== "awaiting_payment" && order.get("status") !== "submitted") throw new HttpsError("failed-precondition", "This order is closed. Contact support if you paid.");
    if (used.exists && used.get("orderId") !== orderId) throw new HttpsError("already-exists", "That UPI reference has already been used. Check the number, or contact support.");
    const previous = order.get("utr") as string | undefined;
    if (previous && previous !== cleanUtr) tx.delete(db.doc(`upiUtrs/${previous}`));
    tx.set(db.doc(`upiUtrs/${cleanUtr}`), { orderId, uid, at: Date.now() });
    tx.update(ref, { status: "submitted", utr: cleanUtr, submittedAt: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { status: "submitted", order: await viewOf(await ref.get()) };
});

/** The member's open UPI order, for showing its state in the app. */
export const getUpiUnlockOrder = onCall({ region: REGION }, async (request): Promise<{ order: UpiOrderView | null }> => {
  const uid = requireAuth(request);
  const open = await openUpiOrder(uid);
  return { order: open ? await viewOf(open) : null };
});

function requireModerator(request: CallableRequest<unknown>): string {
  const uid = requireAuth(request);
  if (request.auth?.token.moderator !== true) throw new HttpsError("permission-denied", "Moderator access is required.");
  return uid;
}

export type UpiReviewItem = { orderId: string; status: UpiStatus; amountLabel: string; utr: string | null; memberName: string; submittedAt: number | null; createdAt: number };

/** Payments waiting for a moderator: check each against the bank statement (amount + UTR). */
export const getUpiReviewQueue = onCall({ region: REGION }, async (request): Promise<{ items: UpiReviewItem[] }> => {
  requireModerator(request);
  const snap = await db.collection("upiUnlockOrders").where("status", "==", "submitted").limit(100).get();
  const users = snap.empty ? [] : await db.getAll(...snap.docs.map((doc) => db.doc(`users/${doc.get("uid")}`)));
  const items = snap.docs.map((doc, index) => ({
    orderId: doc.id,
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
export const reviewUpiPayment = onCall({ region: REGION }, async (request): Promise<{ status: UpiStatus }> => {
  const moderator = requireModerator(request);
  const { orderId, decision, note } = (request.data ?? {}) as { orderId?: unknown; decision?: unknown; note?: unknown };
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) throw new HttpsError("invalid-argument", "That order isn't valid.");
  if (decision !== "approve" && decision !== "reject" && decision !== "revoke") throw new HttpsError("invalid-argument", "Choose approve, reject or revoke.");
  const ref = db.doc(`upiUnlockOrders/${orderId}`);
  let uid: string | null = null;
  const status = await db.runTransaction(async (tx): Promise<UpiStatus> => {
    const order = await tx.get(ref);
    if (!order.exists) throw new HttpsError("not-found", "We couldn't find that order.");
    uid = order.get("uid") as string;
    const [unlock, user] = await tx.getAll(db.doc(`chatUnlocks/${uid}`), db.doc(`users/${uid}`));
    const now = Date.now();
    const audit = { reviewedBy: moderator, reviewedAt: now, reviewNote: typeof note === "string" ? note.slice(0, 300) : null, updatedAt: FieldValue.serverTimestamp() };
    if (decision === "approve") {
      if (order.get("status") === "approved") return "approved";
      if (order.get("status") !== "submitted") throw new HttpsError("failed-precondition", "Only payments with a submitted UPI reference can be approved.");
      if (!user.exists) throw new HttpsError("failed-precondition", "This account was deleted. Refund the payment by hand.");
      if (unlock.get("status") !== "active") {
        tx.set(db.doc(`chatUnlocks/${uid}`), {
          status: "active",
          product: CHAT_UNLOCK.product,
          orderId,
          paymentId: `upi:${order.get("utr")}`,
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
    if (unlock.get("status") === "active" && unlock.get("orderId") === orderId) {
      tx.update(db.doc(`chatUnlocks/${uid}`), { status: "revoked", revokedAt: now, revokedReason: "refund", updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(ref, { ...audit, status: "revoked" });
    return "revoked";
  });
  if (uid) await syncChatAccess(uid);
  logger.info("UPI payment reviewed", { orderId, decision });
  return { status };
});
