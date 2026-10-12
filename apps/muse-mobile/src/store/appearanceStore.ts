import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, useColorScheme } from "react-native";
import { create } from "zustand";
import { DEFAULT_PALETTE, isPaletteId, PaletteId, Scheme } from "../theme/palettes";

/** Follow the phone, or always light / always dark. */
export type AppearanceMode = "system" | "light" | "dark";

const STORAGE_KEY = "muse.appearance";
const MODES: AppearanceMode[] = ["system", "light", "dark"];

type AppearanceState = {
  palette: PaletteId;
  mode: AppearanceMode;
  /** Saved choice read from storage (or given up on), so the first frame is already themed. */
  loaded: boolean;
  load: () => Promise<void>;
  setPalette: (palette: PaletteId) => void;
  setMode: (mode: AppearanceMode) => void;
};

function applyMode(mode: AppearanceMode) {
  // Also themes native UI (alerts, keyboard, date pickers). Null = follow the phone.
  Appearance.setColorScheme(mode === "system" ? null : mode);
}

function save(palette: PaletteId, mode: AppearanceMode) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ palette, mode })).catch(() => undefined);
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  palette: DEFAULT_PALETTE,
  mode: "system",
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as { palette?: unknown; mode?: unknown }) : {};
      const palette = isPaletteId(saved.palette) ? saved.palette : DEFAULT_PALETTE;
      const mode = MODES.includes(saved.mode as AppearanceMode) ? (saved.mode as AppearanceMode) : "system";
      if (mode !== "system") applyMode(mode);
      set({ palette, mode, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  setPalette: (palette) => {
    set({ palette });
    save(palette, get().mode);
  },
  setMode: (mode) => {
    applyMode(mode);
    set({ mode });
    save(get().palette, mode);
  }
}));

/**
 * Light or dark, straight from the saved choice. Android applies a forced mode
 * asynchronously, so reading the system scheme alone could show a frame of the
 * wrong one.
 */
export function useScheme(): Scheme {
  const mode = useAppearanceStore((state) => state.mode);
  const system = useColorScheme();
  if (mode !== "system") return mode;
  return system === "dark" ? "dark" : "light";
}
