import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { requireAuth, requireReadAuth } from "./lib/auth";
import { parseReport, parseReview } from "./lib/reports";
import { dailyLimitRef } from "./quota";

function moderator(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  if (request.auth?.token.moderator !== true) throw new HttpsError("permission-denied", "Moderator access required.");
  return uid;
}

function cursor(data: unknown): { timestamp: Timestamp; id: string } | null {
  const value = (data as { cursor?: unknown } | null)?.cursor;
  if (value === undefined || value === null) return null;
  const c = value as { seconds?: unknown; nanoseconds?: unknown; id?: unknown };
  if (!Number.isInteger(c.seconds) || (c.seconds as number) < 0 || (c.seconds as number) > 253402300799 || !Number.isInteger(c.nanoseconds) || (c.nanoseconds as number) < 0 || (c.nanoseconds as number) >= 1e9 || typeof c.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(c.id)) throw new HttpsError("invalid-argument", "Page reference is invalid.");
  return { timestamp: new Timestamp(c.seconds as number, c.nanoseconds as number), id: c.id };
}

/** Always available, including before photo verification and after an unmatch. */
export const submitReport = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const input = parseReport(request.data);
  if (uid === input.targetUid) throw new HttpsError("invalid-argument", "You can't report yourself.");
  const ref = db.doc(`reports/${input.id}`);
  await db.runTransaction(async (tx) => {
    const previous = await tx.get(ref);
    if (previous.exists) {
      if (previous.get("reporterId") !== uid || previous.get("targetId") !== input.targetUid) throw new HttpsError("already-exists", "Report reference is already in use.");
      return;
    }
    const target = await tx.get(db.doc(`users/${input.targetUid}`));
    let evidence: Record<string, unknown> | null = null;
    if (input.matchId) {
      const match = await tx.get(db.doc(`matches/${input.matchId}`));
      const participants = match.get("participants");
      if (!Array.isArray(participants) || !participants.includes(uid) || !participants.includes(input.targetUid)) throw new HttpsError("permission-denied", "This conversation isn't available to you.");
      if (input.messageId) {
        const message = await tx.get(db.doc(`matches/${input.matchId}/messages/${input.messageId}`));
        if (!message.exists || message.get("senderId") !== input.targetUid) throw new HttpsError("invalid-argument", "This message wasn't sent by the reported member.");
        evidence = { text: String(message.get("text") ?? "").slice(0, 1000), sentAt: message.get("createdAt") ?? null };
      }
    }
    if (!target.exists && !input.matchId) throw new HttpsError("not-found", "This member is no longer available. Contact support if you need to report a deleted account.");
    const quota = dailyLimitRef(uid);
    const used = (await tx.get(quota)).get("reports") ?? 0;
    if (used >= 30) throw new HttpsError("resource-exhausted", "You've sent 30 reports today. Use Contact support in Settings for further concerns.");
    tx.set(quota, { reports: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(ref, {
      reporterId: uid, targetId: input.targetUid, reason: input.reason, details: input.details,
      ...(input.matchId ? { matchId: input.matchId } : {}), ...(input.messageId ? { messageId: input.messageId } : {}),
      targetSnapshot: { displayName: String(target.get("displayName") ?? "Paire member").slice(0, 40), photoUrls: Array.isArray(target.get("photoUrls")) ? target.get("photoUrls").slice(0, 6) : [] },
      evidence, status: "received", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { reportId: input.id };
});

/** Returns only the caller's progress; no evidence, staff notes or target actions. */
export const getMyReports = onCall({ region: REGION }, async (request) => {
  const uid = await requireReadAuth(request);
  const page = cursor(request.data);
  let query = db.collection("reports").where("reporterId", "==", uid).orderBy("createdAt", "desc").orderBy("__name__", "desc").limit(21);
  if (page) query = query.startAfter(page.timestamp, page.id);
  const snap = await query.get();
  const docs = snap.docs.slice(0, 20);
  const last = docs.at(-1);
  const timestamp = last?.get("createdAt") as Timestamp | undefined;
  return {
    reports: docs.map((doc) => ({ id: doc.id, reason: doc.get("reason"), targetName: doc.get("targetSnapshot.displayName") ?? "Paire member", status: doc.get("status") ?? "received", outcome: doc.get("outcome") ?? null, createdAt: (doc.get("createdAt") as Timestamp).toMillis(), updatedAt: ((doc.get("updatedAt") ?? doc.get("createdAt")) as Timestamp).toMillis() })),
    cursor: snap.size > 20 && timestamp && last ? { seconds: timestamp.seconds, nanoseconds: timestamp.nanoseconds, id: last.id } : null
  };
});

export const getReportReviewQueue = onCall({ region: REGION }, async (request) => {
  moderator(request);
  const page = cursor(request.data);
  let query = db.collection("reports").where("status", "in", ["received", "reviewing"]).orderBy("createdAt", "asc").orderBy("__name__", "asc").limit(21);
  if (page) query = query.startAfter(page.timestamp, page.id);
  const snap = await query.get();
  const docs = snap.docs.slice(0, 20);
  const last = docs.at(-1); const timestamp = last?.get("createdAt") as Timestamp | undefined;
  return { reports: docs.map((doc) => ({ id: doc.id, reason: doc.get("reason"), details: doc.get("details"), status: doc.get("status"), target: doc.get("targetSnapshot") ?? null, evidence: doc.get("evidence") ?? null, createdAt: (doc.get("createdAt") as Timestamp).toMillis() })), cursor: snap.size > 20 && timestamp && last ? { seconds: timestamp.seconds, nanoseconds: timestamp.nanoseconds, id: last.id } : null };
});

/** Explicit moderator decisions with an immutable audit record. Never restores a ban. */
export const reviewReport = onCall({ region: REGION }, async (request) => {
  const reviewer = moderator(request);
  const input = parseReview(request.data);
  const ref = db.doc(`reports/${input.id}`);
  await db.runTransaction(async (tx) => {
    const report = await tx.get(ref);
    if (!report.exists) throw new HttpsError("not-found", "Report not found.");
    if (report.get("status") === "closed") {
      if (input.status === "closed" && report.get("outcome") === input.outcome && report.get("action") === input.action) return;
      throw new HttpsError("failed-precondition", "This report is closed. Changes need a separate appeal review.");
    }
    const targetUid = report.get("targetId") as string;
    const moderationRef = db.doc(`moderation/${targetUid}`);
    const current = await tx.get(moderationRef);
    if (input.action !== "none" && (input.action === "ban" || current.get("status") !== "banned")) {
      tx.set(moderationRef, { status: input.action === "ban" ? "banned" : "hidden", reason: "review:report", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.update(ref, { status: input.status, ...(input.outcome ? { outcome: input.outcome } : {}), action: input.action, reviewer, reviewNote: input.note, updatedAt: FieldValue.serverTimestamp() });
    tx.create(db.collection("reportReviews").doc(), { reportId: input.id, reviewer, status: input.status, outcome: input.outcome ?? null, action: input.action, note: input.note, createdAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});
