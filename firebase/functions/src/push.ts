import { logger } from "firebase-functions";
import { db, messaging } from "./admin";
import { UserSettings } from "./types";
import { notificationCopy } from "./lib/notificationPrivacy";

export type PushKind = "matches" | "messages";

export type PushMessage = {
  kind: PushKind;
  title: string;
  body: string;
  data: Record<string, string>;
  /** Replaces an earlier notification with the same tag (e.g. one per chat). */
  tag?: string;
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument"
]);

/**
 * Sends a push to every Android device registered under users/{uid}/devices,
 * honouring the user's notification preferences. Tokens that FCM reports as
 * dead are removed. Never throws: a failed push must not fail the caller.
 */
export async function sendPushToUser(uid: string, message: PushMessage): Promise<void> {
  try {
    const [settingsSnap, devicesSnap] = await Promise.all([
      db.doc(`users/${uid}/private/settings`).get(),
      db.collection(`users/${uid}/devices`).get()
    ]);
    const settings = settingsSnap.data() as UserSettings | undefined;
    if (settings?.notifications?.[message.kind] === false) return;

    // Device tokens from expo-notifications are FCM tokens on Android only.
    const devices = devicesSnap.docs.filter((doc) => {
      const data = doc.data();
      return typeof data.token === "string" && data.token.length > 0 && data.platform === "android";
    });
    if (!devices.length) return;

    const response = await messaging().sendEachForMulticast({
      tokens: devices.map((doc) => doc.get("token") as string),
      notification: notificationCopy(message.kind, message.title, message.body, settings?.notifications?.previews),
      data: { ...message.data, kind: message.kind },
      android: {
        priority: "high",
        notification: {
          channelId: message.kind,
          tag: message.tag,
          sound: "default"
        }
      }
    });

    const stale = response.responses
      .map((result, index) => ({ result, doc: devices[index] }))
      .filter(({ result }) => !result.success && INVALID_TOKEN_CODES.has(result.error?.code ?? ""));
    await Promise.all(stale.map(({ doc }) => doc.ref.delete()));
  } catch (error) {
    logger.warn("Push delivery failed", { uid, kind: message.kind, error: String(error) });
  }
}
