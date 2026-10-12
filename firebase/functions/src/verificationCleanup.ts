import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { bucket, db } from "./admin";
import { REGION } from "./config";

export async function eraseProviderSession(sessionId: string): Promise<void> {
  if (!process.env.DIDIT_API_KEY || process.env.DIDIT_API_KEY === "disabled") throw new HttpsError("unavailable", "Photo-check data cleanup needs provider configuration. Please contact support.");
  const response = await fetch(`https://verification.didit.me/v3/session/${sessionId}/delete/`, {
    method: "DELETE", headers: { "x-api-key": process.env.DIDIT_API_KEY, "content-type": "application/json" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ deletion_instruction: "privacy_erasure", retain_face_embeddings: false })
  });
  if (!response.ok && response.status !== 404) throw new HttpsError("unavailable", "We couldn’t erase the photo-check data yet. Please try again.");
}

export async function purgeVerificationData(uid: string): Promise<void> {
  const sessions = await db.collection("verificationSessions").where("uid", "==", uid).get();
  for (const session of sessions.docs) {
    if (session.get("providerErased") !== true) await eraseProviderSession(session.id);
    await session.ref.delete();
  }
  await bucket().deleteFiles({ prefix: `verified-photos/${uid}/` });
  await db.doc(`verificationLocks/${uid}`).delete();
  const moderation = db.doc(`moderation/${uid}`);
  if ((await moderation.get()).exists) await moderation.update({ verification: FieldValue.delete() });
}

/** Provider biometrics are erased after adjudication or after the 24-hour review window. */
export const cleanupPhotoChecks = onSchedule({ region: REGION, schedule: "every 24 hours", secrets: ["DIDIT_API_KEY"], timeoutSeconds: 300 }, async () => {
  const sessions = await db.collection("verificationSessions").where("providerErasureAt", "<=", Date.now()).limit(100).get();
  for (const session of sessions.docs) {
    try {
      const claimed = await db.runTransaction(async (tx) => {
        const current = await tx.get(session.ref);
        if (!current.exists || current.get("providerErased") === true) return null;
        tx.update(session.ref, { providerErasing: true });
        return { uid: current.get("uid") as string, attempt: current.get("attempt") as string, approved: current.get("approved") === true };
      });
      if (!claimed) continue;
      await eraseProviderSession(session.id);
      await db.runTransaction(async (tx) => {
        const moderationRef = db.doc(`moderation/${claimed.uid}`); const moderation = await tx.get(moderationRef);
        if (!claimed.approved && moderation.get("verification.sessionId") === session.id) tx.update(moderationRef, { verification: { status: "rejected", sessionId: session.id } });
        tx.update(session.ref, { providerErased: true, providerErasing: false, providerErasureAt: FieldValue.delete() });
      });
      if (!claimed.approved) await bucket().deleteFiles({ prefix: `verified-photos/${claimed.uid}/${claimed.attempt}/` });
    } catch { logger.warn("Photo-check erasure needs retry", { sessionId: session.id }); }
  }
});
