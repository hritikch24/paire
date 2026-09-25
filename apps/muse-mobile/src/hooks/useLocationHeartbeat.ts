import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { useAuthStore } from "../store/authStore";

const UPDATE_WINDOW_MS = 15 * 60 * 1000;

export function useLocationHeartbeat() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const isGuest = useAuthStore((state) => state.isGuest);
  const lastUpdatedRef = useRef(0);

  const updateLocation = useCallback(async () => {
    if (!user || isGuest || !profile?.shareLocation) return;
    const now = Date.now();
    if (now - lastUpdatedRef.current < UPDATE_WINDOW_MS) return;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return;

    lastUpdatedRef.current = now;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    const location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      updatedAt: now
    };

    setProfile({ ...profile, location, updatedAt: now });
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { location, updatedAt: now },
        { merge: true }
      );
    } catch {
      // Best-effort update.
    }
  }, [isGuest, profile, setProfile, user]);

  useEffect(() => {
    if (!user || isGuest || !profile?.shareLocation) return;
    void updateLocation();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void updateLocation();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isGuest, profile?.shareLocation, updateLocation, user]);
}
