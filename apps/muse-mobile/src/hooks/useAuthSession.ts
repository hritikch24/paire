import { onAuthStateChanged } from "../services/authSdk";
import { doc, onSnapshot } from "@firebase/firestore/dist/index.cjs.js";
import { useEffect } from "react";
import { auth, callFunction, db } from "../services/firebase";
import { queryClient } from "../services/queryClient";
import { useAuthStore } from "../store/authStore";
import { useMatchesStore } from "../store/matchesStore";
import { updateProfile, updateSettings } from "../services/profileService";
import { GENDERS, PrivateInfo, UserProfile, UserSettings } from "../types/models";
import { ageFromBirthDate, MAX_AGE, MIN_AGE } from "../utils/age";
import { withSettingsDefaults } from "../utils/profile";

const isGender = (value: unknown) => (GENDERS as readonly unknown[]).includes(value);

/**
 * Tracks the Firebase session and, while signed in, keeps the member's profile,
 * preferences and private info in the store via live listeners.
 */
export function useAuthSession() {
  const uid = useAuthStore((state) => state.user?.uid);
  const profileAge = useAuthStore((state) => state.profile?.age);
  const birthDate = useAuthStore((state) => state.info?.birthDate);

  // Ages are stored on the profile for matching: move it on after each birthday.
  useEffect(() => {
    if (!uid || typeof profileAge !== "number" || !birthDate) return;
    const age = ageFromBirthDate(birthDate);
    if (age !== profileAge && age >= MIN_AGE && age <= MAX_AGE) {
      void updateProfile(uid, { age }).catch(() => undefined);
    }
  }, [uid, profileAge, birthDate]);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Covers sign-outs that start outside the app too (revoked or deleted accounts).
        queryClient.clear();
        useMatchesStore.getState().reset();
      }
      useAuthStore.getState().setUser(user);
      // Let the server record an already-confirmed email (Google sign-ins, older accounts).
      if (user?.emailVerified) void callFunction("syncAccountChecks").catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    const store = useAuthStore.getState();

    const unsubscribeProfile = onSnapshot(
      doc(db, "users", uid),
      (snapshot) => store.setProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null),
      () => store.setProfile(null)
    );
    const unsubscribeSettings = onSnapshot(
      doc(db, "users", uid, "private", "settings"),
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as Partial<UserSettings>) : null;
        // Older accounts may list a gender Paire no longer offers; the rules check the whole
        // document on every write, so fix it once or every later settings change would fail.
        if (Array.isArray(data?.showMe) && data.showMe.some((gender) => !isGender(gender))) {
          const showMe = data.showMe.filter(isGender);
          void updateSettings(uid, { showMe: showMe.length ? showMe : [...GENDERS] }).catch(() => undefined);
        }
        store.setSettings(data ? withSettingsDefaults(data) : null);
      },
      () => store.setSettings(null)
    );
    const unsubscribeInfo = onSnapshot(
      doc(db, "users", uid, "private", "info"),
      (snapshot) => store.setInfo(snapshot.exists() ? (snapshot.data() as PrivateInfo) : null),
      () => store.setInfo(null)
    );

    return () => {
      unsubscribeProfile();
      unsubscribeSettings();
      unsubscribeInfo();
    };
  }, [uid]);
}
