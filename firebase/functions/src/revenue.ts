import { db } from "./admin";
import { summarizeRevenue } from "./lib/revenue";

/** One consistent snapshot avoids double counting during concurrent gateway reconciliation. */
export async function readRevenue() {
  return db.runTransaction(async (tx) => {
    const sources = ["razorpay", "upi", "ccavenue", "razorpay-chat"] as const;
    const collections = ["razorpayOrders", "upiUnlockOrders", "ccavenueOrders", "chatUnlockOrders"];
    const [paymentDocs, receiptDocs] = await Promise.all([
      Promise.all(collections.map((collection) => tx.get(db.collection(collection).select("uid", "status", "amountPaise", "currency", "kind", "mode")))),
      tx.get(db.collection("billingSupportAudit").select("uid", "action", "status", "confirmationSource", "currency", "amountReportedPaise", "coveredOrderIds", "orderSource", "kind"))
    ]);
    return summarizeRevenue(
      paymentDocs.flatMap((snap, index) => snap.docs.map((doc) => ({ ...doc.data(), id: doc.id, source: sources[index] }))),
      receiptDocs.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
    );
  }, { readOnly: true });
}
