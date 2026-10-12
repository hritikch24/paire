import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { openChat, openDuo, openSafetyCenter } from "../navigation/navigationRef";

/** Opens the right screen when a notification is tapped, including on cold start. */
export function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handled = new Set<string>();
    const route = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      handled.add(id);
      const data = (response.notification.request.content.data ?? {}) as { type?: string; matchId?: string };
      if ((data.type === "message" || data.type === "match") && data.matchId) {
        openChat(data.matchId);
      } else if (data.type === "duo") {
        openDuo();
      } else if (data.type === "safety-checkin") {
        openSafetyCenter();
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(route).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(route);
    return () => subscription.remove();
  }, []);
}
