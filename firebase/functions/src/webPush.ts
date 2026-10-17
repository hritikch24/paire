import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import * as webPush from "web-push";
import { db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { consumeDailyQuota } from "./quota";
import { parseBrowserSubscription, subscriptionId } from "./lib/webPush";
import { notificationCopy } from "./lib/notificationPrivacy";
import type { PushMessage } from "./push";
import type { UserSettings } from "./types";

const privateKey = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
export const WEB_PUSH_SECRETS = [privateKey];
const publicKey = () => process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "";

export const getWebPushConfig = onCall({ region: REGION }, async (request) => {
  requireAuth(request);
  return { publicKey: publicKey(), available: Boolean(publicKey()) };
});

export const registerWebPush = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const subscription = parseBrowserSubscription(request.data?.subscription);
  if (!subscription) throw new HttpsError("invalid-argument", "That browser subscription isn't valid.");
  if (!publicKey()) throw new HttpsError("failed-precondition", "Browser notifications aren't available yet.");
  await consumeDailyQuota(uid, "webPushRegistrations", 30);
  // One subscription belongs to one account, including when a browser switches accounts.
  await db.doc(`webPushSubscriptions/${subscriptionId(subscription.endpoint)}`).set({ uid, ...subscription, updatedAt: Date.now() });
  const devices = await db.collection("webPushSubscriptions").where("uid", "==", uid).get();
  const oldest = devices.docs.sort((a, b) => Number(b.get("updatedAt")) - Number(a.get("updatedAt"))).slice(10);
  await Promise.all(oldest.map((doc) => doc.ref.delete()));
  return { registered: true };
});

export const unregisterWebPush = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const endpoint = request.data?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2048) throw new HttpsError("invalid-argument", "That browser subscription isn't valid.");
  const ref = db.doc(`webPushSubscriptions/${subscriptionId(endpoint)}`);
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.get("uid") === uid) tx.delete(ref);
  });
  return { registered: false };
});

/** Existing match/message events only. Browser permission and app preferences both apply. */
export async function sendWebPushToUser(uid: string, message: PushMessage, settings: UserSettings | undefined) {
  if (settings?.notifications?.[message.kind] === false || process.env.FUNCTIONS_EMULATOR === "true" || !publicKey()) return;
  try {
    const key = privateKey.value();
    if (!key) return;
    const devices = await db.collection("webPushSubscriptions").where("uid", "==", uid).limit(10).get();
    const copy = notificationCopy(message.kind, message.title, message.body, settings?.notifications?.previews);
    const payload = JSON.stringify({ ...copy, uid, tag: message.tag || message.kind, type: message.data.type, matchId: message.data.matchId || "" });
    await Promise.all(devices.docs.map(async (doc) => {
      const subscription = parseBrowserSubscription(doc.data());
      if (!subscription) { await doc.ref.delete(); return; }
      try {
        await webPush.sendNotification(subscription, payload, {
          vapidDetails: { subject: "https://www.paire.in/contact/", publicKey: publicKey(), privateKey: key },
          TTL: 3600, urgency: "normal", timeout: 10_000,
          topic: subscriptionId(`${message.kind}:${message.tag || "event"}`).slice(0, 32)
        });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Don't delete a subscription that was rebound to a new account during delivery.
          await db.runTransaction(async (tx) => { const current = await tx.get(doc.ref); if (current.get("uid") === uid && current.get("updatedAt") === doc.get("updatedAt")) tx.delete(doc.ref); });
        } else logger.warn("Browser push delivery failed", { status: status || "unknown" });
      }
    }));
  } catch { logger.warn("Browser push unavailable"); }
}
