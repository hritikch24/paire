import type { User } from "firebase/auth";
import { create } from "zustand";
import { PrivateInfo, UserProfile, UserSettings } from "../types/models";

export type SessionStatus = "initializing" | "signedOut" | "signedIn";

type AuthState = {
  status: SessionStatus;
  user: User | null;
  profile: UserProfile | null;
  profileLoaded: boolean;
  settings: UserSettings | null;
  settingsLoaded: boolean;
  info: PrivateInfo | null;
  infoLoaded: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setSettings: (settings: UserSettings | null) => void;
  setInfo: (info: PrivateInfo | null) => void;
  reset: () => void;
};

const signedOutState = {
  user: null,
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
    set(user ? { user, status: "signedIn" } : { ...signedOutState, status: "signedOut" }),
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
