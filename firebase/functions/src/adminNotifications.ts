import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { DAY_MS } from "./lib/reminders";
import { istDate } from "./lib/garba";
import { consumeDailyQuota } from "./quota";
import { runReminderQueue, ReminderSummary } from "./reminders";
import { requireSupportOperator } from "./supportAdmin";
import { sendWebPushToUser, WEB_PUSH_SECRETS } from "./webPush";
import type { UserSettings } from "./types";

type NotificationRun = { id: string; status: string; createdAt: number; summary?: ReminderSummary };

export const adminGetNotificationConsole = onCall({ region: REGION, timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  const actor = await requireSupportOperator(request);
  await consumeDailyQuota(actor, "notificationPreviews", 100);
  const now = Date.now();
  const [subscriptions, optIns, runtime, preview, history, stats] = await Promise.all([
    db.collection("webPushSubscriptions").select("uid").get(),
    db.collection("notificationReminders").where("enabled", "==", true).select().get(),
    db.doc("runtime/notifications").get(), runReminderQueue(now, true),
    db.collection("notificationCampaigns").orderBy("createdAt", "desc").limit(10).get(),
    db.getAll(...Array.from({ length: 7 }, (_, i) => db.doc(`notificationStats/${istDate(now - i * DAY_MS)}`)))
  ]);
  const browsers = new Set(subscriptions.docs.map(doc => doc.get("uid")).filter(uid => typeof uid === "string"));
  const week = { attempts: 0, acceptedMembers: 0, acceptedPushes: 0, failedPushes: 0, opens: 0 };
  for (const stat of stats) for (const key of Object.keys(week) as Array<keyof typeof week>) week[key] += Number(stat.get(key)) || 0;
  return { checkedAt: now, automationEnabled: runtime.get("remindersEnabled") === true, schedule: "Daily at 6:30 pm IST", registeredBrowsers: subscriptions.size, registeredMembers: browsers.size, reminderOptIns: optIns.size, reachableMembers: optIns.docs.filter(doc => browsers.has(doc.id)).length, preview, week, history: history.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
});

/** A request reference is an audit and an at-most-once run, including retries. */
export const adminSendReminderRun = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB", secrets: WEB_PUSH_SECRETS }, async (request): Promise<NotificationRun> => {
  const actorUid = await requireSupportOperator(request);
  const requestId = request.data?.requestId;
  if (typeof requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId) || Object.keys(request.data).some(key => key !== "requestId")) throw new HttpsError("invalid-argument", "A valid reminder run reference is required.");
  const ref = db.doc(`notificationCampaigns/${actorUid}_${requestId}`);
  const existing = await db.runTransaction(async tx => {
    const [run, operator, runtime] = await tx.getAll(ref, db.doc(`supportOperators/${actorUid}`), db.doc("runtime/notifications"));
    if (operator.get("enabled") !== true) throw new HttpsError("permission-denied", "Owner access is required.");
    if (run.exists) {
      // Longer than this function's 540-second maximum: acknowledge a lost
      // execution without replaying it. A new run still shares recipient caps.
      if (run.get("status") === "running" && Date.now() - Number(run.get("createdAt")) > 10 * 60_000) {
        tx.update(ref, { status: "interrupted", finishedAt: Date.now() });
        return { id: ref.id, ...run.data(), status: "interrupted" };
      }
      return { id: ref.id, ...run.data() };
    }
    if (runtime.get("remindersEnabled") !== true) throw new HttpsError("failed-precondition", "Reminders are switched off.");
    tx.create(ref, { actorUid, requestId, status: "running", createdAt: Date.now(), finishedAt: null });
    return null;
  });
  if (existing) return existing as NotificationRun;
  try {
    await consumeDailyQuota(actorUid, "notificationRuns", 5);
    const summary = await runReminderQueue(Date.now(), false, summary => ref.update({ summary, updatedAt: Date.now() }).then(() => undefined));
    await ref.update({ status: summary.stopped ? "stopped" : summary.errors ? "partial" : "complete", summary, finishedAt: Date.now() });
  } catch {
    await ref.update({ status: "failed", finishedAt: Date.now() });
  }
  return { id: ref.id, ...(await ref.get()).data() } as NotificationRun;
});

/** Explicit owner test, delivered only to that owner's already registered browsers. */
export const adminSendNotificationTest = onCall({ region: REGION, secrets: WEB_PUSH_SECRETS }, async (request) => {
  const actor = await requireSupportOperator(request);
  await consumeDailyQuota(actor, "notificationTests", 5);
  const settings = (await db.doc(`users/${actor}/private/settings`).get()).data() as UserSettings | undefined;
  return sendWebPushToUser(actor, { kind: "test", title: "Paire test notification", body: "Notifications are connected. This is a test you requested.", tag: "paire-owner-test", data: { type: "test" } }, settings);
});
