import { db } from "./admin";
import { summarizeRevenue, recognizedPayments, recentPremiumPayments, summarizeRecentPremium } from "./lib/revenue";

/** One consistent snapshot avoids double counting during concurrent gateway reconciliation. */
export async function readRevenueSnapshot() {
  return db.runTransaction(async (tx) => {
    const sources = ["razorpay", "upi", "ccavenue", "razorpay-chat"] as const;
    const collections = ["razorpayOrders", "upiUnlockOrders", "ccavenueOrders", "chatUnlockOrders"];
    const [paymentDocs, receiptDocs] = await Promise.all([
      Promise.all(collections.map((collection) => tx.get(db.collection(collection).select("uid", "status", "amountPaise", "currency", "kind", "mode", "paidAt", "reviewedAt")))),
      tx.get(db.collection("billingSupportAudit").select("uid", "action", "status", "confirmationSource", "currency", "amountReportedPaise", "coveredOrderIds", "orderSource", "kind", "createdAt"))
    ]);
    return { orders: paymentDocs.flatMap((snap, index) => snap.docs.map((doc) => ({ ...doc.data(), id: doc.id, source: sources[index] }))), receipts: receiptDocs.docs.map((doc) => ({ ...doc.data(), id: doc.id })) };
  }, { readOnly: true });
}

export async function readRevenue() {
  const { orders, receipts } = await readRevenueSnapshot();
  return summarizeRevenue(orders, receipts);
}
export async function readRevenueMetrics(now: number, excluded: Set<string>) {
  const { orders, receipts } = await readRevenueSnapshot();
  const recent = recentPremiumPayments(recognizedPayments(orders, receipts), now, excluded);
  return { ...summarizeRevenue(orders, receipts), premium24h: summarizeRecentPremium(recent, now) };
}
