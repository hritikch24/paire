import { DocumentReference, FieldValue, Transaction } from "firebase-admin/firestore";
import { db } from "./admin";
import { PremiumQueue, PremiumWindow, queueBenefits } from "./lib/premiumQueue";

/** Same transaction as the purchase/claim/reversal; archived gift dates remain accurate after queue compaction. */
export function savePremiumQueue(tx: Transaction, ref: DocumentReference, change: { queue: PremiumQueue; retired: PremiumWindow[] }, now: number): void {
  for (const window of change.retired) {
    if (window.key.startsWith("gift:")) tx.update(db.doc(`giftOrders/${window.key.slice(5)}`), { startsAt: window.startsAt, endsAt: window.expiresAt, entitlementArchivedAt: now });
  }
  tx.set(ref, { premiumQueue: change.queue, until: queueBenefits(change.queue, now).expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
