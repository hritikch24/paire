import { Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { verificationState } from "./lib/verification";

/** Secure default. Only administrators may opt a closed preview out of enforcement. */
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
  return new Set(unique.filter((_, index) => snaps[index * 2 + 1].get("status") !== "banned" && (!required || verificationState(snaps[index * 2 + 1].get("verification"), snaps[index * 2].get("photoUrls")) === "verified")));
}

export async function requireVerifiedUsers(uids: string[], tx?: Transaction): Promise<void> {
  const verified = await verifiedUsers(uids, tx);
  if (uids.some((uid) => !verified.has(uid))) {
    const moderation = await (tx ? tx.getAll(...uids.map((uid) => db.doc(`moderation/${uid}`))) : db.getAll(...uids.map((uid) => db.doc(`moderation/${uid}`))));
    if (moderation.some((snap) => snap.get("status") === "banned")) throw new HttpsError("permission-denied", "This account is unavailable for dating. Contact support for help.");
    throw new HttpsError("failed-precondition", "Photo verification is required before discovering, matching or contacting people.", { reason: "verification-required" });
  }
}
