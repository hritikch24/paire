import { isSupportView } from "../services/supportMode";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState } from "react-native";
import { showToast } from "../components/Toast";
import { features } from "../config/features";
import { chatTitle, subscribeToMatches } from "../services/matchService";
import {
  getActiveChat,
  isMatchAlertSuppressed,
  isPushRegistered,
  registerPushToken,
  showLocalAlert
} from "../services/notificationService";
import { useAuthStore } from "../store/authStore";
import { useMatchesStore } from "../store/matchesStore";

/** One live listener for your matches, shared by the Matches tab and the tab badge. */
export function useMatchesSubscription() {
  const uid = useAuthStore((state) => state.user?.uid);
  const retryKey = useMatchesStore((state) => state.retryKey);
  useEffect(() => {
    if (!uid) return;
    const store = useMatchesStore.getState();
    return subscribeToMatches(uid, store.setMatches, store.setFailed);
  }, [retryKey, uid]);
}

export function useUnreadTotal(): number {
  const uid = useAuthStore((state) => state.user?.uid);
  return useMatchesStore((state) =>
    uid ? state.matches.reduce((total, match) => total + (match.unread[uid] ?? 0), 0) : 0
  );
}

/** Keeps this device's push token registered for the signed-in member. */
export function usePushRegistration() {
  const uid = useAuthStore((state) => state.user?.uid);
  useEffect(() => {
    if (isSupportView || !uid) return;
    void registerPushToken(uid);
    const subscription = Notifications.addPushTokenListener(() => {
      void registerPushToken(uid);
    });
    return () => subscription.remove();
  }, [uid]);
}

/**
 * Message and match alerts raised by the app itself, for builds without push
 * (like the test build) or before a push token exists. Watches the live matches
 * list: a new message from the other person, or a new match, shows a
 * notification (a banner while the app is open; in the background, for as long
 * as Android keeps the app running). With push active the server sends them.
 */
export function useMatchAlerts() {
  const uid = useAuthStore((state) => state.user?.uid);
  useEffect(() => {
    if (isSupportView || !uid || !features.notifications) return;
    // Snapshot of what's already known, so existing matches and messages don't alert.
    let lastSeen: Map<string, number> | null = null;

    return useMatchesStore.subscribe((state) => {
      if (!state.loaded || state.failed) return;
      const previous = lastSeen;
      lastSeen = new Map(state.matches.map((match) => [match.id, match.lastMessage?.createdAt ?? 0]));
      if (!previous || isPushRegistered()) return;

      for (const match of state.matches) {
        const name = chatTitle(match, uid);
        const data = { matchId: match.id };
        const message = match.lastMessage;
        if (!previous.has(match.id)) {
          // The match can arrive before the swipe that made it returns; give that a moment.
          setTimeout(() => {
            if (isMatchAlertSuppressed(match.id)) return;
            const duo = match.kind === "duo";
          void alert(
            "matches",
            duo ? "It's a Duo match! 🎉" : "It's a match! 💘",
            duo ? `You matched with ${name}. Say hi to everyone!` : `You and ${name} liked each other. Say hi!`,
            { ...data, type: "match" }
          );
          }, 2500);
        } else if (message && message.senderId !== uid && message.createdAt > (previous.get(match.id) ?? 0)) {
          // A moment for the server's safety check, which may replace an abusive preview.
          setTimeout(() => {
            if (getActiveChat() === match.id) return;
            const latest = useMatchesStore.getState().matches.find((item) => item.id === match.id)?.lastMessage;
            const text = latest && latest.createdAt === message.createdAt ? latest.text : message.text;
            const sender = match.profiles[message.senderId]?.displayName ?? name;
            void alert("messages", match.kind === "duo" ? `${sender} · Duo chat` : name, text, { ...data, type: "message" });
          }, MESSAGE_ALERT_DELAY_MS);
        }
      }
    });
  }, [uid]);
}

const MESSAGE_ALERT_DELAY_MS = 1500;

async function alert(channel: "matches" | "messages", title: string, body: string, data: Record<string, string>) {
  const shown = await showLocalAlert(channel, title, body, data).catch(() => false);
  // Notifications turned off: at least tell them while they're in the app.
  if (!shown && AppState.currentState === "active") showToast(`${title}: ${body}`);
}
