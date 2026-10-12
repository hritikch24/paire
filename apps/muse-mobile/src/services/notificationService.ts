import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { deleteDoc, doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { features } from "../config/features";
import { useAuthStore } from "../store/authStore";
import { db } from "./firebase";

export type PushPermission = "granted" | "denied" | "undetermined";

/** Channel ids must match what the Cloud Functions send (android.notification.channelId). */
export const CHANNELS = {
  messages: "messages",
  matches: "matches",
  reminders: "reminders"
} as const;

let activeChatMatchId: string | null = null;
let registeredToken: string | null = null;
const suppressedMatchAlerts = new Set<string>();

/** While a chat is open, its incoming messages don't also pop a banner. */
export function setActiveChat(matchId: string | null) {
  activeChatMatchId = matchId;
}

export function getActiveChat(): string | null {
  return activeChatMatchId;
}

/** True once the backend can reach this device by push, so the app needn't alert itself. */
export function isPushRegistered(): boolean {
  return registeredToken !== null;
}

/** A match the member just made themselves already has its own celebration. */
export function suppressMatchAlert(matchId: string) {
  suppressedMatchAlerts.add(matchId);
}

export function isMatchAlertSuppressed(matchId: string): boolean {
  return suppressedMatchAlerts.has(matchId);
}

/**
 * Shows a notification from the app itself (used when push isn't available).
 * Returns false if notifications aren't allowed.
 */
export async function showLocalAlert(
  channel: keyof typeof CHANNELS,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<boolean> {
  if ((await getPushPermission()) !== "granted") return false;
  const previews = useAuthStore.getState().settings?.notifications?.previews === true;
  await Notifications.scheduleNotificationAsync({
    content: { title: previews ? title : "Paire", body: previews ? body : channel === "messages" ? "You have a new message." : "You have a new connection.", data, sound: "default" },
    trigger: Platform.OS === "android" ? { channelId: CHANNELS[channel] } : null
  });
  return true;
}

export function configureNotifications() {
  if (Platform.OS === "web") return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as { type?: string; matchId?: string };
      const hideForOpenChat = data.type === "message" && Boolean(data.matchId) && data.matchId === activeChatMatchId;
      return {
        shouldShowBanner: !hideForOpenChat,
        shouldShowList: !hideForOpenChat,
        shouldPlaySound: !hideForOpenChat,
        shouldSetBadge: false
      };
    }
  });

  if (Platform.OS === "android") {
    // Channels must exist before requesting permission on Android 13+.
    void Notifications.setNotificationChannelAsync(CHANNELS.messages, {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#B83A5E"
    });
    void Notifications.setNotificationChannelAsync(CHANNELS.matches, {
      name: "New matches",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#B83A5E"
    });
    void Notifications.setNotificationChannelAsync(CHANNELS.reminders, {
      name: "Safety check-ins",
      importance: Notifications.AndroidImportance.HIGH
    });
  }
}

export async function getPushPermission(): Promise<PushPermission> {
  if (Platform.OS === "web") return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  return status as PushPermission;
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (Platform.OS === "web") return "denied";
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return "granted";
  if (!current.canAskAgain) return "denied";
  const { status } = await Notifications.requestPermissionsAsync();
  return status as PushPermission;
}

const tokenDocId = (token: string) => token.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 400);

/**
 * Saves this device's FCM token so the backend can notify it. Android only:
 * the Cloud Functions deliver through FCM, which needs google-services.json.
 */
export async function registerPushToken(uid: string): Promise<boolean> {
  if (!features.push || Platform.OS !== "android") return false;
  if ((await getPushPermission()) !== "granted") return false;
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data !== "string" || !data) return false;
    registeredToken = data;
    await setDoc(doc(db, "users", uid, "devices", tokenDocId(data)), {
      token: data,
      platform: "android",
      updatedAt: Date.now()
    });
    return true;
  } catch {
    // No Google Play services (some emulators) or FCM not configured.
    return false;
  }
}

export async function unregisterPushToken(uid: string) {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await deleteDoc(doc(db, "users", uid, "devices", tokenDocId(token)));
}

/** Local reminder used by the Safety Center check-in timer. */
export async function scheduleCheckIn(minutes: number): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Safety check-in",
      body: "How's your date going? Tap to open your Safety Center.",
      data: { type: "safety-checkin" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(60, Math.round(minutes * 60)),
      channelId: CHANNELS.reminders
    }
  });
}

export async function cancelScheduledNotification(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}
