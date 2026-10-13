import { Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { refreshEmailVerification } from "./accountChecks";
import { db } from "./admin";
import { verificationState } from "./lib/verification";

/**
 * Secure default. Only administrators may opt a closed preview out of enforcement.
 * Test-cohort accounts (shared QA logins, shown only to each other) never need the
 * photo check; they still need a confirmed email.
 */
export async function verificationRequired(tx?: Transaction): Promise<boolean> {
  const ref = db.doc("runtime/trust");
  return (tx ? await tx.get(ref) : await ref.get()).get("requireVerification") !== false;
}

export async function verifiedUsers(uids: string[], tx?: Transaction): Promise<Set<string>> {
  const unique = [...new Set(uids)];
  const required = await verificationRequired(tx);
  if (!unique.length) return new Set();
  const refs = unique.flatMap((uid) => [db.doc(`users/${uid}`), db.doc(`moderation/${uid}`)]);
  const snaps = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  return new Set(unique.filter((_, index) => snaps[index * 2 + 1].get("status") !== "banned" && snaps[index * 2 + 1].get("emailVerified") === true && (!required || snaps[index * 2 + 1].get("cohort") === "test" || verificationState(snaps[index * 2 + 1].get("verification"), snaps[index * 2].get("photoUrls")) === "verified")));
}

/**
 * Throws unless every member may date. `caller` (default: the first uid) gets the
 * "confirm your email" message; anyone else just isn't available. Outside a
 * transaction, a caller whose confirmed email was never recorded (older accounts,
 * Google sign-ins) is re-checked once instead of being turned away.
 */
export async function requireVerifiedUsers(uids: string[], tx?: Transaction, caller: string = uids[0], recheckedEmail = false): Promise<void> {
  const verified = await verifiedUsers(uids, tx);
  if (uids.some((uid) => !verified.has(uid))) {
    const moderation = await (tx ? tx.getAll(...uids.map((uid) => db.doc(`moderation/${uid}`))) : db.getAll(...uids.map((uid) => db.doc(`moderation/${uid}`))));
    if (moderation.some((snap) => snap.get("status") === "banned")) throw new HttpsError("permission-denied", "This account is unavailable for dating. Contact support for help.");
    const callerIndex = Math.max(0, uids.indexOf(caller));
    if (moderation[callerIndex].get("emailVerified") !== true) {
      if (!tx && !recheckedEmail && (await refreshEmailVerification(uids[callerIndex]))) return requireVerifiedUsers(uids, tx, caller, true);
      throw new HttpsError("failed-precondition", "Confirm your email first: open the link we sent you.", { reason: "email-verification-required" });
    }
    if (moderation.some((snap) => snap.get("emailVerified") !== true)) throw new HttpsError("failed-precondition", "This person isn't available right now.");
    throw new HttpsError("failed-precondition", "Photo verification is required before discovering, matching or contacting people.", { reason: "verification-required" });
  }
}
