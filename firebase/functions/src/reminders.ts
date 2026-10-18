import { randomUUID } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { hiddenIncognito, loadExclusions } from "./discovery";
import { requireAuth } from "./lib/auth";
import { buildDiscoveryEntry } from "./lib/discovery";
import { activeGarbaSeason, istDate } from "./lib/garba";
import { chooseReminder, DAY_MS, reminderDue, ReminderState } from "./lib/reminders";
import { verifiedUsers } from "./trust";
import { DiscoveryEntry, ModerationRecord, PublicProfile, UserSettings } from "./types";
import { sendWebPushToUser, WEB_PUSH_SECRETS } from "./webPush";

export async function remindMember(uid: string, now: number): Promise<void> {
  if (uid.startsWith("support_")) return;
  const [profileSnap, settingsSnap, modSnap, indexSnap, stateSnap, subscriptions] = await Promise.all([
    db.doc(`users/${uid}`).get(), db.doc(`users/${uid}/private/settings`).get(), db.doc(`moderation/${uid}`).get(),
    db.doc(`discovery/${uid}`).get(), db.doc(`notificationReminders/${uid}`).get(),
    db.collection("webPushSubscriptions").where("uid", "==", uid).limit(1).get()
  ]);
  const settings = settingsSnap.data() as UserSettings | undefined;
  const state = (stateSnap.data() ?? {}) as ReminderState;
  const profile = profileSnap.data() as PublicProfile | undefined;
  if (!profile || subscriptions.empty || state.enabled !== true || modSnap.get("cohort") === "test") return;
  const viewer = buildDiscoveryEntry(uid, profile, settings, modSnap.data() as ModerationRecord | undefined);
  viewer.lastActiveAt = Math.max(viewer.lastActiveAt, Number(indexSnap.get("lastActiveAt")) || 0);
  if (!viewer.visible || !reminderDue(settings, state, viewer.lastActiveAt, now) || !(await verifiedUsers([uid])).has(uid)) return;
  const account = await adminAuth().getUser(uid);
  if (account.disabled || !account.emailVerified || account.customClaims?.moderator === true || account.customClaims?.supportSession === true) return;
  // Same bounded first discovery scan, followed by fresh profile/settings checks to avoid stale-index claims.
  const indexed = await db.collection("discovery").where("visible", "==", true).where("cohort", "==", "public")
    .where("gender", "in", viewer.showMe).orderBy("lastActiveAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(100).get();
  const ids = indexed.docs.map((doc) => doc.id).filter((id) => id !== uid);
  if (!ids.length) return;
  const snaps = await db.getAll(...ids.flatMap((id) => [db.doc(`users/${id}`), db.doc(`users/${id}/private/settings`), db.doc(`moderation/${id}`)]));
  const candidates: DiscoveryEntry[] = ids.map((id, i) => buildDiscoveryEntry(id, snaps[i * 3].data() as PublicProfile | undefined, snaps[i * 3 + 1].data() as UserSettings | undefined, snaps[i * 3 + 2].data() as ModerationRecord | undefined));
  const [verified, excluded, incognito] = await Promise.all([verifiedUsers(ids), loadExclusions(uid, ids), hiddenIncognito(uid, candidates)]);
  const plan = chooseReminder(viewer, settings!, candidates.filter((candidate) => verified.has(candidate.uid) && !excluded.has(candidate.uid) && !incognito.has(candidate.uid)), state, now);
  if (!plan) return;
  const id = randomUUID();
  const claimed = await db.runTransaction(async (tx) => {
    const [current, preferences, latestProfile, latestIndex] = await tx.getAll(stateSnap.ref, settingsSnap.ref, profileSnap.ref, indexSnap.ref);
    const currentState = (current.data() ?? {}) as ReminderState;
    const latestActivity = Math.max(Number(latestProfile.get("lastActiveAt")) || 0, Number(latestIndex.get("lastActiveAt")) || 0);
    if (currentState.enabled !== true || latestProfile.get("isDiscoverable") === false || !reminderDue(preferences.data() as UserSettings | undefined, currentState, latestActivity, now)) return false;
    if (plan.season && currentState.garbaSeason === plan.season) return false;
    // Reserve before network delivery: overlapping scheduler invocations cannot double-send.
    tx.set(stateSnap.ref, { recentAttempts: [...(currentState.recentAttempts ?? []).filter((at) => now - at < 7 * DAY_MS), now], latestId: id, latestType: plan.type, latestAttemptAt: now, openedAt: 0, ...(plan.season ? { garbaSeason: plan.season } : {}) }, { merge: true });
    return true;
  });
  if (!claimed) return;
  // Re-read opt-out before delivery; also enforced by the transport.
  const currentSettings = (await settingsSnap.ref.get()).data() as UserSettings | undefined;
  const result = await sendWebPushToUser(uid, { kind: "reminders", title: plan.title, body: plan.body, tag: `reminder-${id}`, data: { type: "reminder", destination: plan.type, reminderId: id } }, currentSettings);
  const accepted = result.accepted > 0;
  await db.doc(`notificationStats/${istDate(now)}`).set({ attempts: FieldValue.increment(1), acceptedMembers: FieldValue.increment(accepted ? 1 : 0), acceptedPushes: FieldValue.increment(result.accepted), failedPushes: FieldValue.increment(result.failed) }, { merge: true });
}

export const sendEngagementReminders = onSchedule({ region: REGION, schedule: "30 18 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540, memory: "512MiB", maxInstances: 1, retryCount: 0, secrets: WEB_PUSH_SECRETS }, async () => {
  if ((await db.doc("runtime/notifications").get()).get("remindersEnabled") !== true) return;
  const now = Date.now();
  // Outside the event season, only Tuesday/Friday can produce a reminder.
  const weekday = new Date(`${istDate(now)}T00:00:00Z`).getUTCDay();
  if (!activeGarbaSeason(now) && weekday !== 2 && weekday !== 5) return;
  let cursor: string | undefined;
  for (;;) {
    let query = db.collection("notificationReminders").where("enabled", "==", true).orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    // Bounded concurrency keeps Firestore/provider traffic smooth as the opt-in audience grows.
    for (let i = 0; i < page.size; i += 5) await Promise.all(page.docs.slice(i, i + 5).map(async (doc) => {
      try { await remindMember(doc.id, now); } catch { logger.warn("Reminder skipped after an error"); }
    }));
    if (page.size < 100) break;
    cursor = page.docs[page.size - 1].id;
  }
});

export const recordReminderOpen = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const id = request.data?.id;
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw new HttpsError("invalid-argument", "That reminder isn't valid.");
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`notificationReminders/${uid}`);
    const current = await tx.get(ref);
    if (current.get("latestId") !== id || current.get("openedAt") || Date.now() - Number(current.get("latestAttemptAt")) > 7 * DAY_MS) return;
    tx.update(ref, { openedAt: Date.now() });
    tx.set(db.doc(`notificationStats/${istDate()}`), { opens: FieldValue.increment(1) }, { merge: true });
  });
  return { ok: true };
});
