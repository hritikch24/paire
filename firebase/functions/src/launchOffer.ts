import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { currentPrice, LAUNCH_OFFER, normalizePromo, OFFER_PRICES, OfferPlan, offerActive, validPromo } from "./lib/launch-offer";

async function newMember(uid: string): Promise<boolean> {
  const account = await adminAuth().getUser(uid);
  const joined = Date.parse(account.metadata.creationTime);
  return joined >= LAUNCH_OFFER.startsAt && joined < LAUNCH_OFFER.endsAt;
}
async function hasPurchase(uid: string): Promise<boolean> {
  for (const collection of ["razorpayOrders", "chatUnlockOrders", "ccavenueOrders", "upiUnlockOrders"]) {
    const orders = await db.collection(collection).where("uid", "==", uid).get();
    if (orders.docs.some(doc => ["paid", "approved", "refunded", "chargeback"].includes(doc.get("status")))) return true;
  }
  return false;
}
export const getLaunchOffer = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const code = normalizePromo((request.data as { code?: unknown } | null)?.code);
  if (code && !validPromo(code)) throw new HttpsError("invalid-argument", "That promo code isn't valid.");
  const active = offerActive();
  const [claim, campaign] = await db.getAll(db.doc(`launchOfferClaims/${uid}`), db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`));
  const eligible = active && await newMember(uid) && !(await hasPurchase(uid));
  const remaining = Math.max(0, LAUNCH_OFFER.limit - (Number(campaign.get("claimed")) || 0));
  const couponAvailable = eligible && (claim.exists || remaining > 0);
  if (code && !couponAvailable) throw new HttpsError("failed-precondition", active ? "This code is for the first 250 new members joining on 30–31 October, on their first purchase." : "This offer ended on 31 October at 11:59 pm IST.");
  const plans = Object.fromEntries(Object.entries(OFFER_PRICES).map(([id, prices]) => [id, {
    regular: prices.regular, amount: code ? prices.coupon : currentPrice(id as OfferPlan),
    offer: prices.offer, coupon: prices.coupon
  }]));
  return { active, endsAt: LAUNCH_OFFER.endsAt, remaining, couponAvailable, code: code || null, plans };
});

/** One claim and one immutable checkout per account, shared across every code and plan.
 * Calls retain their slot. A creating claim is never retried automatically:
 * a provider timeout could have created an order and needs reconciliation, not a duplicate.
 */
export async function promoCheckout<T extends object>(uid: string, plan: OfferPlan, rawCode: unknown, create: (amount: number, notes: Record<string, string>) => Promise<T>, expectedAmount?: unknown): Promise<T> {
  const code = normalizePromo(rawCode);
  const quoted = code ? OFFER_PRICES[plan].coupon : currentPrice(plan);
  if (expectedAmount !== undefined && expectedAmount !== quoted) throw new HttpsError("failed-precondition", "The price changed. Refresh the offer before paying.");
  if (!code) return create(quoted, {});
  if (!validPromo(code)) throw new HttpsError("invalid-argument", "That promo code isn't valid.");
  const claimRef = db.doc(`launchOfferClaims/${uid}`);
  const existing = await claimRef.get();
  if (existing.exists) {
    if (existing.get("plan") !== plan) throw new HttpsError("failed-precondition", "Your code is already reserved for another plan. Finish that checkout first.");
    if (existing.get("result")) return existing.get("result") as T;
    throw new HttpsError("aborted", "Your promo checkout is being prepared. Retry shortly; contact support if it stays unavailable.");
  }
  if (!offerActive() || !await newMember(uid) || await hasPurchase(uid)) throw new HttpsError("failed-precondition", "This offer is for new members joining on 30–31 October, on their first purchase only.");
  const campaignRef = db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`);
  await db.runTransaction(async tx => {
    const [claim, campaign] = await tx.getAll(claimRef, campaignRef);
    if (claim.exists) throw new HttpsError("aborted", "Your promo checkout is already opening. Retry shortly.");
    if (!offerActive()) throw new HttpsError("failed-precondition", "This offer has ended.");
    const claimed = Number(campaign.get("claimed")) || 0;
    if (claimed >= LAUNCH_OFFER.limit) throw new HttpsError("resource-exhausted", "All 250 new-member promo codes have been claimed.");
    tx.set(campaignRef, { claimed: claimed + 1 }, { merge: true });
    tx.create(claimRef, { campaign: LAUNCH_OFFER.id, plan, code, state: "creating", createdAt: Date.now() });
  });
  const amount = OFFER_PRICES[plan].coupon;
  const result = await create(amount, { campaign: LAUNCH_OFFER.id, promo: code, pricing: "coupon" });
  await claimRef.update({ state: "open", result });
  return result;
}
