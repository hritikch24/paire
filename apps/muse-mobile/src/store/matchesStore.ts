import { create } from "zustand";
import { Match } from "../types/models";

type MatchesState = {
  matches: Match[];
  loaded: boolean;
  failed: boolean;
  /** Bumped to re-create the listener after an error. */
  retryKey: number;
  setMatches: (matches: Match[]) => void;
  setFailed: () => void;
  retry: () => void;
  reset: () => void;
};

/** Live list of active matches, fed by a single Firestore listener in the app stack. */
export const useMatchesStore = create<MatchesState>((set) => ({
  matches: [],
  loaded: false,
  failed: false,
  retryKey: 0,
  setMatches: (matches) => set({ matches, loaded: true, failed: false }),
  setFailed: () => set({ loaded: true, failed: true }),
  retry: () => set((state) => ({ loaded: false, failed: false, retryKey: state.retryKey + 1 })),
  reset: () => set({ matches: [], loaded: false, failed: false })
}));
