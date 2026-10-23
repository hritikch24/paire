import { db } from "./admin";
import { LIMITS, PLUS_LIMITS } from "./config";
import { validBillingSnapshot } from "./lib/billing";
import type { BillingSnapshot } from "./lib/premiumBenefits";

export function limitsFor(snapshot: BillingSnapshot | undefined) {
  return process.env.MUSE_BILLING_ENABLED === "true" && validBillingSnapshot(snapshot)
    ? { likesPerDay: snapshot?.lifetime === true || (typeof snapshot?.unlimitedLikesUntil === "number" && Number.isFinite(snapshot.unlimitedLikesUntil) && snapshot.unlimitedLikesUntil > Date.now()) ? null : PLUS_LIMITS.likesPerDay, supersPerDay: PLUS_LIMITS.supersPerDay, priority: true }
    : { likesPerDay: LIMITS.likesPerDay, supersPerDay: LIMITS.supersPerDay, priority: false };
}

export async function swipeLimits(uid: string) {
  return limitsFor((await db.doc(`billing/${uid}`).get()).data());
}
