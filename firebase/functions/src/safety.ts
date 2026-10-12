import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { MODERATION, REGION } from "./config";
import { applyBlockToDuos } from "./duos";
import { requireAuth } from "./lib/auth";
import { pairId } from "./lib/ids";
import { parseTargetInput } from "./lib/validate";

/**
 * Blocks another member: they disappear from your feed (and you from theirs),
 * and any match between you ends immediately so neither side can message.
 */
export const blockUser = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { targetUid } = parseTargetInput(request.data);
  if (targetUid === uid) {
    throw new HttpsError("invalid-argument", "You can't block yourself.");
  }

  const matchRef = db.doc(`matches/${pairId(uid, targetUid)}`);
  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    tx.set(db.doc(`blocks/${uid}/blocked/${targetUid}`), {
      targetUid,
      createdAt: FieldValue.serverTimestamp()
    });
    if (matchSnap.exists && matchSnap.get("active") !== false) {
      tx.update(matchRef, {
        active: false,
        endedAt: FieldValue.serverTimestamp(),
        endedBy: uid,
        endReason: "block"
      });
    }
  });
  await applyBlockToDuos(uid, targetUid);
  return { ok: true };
});

/**
 * Auto-moderation: once enough different people report someone within the
 * window, their profile is hidden from discovery until a moderator reviews it
 * (set moderation/{uid}.status back to "ok" in the console to restore).
 */
export const onReportCreated = onDocumentCreated(
  { document: "reports/{reportId}", region: REGION },
  async (event) => {
    const report = event.data?.data() as { targetId?: string; reporterId?: string; reason?: string } | undefined;
    if (!report?.targetId) return;

    const since = Timestamp.fromMillis(Date.now() - MODERATION.windowDays * 24 * 60 * 60 * 1000);
    const recent = await db
      .collection("reports")
      .where("targetId", "==", report.targetId)
      .where("createdAt", ">=", since)
      .get();
    const reporters = new Set(recent.docs
      .filter((doc) => doc.get("status") !== "closed" || doc.get("outcome") === "action_taken")
      .map((doc) => doc.get("reporterId") as string));

    logger.info("Report received", {
      reportId: event.params.reportId,
      targetId: report.targetId,
      reason: report.reason,
      distinctReporters: reporters.size
    });

    if (reporters.size < MODERATION.hideAfterDistinctReporters) return;

    const moderationRef = db.doc(`moderation/${report.targetId}`);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(moderationRef);
      if (current.get("status") === "banned") return;
      tx.set(moderationRef, {
        status: "hidden", reason: "auto:reports", distinctReporters: reporters.size,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
  }
);
