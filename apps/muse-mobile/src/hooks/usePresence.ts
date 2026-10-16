import { useIsFocused } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { navigationRef } from "../navigation/navigationRef";
import { fetchPresence, markPresenceActivity, startPresence, stopPresence } from "../services/presenceService";
import { useAuthStore } from "../store/authStore";
import { nextPresenceChange, presenceStatus, PresenceStatus } from "../utils/presence";

/**
 * Runs this device's presence session while signed in and sharing activity
 * (Settings → "Show when I'm active"). Mounted once, in the app stack.
 */
export function usePresenceSession() {
  const uid = useAuthStore((state) => state.user?.uid);
  const sharing = useAuthStore((state) => state.settings?.showPresence !== false);
  useEffect(() => {
    if (!uid || !sharing) return;
    startPresence(uid);
    // Moving between screens is an interaction.
    const unsubscribe = navigationRef.addListener("state", markPresenceActivity);
    return () => {
      unsubscribe();
      void stopPresence();
    };
  }, [sharing, uid]);
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active" || AppState.currentState == null);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}

/** Presence is switched on for Paire (runtime/presence), for showing the setting. */
export function usePresenceEnabled(): boolean {
  const uid = useAuthStore((state) => state.user?.uid);
  const query = useQuery({ queryKey: ["presence-config", uid], queryFn: () => fetchPresence([]), enabled: Boolean(uid), staleTime: 10 * 60_000, retry: false });
  return query.data?.enabled === true;
}

/**
 * Online / last-active for up to 50 people you share an active chat with,
 * polled only while this screen is focused and the app is in the foreground.
 * Re-renders by itself when someone's online window ends, without waiting for
 * a new answer, so nobody is shown online after going idle.
 */
export function usePresence(uids: string[], intervalMs = 60_000): { enabled: boolean; statusOf: (uid: string) => PresenceStatus | null } {
  const focused = useIsFocused();
  const appActive = useAppActive();
  const key = useMemo(() => [...new Set(uids.filter(Boolean))].sort().slice(0, 50), [uids]);
  const query = useQuery({
    queryKey: ["presence", key.join(",")],
    queryFn: () => fetchPresence(key),
    enabled: key.length > 0 && focused && appActive,
    refetchInterval: intervalMs,
    staleTime: intervalMs / 2,
    retry: false
  });
  const data = query.data;
  const offset = data ? data.receivedAt - data.serverNow : 0;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!data || !focused) return;
    const current = Date.now();
    const next = nextPresenceChange(data.members, offset, current);
    // Also refresh "Active 5 min ago" labels once a minute.
    const wait = Math.min(next === null ? 60_000 : next - current + 50, 60_000);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(250, wait));
    return () => clearTimeout(timer);
  }, [data, focused, now, offset]);
  // Stale answers (the app was in the background) say nothing rather than something wrong.
  const fresh = data && appActive && now - data.receivedAt < Math.max(3 * intervalMs, 3 * 60_000);
  return {
    enabled: data?.enabled === true,
    statusOf: (uid: string) => (fresh && data?.enabled ? presenceStatus(data.members[uid], offset, now) : null)
  };
}
