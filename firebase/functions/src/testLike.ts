import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { sendPushToUser } from "./push";
import { requireSupportOperator } from "./supportAdmin";
import { WEB_PUSH_SECRETS } from "./webPush";
import { dueTime, funnelStatus, parseTestLikeConfig, TestLikeConfig } from "./lib/test-like";

/**
 * Signup retention probe. A few minutes after an allowlisted test account finishes onboarding, a
 * designated sender account likes it, so the owner can see whether that person comes back.
 * Everything is off until `runtime/testLike` says `enabled: true`, only allowlisted recipients
 * ever get a job, and real members are never contacted.
 */
export type { TestLikeConfig } from "./lib/test-like";

async function config(): Promise<TestLikeConfig> {
  return parseTestLikeConfig((await db.doc("runtime/testLike").get()).data());
}

/** Queues one job per finished signup (create-only, so retries and later edits never queue a second like). */
export const onTestSignupCompleted = onDocumentWritten({ document: "users/{uid}", region: REGION }, async (event) => {
  const after = event.data?.after.data();
  if (!after || after.onboardingComplete !== true || event.data?.before.data()?.onboardingComplete === true) return;
  const cfg = await config();
  if (!cfg.enabled) return;
  const uid = event.params.uid;
  const email = (await adminAuth().getUser(uid).catch(() => null))?.email;
  const dueAt = dueTime(cfg, email, true, Date.now());
  if (dueAt === null) return;
  await db.doc(`testLikeJobs/${uid}`).create({ uid, email: email!.toLowerCase(), status: "pending", signedUpAt: Date.now(), dueAt, createdAt: FieldValue.serverTimestamp() }).catch((error: { code?: number }) => {
    if (error.code !== 6) throw error; // 6 = ALREADY_EXISTS
  });
});

async function deliver(jobRef: DocumentReference, senderUid: string): Promise<boolean> {
  const targetUid = jobRef.id;
  const swipeRef = db.doc(`swipes/${senderUid}/outgoing/${targetUid}`);
  const claimed = await db.runTransaction(async (tx) => {
    const [job, target, swipe, blocked] = await tx.getAll(jobRef, db.doc(`users/${targetUid}`), swipeRef, db.doc(`blocks/${targetUid}/blocked/${senderUid}`));
    if (job.get("status") !== "pending") return false;
    if (!target.exists || blocked.exists || swipe.exists) {
      tx.update(jobRef, { status: "skipped", reason: !target.exists ? "profile-missing" : blocked.exists ? "blocked" : "already-swiped", updatedAt: FieldValue.serverTimestamp() });
      return false;
    }
    tx.set(swipeRef, { fromUid: senderUid, toUid: targetUid, type: "like", source: "testLike", createdAt: FieldValue.serverTimestamp() });
    tx.update(jobRef, { status: "sent", likeSentAt: Date.now(), senderUid, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (claimed) {
    await sendPushToUser(targetUid, { kind: "likes", title: "Someone likes you 💛", body: "Open Paire to see your likes.", data: { type: "like" }, tag: `likes-${targetUid}` }).catch(() => undefined);
  }
  return claimed;
}

/** Runs every minute; sends the likes that have reached their delay. */
export const sendDueTestLikes = onSchedule({ region: REGION, schedule: "every 1 minutes", timeoutSeconds: 120, maxInstances: 1, retryCount: 0, secrets: WEB_PUSH_SECRETS }, async () => {
  const cfg = await config();
  if (!cfg.enabled || !cfg.senderEmail) return;
  const due = await db.collection("testLikeJobs").where("status", "==", "pending").where("dueAt", "<=", Date.now()).limit(25).get();
  if (due.empty) return;
  const sender = await adminAuth().getUserByEmail(cfg.senderEmail).catch(() => null);
  if (!sender) return;
  for (const job of due.docs) {
    const email = String(job.get("email") || "").toLowerCase();
    if (!cfg.allowlist.includes(email)) {
      await job.ref.update({ status: "skipped", reason: "not-allowlisted", updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    await deliver(job.ref, sender.uid).catch(async (error) => {
      await job.ref.update({ status: "failed", reason: String(error?.message || error).slice(0, 200), updatedAt: FieldValue.serverTimestamp() });
    });
  }
});

/** Owner-only: each test signup, when its like was sent, and whether they came back. */
export const adminGetSignupFunnel = onCall({ region: REGION, timeoutSeconds: 30 }, async (request) => {
  await requireSupportOperator(request);
  const [cfg, jobs] = await Promise.all([config(), db.collection("testLikeJobs").orderBy("signedUpAt", "desc").limit(50).get()]);
  const users = jobs.docs.length ? await db.getAll(...jobs.docs.map((job) => db.doc(`users/${job.id}`))) : [];
  const rows = jobs.docs.map((job, index) => {
    const active = Number(users[index].get("lastActiveAt"));
    const lastActiveAt = Number.isFinite(active) && active > 0 ? active : null;
    return { email: String(job.get("email") || ""), status: funnelStatus(job.data() as { status?: string; likeSentAt?: number }, lastActiveAt), signedUpAt: Number(job.get("signedUpAt")) || null, likeSentAt: Number(job.get("likeSentAt")) || null, lastActiveAt, reason: (job.get("reason") as string | undefined) ?? null };
  });
  const sent = rows.filter((row) => row.status === "sent" || row.status === "returned");
  return { enabled: cfg.enabled, delayMinutes: Math.round(cfg.delayMs / 60000), rows, sent: sent.length, returned: rows.filter((row) => row.status === "returned").length };
});
