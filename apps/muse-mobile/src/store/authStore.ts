import type { User } from "firebase/auth";
import { create } from "zustand";
import { PrivateInfo, UserProfile, UserSettings } from "../types/models";
import { isDisposableEmail } from "../utils/disposableEmail";

export type SessionStatus = "initializing" | "signedOut" | "signedIn";

type AuthState = {
  status: SessionStatus;
  user: User | null;
  /** Email confirmed (always true for Google sign-ins). Unconfirmed members only see the confirm screen. */
  emailVerified: boolean;
  profile: UserProfile | null;
  profileLoaded: boolean;
  settings: UserSettings | null;
  settingsLoaded: boolean;
  info: PrivateInfo | null;
  infoLoaded: boolean;
  setUser: (user: User | null) => void;
  markEmailVerified: () => void;
  setProfile: (profile: UserProfile | null) => void;
  setSettings: (settings: UserSettings | null) => void;
  setInfo: (info: PrivateInfo | null) => void;
  reset: () => void;
};

const signedOutState = {
  user: null,
  emailVerified: false,
  profile: null,
  profileLoaded: false,
  settings: null,
  settingsLoaded: false,
  info: null,
  infoLoaded: false
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  ...signedOutState,
  setUser: (user) =>
    // A confirmed throwaway inbox still isn't a real one (the server agrees).
    set(user ? { user, emailVerified: user.emailVerified && !isDisposableEmail(user.email), status: "signedIn" } : { ...signedOutState, status: "signedOut" }),
  markEmailVerified: () => set({ emailVerified: true }),
  setProfile: (profile) => set({ profile, profileLoaded: true }),
  setSettings: (settings) => set({ settings, settingsLoaded: true }),
  setInfo: (info) => set({ info, infoLoaded: true }),
  reset: () => set({ ...signedOutState, status: "signedOut" })
}));

/** The signed-in uid, or throws: for use in actions that require a session. */
export function requireUid(): string {
  const uid = useAuthStore.getState().user?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}
