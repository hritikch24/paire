import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { useAuthStore } from "../store/authStore";

const UPDATE_WINDOW_MS = 2 * 60 * 1000;

export function useLastActive() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const isGuest = useAuthStore((state) => state.isGuest);
  const lastUpdatedRef = useRef(0);

  const updateLastActive = useCallback(async () => {
    if (!user || isGuest) return;
    const now = Date.now();
    if (now - lastUpdatedRef.current < UPDATE_WINDOW_MS) return;
    lastUpdatedRef.current = now;
    if (profile) {
      setProfile({ ...profile, lastActiveAt: now, updatedAt: now });
    }
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { lastActiveAt: now, updatedAt: now },
        { merge: true }
      );
    } catch {
      // Best-effort update.
    }
  }, [isGuest, profile, setProfile, user]);

  useEffect(() => {
    if (!user || isGuest) return;
    void updateLastActive();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void updateLastActive();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isGuest, updateLastActive, user]);
}
