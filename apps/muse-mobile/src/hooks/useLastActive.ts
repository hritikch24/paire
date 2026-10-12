import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { refreshAgeIfNeeded, touchLastActive } from "../services/profileService";
import { useAuthStore } from "../store/authStore";
import { needsOnboarding } from "../utils/profile";

const MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Updates lastActiveAt when the app comes to the foreground (at most every
 * five minutes), which keeps active members near the top of feeds. Also keeps
 * the public age current after a birthday.
 */
export function useLastActive() {
  const uid = useAuthStore((state) => state.user?.uid);
  const ready = useAuthStore((state) => !needsOnboarding(state.profile));
  const lastRun = useRef(0);

  useEffect(() => {
    if (!uid || !ready) return;

    const heartbeat = () => {
      const now = Date.now();
      if (now - lastRun.current < MIN_INTERVAL_MS) return;
      lastRun.current = now;
      const { profile, info } = useAuthStore.getState();
      void touchLastActive(uid).catch(() => undefined);
      if (profile) void refreshAgeIfNeeded(uid, profile, info).catch(() => undefined);
    };

    heartbeat();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") heartbeat();
    });
    return () => subscription.remove();
  }, [ready, uid]);
}
