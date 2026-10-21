import { onCall } from "firebase-functions/v2/https";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { recognizedPayments, recentPremiumPayments, summarizeRecentPremium } from "./lib/revenue";
import { consumeDailyQuota } from "./quota";
import { readRevenueSnapshot } from "./revenue";
import { requireSupportOperator } from "./supportAdmin";

/** Buyer identities and their payment history never appear in the open metrics response. */
export const adminGetRecentPremiumBuyers = onCall({ region: REGION, timeoutSeconds: 60, memory: "512MiB" }, async request => {
  const actor = await requireSupportOperator(request);
  await consumeDailyQuota(actor, "purchaseReports", 100);
  const now = Date.now();
  const [{ orders, receipts }, tests] = await Promise.all([readRevenueSnapshot(), db.collection("moderation").where("cohort", "==", "test").select().get()]);
  const payments = recentPremiumPayments(recognizedPayments(orders, receipts), now, new Set(tests.docs.map(doc => doc.id)));
  const ids = [...new Set(payments.flatMap(payment => payment.uid ? [payment.uid] : []))];
  const shown = ids.slice(0, 100);
  const [profiles, accounts] = shown.length ? await Promise.all([db.getAll(...shown.map(uid => db.doc(`users/${uid}`))), adminAuth().getUsers(shown.map(uid => ({ uid })))]) : [[], { users: [] }];
  const profileOf = new Map(profiles.map(profile => [profile.id, profile]));
  const accountOf = new Map(accounts.users.map(account => [account.uid, account]));
  return {
    ...summarizeRecentPremium(payments, now), hasMore: ids.length > shown.length,
    members: shown.map(uid => {
      const bought = payments.filter(payment => payment.uid === uid);
      const profile = profileOf.get(uid), account = accountOf.get(uid);
      return { uid, name: String(profile?.get("displayName") || account?.displayName || (account ? "Member" : "Deleted account")), email: account?.email ?? null, available: profile?.exists === true || Boolean(account), orders: bought.length, amountInr: bought.reduce((sum, payment) => sum + payment.amountPaise, 0) / 100, payments: bought.slice(0, 10).map(payment => ({ orderId: payment.orderId, amountInr: payment.amountPaise / 100, at: payment.confirmedAt, source: payment.source, confirmation: payment.manual ? "Owner confirmed" : payment.source === "upi" ? "UPI approved" : "Gateway confirmed" })) };
    })
  };
});
