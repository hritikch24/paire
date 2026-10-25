import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { GIFT_PRODUCT } from "./lib/giftPayments";
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
