import { isSupportView } from "../services/supportMode";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { currentApproximateLocation } from "../services/locationService";
import { updateSettings } from "../services/profileService";
import { useAuthStore } from "../store/authStore";

const MIN_INTERVAL_MS = 30 * 60 * 1000;

/**
 * While location sharing is on, refreshes the approximate location when the app
 * returns to the foreground (never in the background), and only writes when the
 * ~1 km cell actually changed.
 */
export function useLocationHeartbeat() {
  const uid = useAuthStore((state) => state.user?.uid);
  const enabled = useAuthStore((state) => Boolean(state.settings?.locationEnabled));
  const lastRun = useRef(0);

  useEffect(() => {
    if (isSupportView || !uid || !enabled) return;

    const refresh = async () => {
      const now = Date.now();
      if (now - lastRun.current < MIN_INTERVAL_MS) return;
      lastRun.current = now;
      const next = await currentApproximateLocation().catch(() => null);
      if (!next || useAuthStore.getState().user?.uid !== uid || !useAuthStore.getState().settings?.locationEnabled) return;
      const previous = useAuthStore.getState().settings?.location;
      if (previous && previous.lat === next.lat && previous.lng === next.lng &&
        (Platform.OS !== "web" || (previous.updatedAt && now - previous.updatedAt < 24 * 60 * 60_000))) return;
      await updateSettings(uid, { location: next }).catch(() => undefined);
    };

    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [enabled, uid]);
}
