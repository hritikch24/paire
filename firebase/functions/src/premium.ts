import { db } from "./admin";
import { LIMITS, PLUS_LIMITS } from "./config";
import { validBillingSnapshot } from "./lib/billing";

export function limitsFor(snapshot: { expiresAt?: unknown; checkedAt?: unknown } | undefined) {
  return process.env.MUSE_BILLING_ENABLED === "true" && validBillingSnapshot(snapshot)
    ? { likesPerDay: PLUS_LIMITS.likesPerDay, supersPerDay: PLUS_LIMITS.supersPerDay, priority: true }
    : { likesPerDay: LIMITS.likesPerDay, supersPerDay: LIMITS.supersPerDay, priority: false };
}

export async function swipeLimits(uid: string) {
  return limitsFor((await db.doc(`billing/${uid}`).get()).data());
}
