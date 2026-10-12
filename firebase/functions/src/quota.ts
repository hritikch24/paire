import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { nextDailyReset, remainingAllowance } from "./lib/allowance";
import { swipeLimits } from "./premium";
import { dayKey } from "./lib/ids";

export const dailyLimitRef = (uid: string) => db.doc(`limits/${uid}/daily/${dayKey()}`);

/** Read-only: checking the allowance never consumes it. */
export const getDailyAllowance = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const limits = await swipeLimits(uid);
  const now = Date.now();
  const snap = await db.doc(`limits/${uid}/daily/${dayKey(new Date(now))}`).get();
  return {
    remaining: {
      likes: remainingAllowance(snap.get("likes"), limits.likesPerDay),
      supers: remainingAllowance(snap.get("supers"), limits.supersPerDay)
    },
    limits: { likes: limits.likesPerDay, supers: limits.supersPerDay },
    resetsAt: nextDailyReset(now)
  };
});

/** Atomically counts one use of a daily allowance; throws resource-exhausted when used up. */
export async function consumeDailyQuota(uid: string, field: string, limit: number): Promise<number> {
  const ref = dailyLimitRef(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.get(field) as number | undefined) ?? 0;
    if (used >= limit) {
      throw new HttpsError("resource-exhausted", "You've hit today's limit. Try again tomorrow.");
    }
    tx.set(ref, { [field]: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return limit - used - 1;
  });
}
