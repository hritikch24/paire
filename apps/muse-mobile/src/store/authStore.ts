import { User } from "@firebase/auth/dist/rn";
import { create } from "zustand";
import { UserProfile } from "../types/models";

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  isDemo: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setGuest: (profile: UserProfile) => void;
  setDemo: (profile: UserProfile) => void;
  resetAuth: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  isGuest: false,
  isDemo: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setGuest: (profile) =>
    set({
      user: ({
        uid: profile.uid,
        email: "guest@muse.app",
        getIdToken: async () => "guest-token"
      } as unknown as User),
      profile,
      loading: false,
      isGuest: true,
      isDemo: false
    }),
  setDemo: (profile) =>
    set({
      user: ({
        uid: profile.uid,
        email: "demo@muse.app",
        getIdToken: async () => "demo-token"
      } as unknown as User),
      profile,
      loading: false,
      isGuest: false,
      isDemo: true
    }),
  resetAuth: () =>
    set({ user: null, profile: null, loading: false, isGuest: false, isDemo: false })
}));
