import { DocumentReference, Query } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { onCall } from "firebase-functions/v2/https";
import { adminAuth, bucket, db } from "./admin";
import { REGION } from "./config";
import { purgeVerificationData } from "./verificationCleanup";
import { purgeDuoData } from "./duos";
import { clearChatAccess } from "./chatEntitlement";
import { clearPresence } from "./presence";
import { requireAuth } from "./lib/auth";

async function deleteQueryResults(query: Query): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(300).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
  }
}

async function recursiveDelete(ref: DocumentReference): Promise<void> {
  await db.recursiveDelete(ref);
}

/**
 * Erases a member's data: profile, private data, devices, photos, swipes (both
 * directions), super likes, blocks and every match with its messages. Reports
 * and moderation records are kept for safety, as the privacy policy states.
 * Idempotent, so it is safe to run from both the callable and the auth trigger.
 */
export async function purgeUserData(uid: string): Promise<void> {
  await purgeVerificationData(uid);
  await deleteQueryResults(db.collection("webPushSubscriptions").where("uid", "==", uid));
  await db.doc(`notificationReminders/${uid}`).delete();
  await db.doc(`billing/${uid}`).delete();
  // Payment records (razorpayOrders, ccavenueOrders) are kept for tax law, as the privacy policy says; the queue isn't.
  await db.doc(`webPassLedger/${uid}`).delete();
  // Unlimited Chat belongs to this account only and ends with it; chatUnlockOrders are kept like razorpayOrders.
  await clearChatAccess(uid);
  await clearPresence(uid);
  await deleteQueryResults(db.collection("callRooms").where("participants", "array-contains", uid));
  // Duo chats belong to four people: leave them (erasing what this member wrote) instead of deleting them.
  await purgeDuoData(uid);
  const matches = await db.collection("matches").where("participants", "array-contains", uid).get();
  for (const match of matches.docs) {
    await recursiveDelete(match.ref);
  }

  await deleteQueryResults(db.collectionGroup("outgoing").where("toUid", "==", uid));
  await deleteQueryResults(db.collectionGroup("outgoing").where("targetUids", "array-contains", uid));
  await deleteQueryResults(db.collectionGroup("from").where("fromUid", "==", uid));
  await deleteQueryResults(db.collectionGroup("blocked").where("targetUid", "==", uid));

  for (const path of [`swipes/${uid}`, `superLikes/${uid}`, `blocks/${uid}`, `limits/${uid}`, `users/${uid}`]) {
    await recursiveDelete(db.doc(path));
  }
  await db.doc(`discovery/${uid}`).delete();

  try {
    await bucket().deleteFiles({ prefix: `user-uploads/${uid}/` });
  } catch (error) {
    logger.warn("Photo cleanup failed", { uid, error: String(error) });
  }
}

/** In-app "Delete account": erases data, then removes the sign-in account. */
export const deleteAccount = onCall(
  { region: REGION, timeoutSeconds: 300, memory: "512MiB", secrets: ["DIDIT_API_KEY"] },
  async (request) => {
    const uid = requireAuth(request);
    await purgeUserData(uid);
    try {
      await adminAuth().deleteUser(uid);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    }
    logger.info("Account deleted", { uid });
    return { ok: true };
  }
);

/** Also erase data when an account is deleted from the Firebase console or Admin SDK. */
export const onAuthUserDeleted = functionsV1
  .region(REGION)
  .runWith({ timeoutSeconds: 300, memory: "512MB", secrets: ["DIDIT_API_KEY"] })
  .auth.user()
  .onDelete(async (user) => {
    await purgeUserData(user.uid);
  });
