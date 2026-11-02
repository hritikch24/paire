import { createHash } from "crypto";
import { FieldPath, FieldValue, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { GIFT_PRODUCT } from "./lib/giftPayments";
import { razorpay } from "./razorpayClient";

export const EXTRA_REASON = "second-payment-on-paid-order";
const LEASE = 2 * 60_000;
export const giftRefundKey = (orderId: string, paymentId: string) => createHash("sha256").update(JSON.stringify([orderId, paymentId])).digest("hex").slice(0, 32);

/** One durable obligation per payment. Stable provider idempotency survives timeouts and worker crashes. */
export async function refundGiftPayment(orderId: string, paymentId: string, amountPaise: number, reason: string): Promise<void> {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error("Invalid gift refund amount");
  const ref = db.doc(`giftRefundJobs/${giftRefundKey(orderId, paymentId)}`);
  await db.runTransaction(async tx => {
    const [job, order] = await tx.getAll(ref, db.doc(`giftOrders/${orderId}`));
    if (!order.exists) return;
    if (!job.exists) tx.create(ref, { orderId, paymentId, amountPaise, reason, status: "pending", attempts: 0, nextAttemptAt: 0, createdAt: Date.now() });
  });
  await runGiftRefund(ref.id);
}

export async function runGiftRefund(id: string, now = Date.now()): Promise<boolean> {
  const ref = db.doc(`giftRefundJobs/${id}`);
  const claim = await db.runTransaction(async tx => {
    const job = await tx.get(ref);
    if (!job.exists || ["submitted", "processed", "needs_review"].includes(job.get("status"))) return null;
    if (Number(job.get("nextAttemptAt")) > now || Number(job.get("leaseUntil")) > now) return null;
    const attempts = Number(job.get("attempts") || 0) + 1;
    tx.update(ref, { status: "processing", attempts, leaseUntil: now + LEASE, updatedAt: now });
    return { orderId: String(job.get("orderId")), paymentId: String(job.get("paymentId")), amountPaise: Number(job.get("amountPaise")), reason: String(job.get("reason")), attempts };
  });
  if (!claim) return false;
  const orderRef = db.doc(`giftOrders/${claim.orderId}`), extra = claim.reason === EXTRA_REASON;
  try {
    // Refund receipt and idempotency key are identical on every retry, including an unknown prior response.
    const key = `gift_refund_${id}`;
    const refund = await razorpay<{ id?: string; status?: string }>(`/payments/${claim.paymentId}/refund`, { method: "POST", refundIdempotencyKey: key,
      body: { amount: claim.amountPaise, speed: "normal", receipt: key, notes: { reason: claim.reason, product: GIFT_PRODUCT } } });
    if (typeof refund.id !== "string" || !refund.id.startsWith("rfnd_")) throw new Error("Refund response needs reconciliation");
    const status = refund.status === "processed" ? "processed" : "submitted";
    await db.runTransaction(async tx => {
      const [job, order] = await tx.getAll(ref, orderRef);
      if (!job.exists || !order.exists) return;
      // A processed webhook can win the race with this API response; never downgrade it.
      tx.update(ref, { status: job.get("status") === "processed" ? "processed" : status, refundId: refund.id, leaseUntil: 0, nextCheckAt: job.get("status") === "processed" || status === "processed" ? FieldValue.delete() : Date.now() + 86_400_000, updatedAt: Date.now() });
      tx.update(orderRef, extra
        ? { extraRefunds: FieldValue.arrayUnion({ paymentId: claim.paymentId, refundId: refund.id, at: Date.now() }) }
        : { refundRequestedAt: Date.now(), refundId: refund.id, refundReason: claim.reason, refundStatus: order.get("refundStatus") === "processed" ? "processed" : status, refundError: FieldValue.delete(), refundDue: FieldValue.delete() });
    });
    return true;
  } catch {
    const status = claim.attempts >= 30 ? "needs_review" : "pending";
    const nextAttemptAt = Date.now() + Math.min(6 * 3_600_000, 60_000 * 2 ** Math.min(claim.attempts, 8));
    await db.runTransaction(async tx => {
      const [job, order] = await tx.getAll(ref, orderRef);
      if (!job.exists || ["submitted", "processed"].includes(job.get("status"))) return;
      tx.update(ref, { status, nextAttemptAt, leaseUntil: 0, lastError: "Payment service refund not confirmed", updatedAt: Date.now() });
      if (order.exists && !extra) tx.update(orderRef, { refundStatus: status, refundError: "Refund not confirmed; retained for retry", refundDue: status === "needs_review" ? FieldValue.delete() : true });
    });
    logger.warn("Premium gift refund remains due", { orderId: claim.orderId, attempts: claim.attempts, status });
    return false;
  }
}

/** Recovers a crash before the durable job was created. A failed refund is never treated as settled. */
export async function retryOrderRefund(orderId: string): Promise<boolean> {
  const order = await db.doc(`giftOrders/${orderId}`).get();
  const paymentId = order.get("paymentId");
  if (!order.exists || typeof paymentId !== "string" || order.get("refundId") || (order.get("refundedPaymentIds") as string[] | undefined)?.includes(paymentId)) return false;
  if (!["orphaned", "rejected"].includes(order.get("status"))) return false;
  if (Date.now() - Number(order.get("refundAttemptAt") || 0) < LEASE) return false;
  await refundGiftPayment(orderId, paymentId, Number(order.get("amountPaise")), String(order.get("status")));
  return true;
}

export async function retryStuckOrderRefunds(now = Date.now()): Promise<number> {
  let retried = 0;
  for (const status of ["orphaned", "rejected"]) {
    let cursor: QueryDocumentSnapshot | undefined;
    for (let page = 0; page < 10; page++) {
      let query = db.collection("giftOrders").where("status", "==", status).orderBy(FieldPath.documentId()).limit(200);
      if (cursor) query = query.startAfter(cursor);
      const orders = await query.get();
      for (const doc of orders.docs) if (await retryOrderRefund(doc.id).catch(() => false)) retried += 1;
      if (orders.size < 200) break;
      cursor = orders.docs.at(-1);
    }
  }
  const extras = await db.collection("giftOrders").where("extraRefundDue", "==", true).limit(200).get();
  for (const order of extras.docs) {
    for (const id of (order.get("extraPaymentIds") as string[] | undefined) ?? []) await refundGiftPayment(order.id, id, Number(order.get("amountPaise")), EXTRA_REASON).catch(() => undefined);
    // Jobs now retain any remaining obligation; no expensive scan of old successful extra refunds next day.
    await order.ref.update({ extraRefundDue: FieldValue.delete() });
  }
  // Submitted means accepted by the provider, not returned by the bank. Check once per day.
  const submitted = await db.collection("giftRefundJobs").where("nextCheckAt", "<=", now).limit(200).get();
  for (const job of submitted.docs) {
    if (job.get("status") !== "submitted") { await job.ref.update({ nextCheckAt: FieldValue.delete() }); continue; }
    try {
      const remote = await razorpay<{ payment_id?: string; status?: string }>(`/refunds/${encodeURIComponent(String(job.get("refundId")))}`);
      if (remote.payment_id !== job.get("paymentId")) continue;
      if (remote.status === "processed") await settleGiftRefundJob(String(job.get("orderId")), String(job.get("paymentId")));
      else if (remote.status === "failed") await failGiftRefundJob(String(job.get("orderId")), String(job.get("paymentId")), job.get("refundId"));
      if (remote.status !== "processed" && remote.status !== "failed") await job.ref.update({ lastCheckedAt: now, nextCheckAt: now + 86_400_000 });
    } catch { await job.ref.update({ lastCheckedAt: now, nextCheckAt: now + 86_400_000 }); }
  }
  let last: QueryDocumentSnapshot | undefined;
  for (let page = 0; page < 10; page++) {
    let query = db.collection("giftRefundJobs").where("status", "in", ["pending", "processing"]).orderBy(FieldPath.documentId()).limit(200);
    if (last) query = query.startAfter(last);
    const jobs = await query.get();
    for (const job of jobs.docs) if (await runGiftRefund(job.id, now).catch(() => false)) retried += 1;
    if (jobs.size < 200) break;
    last = jobs.docs.at(-1);
  }
  return retried;
}

/** Provider completion is reconciled with the payment total, so a partial refund is not called a full refund. */
export async function settleGiftRefundJob(orderId: string, paymentId: string, chargeback = false): Promise<void> {
  const orderRef = db.doc(`giftOrders/${orderId}`), ref = db.doc(`giftRefundJobs/${giftRefundKey(orderId, paymentId)}`);
  const payment = chargeback ? null : await razorpay<{ amount_refunded?: number }>(`/payments/${paymentId}`);
  await db.runTransaction(async tx => {
    const [order, job] = await tx.getAll(orderRef, ref);
    if (!order.exists) return;
    const total = Number(order.get("amountPaise")), full = chargeback || Number(payment?.amount_refunded) >= total;
    if (job.exists) tx.update(ref, { status: full ? "processed" : "needs_review", leaseUntil: 0, nextCheckAt: FieldValue.delete(), updatedAt: Date.now() });
    if (order.get("paymentId") === paymentId) tx.update(orderRef, { refundStatus: chargeback ? "chargeback" : full ? "processed" : "needs_review", ...(full ? { refundDue: FieldValue.delete(), refundError: FieldValue.delete() } : {}) });
  });
}

/** A bank/provider failure needs operator reconciliation, never an unverified second refund. */
export async function failGiftRefundJob(orderId: string, paymentId: string, refundId?: unknown): Promise<void> {
  const ref = db.doc(`giftRefundJobs/${giftRefundKey(orderId, paymentId)}`), orderRef = db.doc(`giftOrders/${orderId}`);
  await db.runTransaction(async tx => {
    const [job, order] = await tx.getAll(ref, orderRef);
    if (!job.exists || job.get("status") === "processed" || (refundId && job.get("refundId") && refundId !== job.get("refundId"))) return;
    tx.update(ref, { status: "needs_review", lastError: "Provider reported a failed refund", leaseUntil: 0, nextCheckAt: FieldValue.delete(), updatedAt: Date.now() });
    if (order.exists && order.get("paymentId") === paymentId) tx.update(orderRef, { refundStatus: "needs_review", refundError: "Provider reported a failed refund; support review required" });
  });
}
