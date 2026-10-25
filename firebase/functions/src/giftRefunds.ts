import { FieldPath, FieldValue, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { GIFT_PRODUCT, orderRefundState } from "./lib/giftPayments";
import { razorpay } from "./razorpayClient";

/** The refund reason for a second payment on an order that's already paid (recorded on the side). */
export const EXTRA_REASON = "second-payment-on-paid-order";

/**
 * Returns money for a gift payment that must not (or can no longer) buy a gift.
 * Written afresh after refundUnneededPass (razorpay.ts): the same Razorpay
 * refund call, and a failure is recorded on the order for support. Its own
 * module so giftPayments.ts and giftLifecycle.ts can both use it.
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

/**
 * Retries the refund of an orphaned or rejected order's own payment when nothing
 * is on record and no other worker claimed it in the last two minutes (the same
 * claim, orderRefundState, that grantGift uses). Returns true when it refunded.
 */
export async function retryOrderRefund(orderId: string): Promise<boolean> {
  const ref = db.doc(`giftOrders/${orderId}`);
  const claim = await db.runTransaction(async (tx) => {
    const order = await tx.get(ref);
    const paymentId = order.get("paymentId");
    if (!order.exists || typeof paymentId !== "string") return null;
    const now = Date.now();
    if (orderRefundState(order.data()!, paymentId, now) !== "retry") return null;
    tx.update(ref, { refundAttemptAt: now });
    return { paymentId, amountPaise: order.get("amountPaise") as number, reason: order.get("status") as string };
  });
  if (!claim) return false;
  await refundGiftPayment(orderId, claim.paymentId, claim.amountPaise, claim.reason);
  logger.info("Gift refund retried by the sweep", { orderId });
  return true;
}

const ORDER_SWEEP_PAGE = 200;
const ORDER_SWEEP_PAGES = 10;

/**
 * The sweep's pass over orphaned and rejected orders whose refund never ran
 * (single-field equality queries, paged by document id; no composite index).
 */
export async function retryStuckOrderRefunds(now = Date.now()): Promise<number> {
  let retried = 0;
  for (const status of ["orphaned", "rejected"]) {
    let last: QueryDocumentSnapshot | undefined;
    for (let page = 0; page < ORDER_SWEEP_PAGES; page += 1) {
      let query = db.collection("giftOrders").where("status", "==", status).orderBy(FieldPath.documentId()).limit(ORDER_SWEEP_PAGE);
      if (last) query = query.startAfter(last);
      const snap = await query.get();
      for (const doc of snap.docs) {
        const paymentId = doc.get("paymentId");
        if (typeof paymentId !== "string" || orderRefundState(doc.data(), paymentId, now) !== "retry") continue;
        if (await retryOrderRefund(doc.id).catch(() => false)) retried += 1;
      }
      if (snap.size < ORDER_SWEEP_PAGE) break;
      last = snap.docs[snap.docs.length - 1];
    }
  }
  return retried;
}
