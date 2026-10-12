/**
 * Colour themes members can pick in Settings → Appearance. Each has a light and
 * a dark variant; tamagui.config.ts turns them into `light_<id>` / `dark_<id>`
 * themes, and the app wraps everything in <Theme name={id}>.
 *
 * Contrast: `primaryForeground` on `primary` and `text`/`textMuted` on
 * `background` are all at least 4.5:1 (checked in __tests__/palettes.test.ts).
 */

export type Scheme = "light" | "dark";

export type SchemeColors = {
  background: string;
  backgroundStrong: string;
  backgroundSoft: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primaryForeground: string;
  border: string;
  card: string;
};

export type Palette = {
  id: PaletteId;
  name: string;
  description: string;
  /** Hero backgrounds (welcome, splash, match moment, cards without photos). */
  gradient: [string, string, string];
  /** Soft highlight used on top of photos and gradients (sparkles, reasons). */
  glow: string;
  light: SchemeColors;
  dark: SchemeColors;
};

export const PALETTE_IDS = ["rose", "classic", "noir", "ocean", "lavender", "sunset", "forest"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export const DEFAULT_PALETTE: PaletteId = "rose";

export const PALETTES: Record<PaletteId, Palette> = {
  rose: {
    id: "rose",
    name: "Paire Rose",
    description: "Our signature: warm rose on cream",
    gradient: ["#3A1236", "#9A2C5A", "#D86E76"],
    glow: "#FFD6E2",
    light: {
      background: "#FBF8F6",
      backgroundStrong: "#FFFFFF",
      backgroundSoft: "#F3ECE9",
      text: "#1F1A24",
      textMuted: "#6D6672",
      primary: "#B83A5E",
      primaryPressed: "#9E2F4F",
      primarySoft: "#F8E4EA",
      primaryForeground: "#FFFFFF",
      border: "#EADFE0",
      card: "#FFFFFF"
    },
    dark: {
      background: "#141016",
      backgroundStrong: "#1D171F",
      backgroundSoft: "#2A222C",
      text: "#F3EEF2",
      textMuted: "#B3A9B6",
      primary: "#C2476C",
      primaryPressed: "#A93C5E",
      primarySoft: "#3A2330",
      primaryForeground: "#FFFFFF",
      border: "#2D2530",
      card: "#1D171F"
    }
  },
  classic: {
    id: "classic",
    name: "Classic Ivory",
    description: "Ivory paper and deep wine, timeless",
    gradient: ["#2A1718", "#5E1B2A", "#A8505A"],
    glow: "#F3D9A4",
    light: {
      background: "#F8F4EC",
      backgroundStrong: "#FFFDF8",
      backgroundSoft: "#EFE8DA",
      text: "#2A2320",
      textMuted: "#6A6158",
      primary: "#7B2334",
      primaryPressed: "#641B2A",
      primarySoft: "#F1E1E0",
      primaryForeground: "#FFFDF8",
      border: "#E4D9C6",
      card: "#FFFDF8"
    },
    dark: {
      background: "#16120F",
      backgroundStrong: "#211B17",
      backgroundSoft: "#2C241F",
      text: "#F4EDE2",
      textMuted: "#B9AD9E",
      primary: "#A3404F",
      primaryPressed: "#8C3643",
      primarySoft: "#3A2226",
      primaryForeground: "#FFFDF8",
      border: "#33291F",
      card: "#211B17"
    }
  },
  noir: {
    id: "noir",
    name: "Noir",
    description: "Black and white, nothing else",
    gradient: ["#0B0B0C", "#2B2B2E", "#5A5A60"],
    glow: "#FFFFFF",
    light: {
      background: "#F7F7F5",
      backgroundStrong: "#FFFFFF",
      backgroundSoft: "#ECECEA",
      text: "#111111",
      textMuted: "#5F5F5F",
      primary: "#111111",
      primaryPressed: "#333333",
      primarySoft: "#E6E6E3",
      primaryForeground: "#FFFFFF",
      border: "#E2E2DF",
      card: "#FFFFFF"
    },
    dark: {
      background: "#0A0A0A",
      backgroundStrong: "#151515",
      backgroundSoft: "#202020",
      text: "#F2F2F2",
      textMuted: "#A3A3A3",
      primary: "#F2F2F2",
      primaryPressed: "#D0D0D0",
      primarySoft: "#2A2A2A",
      primaryForeground: "#111111",
      border: "#262626",
      card: "#151515"
    }
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    description: "Cool teal and deep navy",
    gradient: ["#0B2540", "#155E7E", "#3B9CA9"],
    glow: "#BDEBF2",
    light: {
      background: "#F4F8FA",
      backgroundStrong: "#FFFFFF",
      backgroundSoft: "#E6EFF3",
      text: "#13212B",
      textMuted: "#56666F",
      primary: "#1B6C8C",
      primaryPressed: "#155A75",
      primarySoft: "#DDEEF4",
      primaryForeground: "#FFFFFF",
      border: "#DCE6EB",
      card: "#FFFFFF"
    },
    dark: {
      background: "#0B141A",
      backgroundStrong: "#121E26",
      backgroundSoft: "#1A2932",
      text: "#E8F1F5",
      textMuted: "#9FB3BE",
      primary: "#1F7697",
      primaryPressed: "#196482",
      primarySoft: "#15313D",
      primaryForeground: "#FFFFFF",
      border: "#1F2F38",
      card: "#121E26"
    }
  },
  lavender: {
    id: "lavender",
    name: "Lavender Dusk",
    description: "Soft violet, calm and dreamy",
    gradient: ["#241638", "#5A3E8C", "#A481CA"],
    glow: "#E3D4FA",
    light: {
      background: "#F8F6FB",
      backgroundStrong: "#FFFFFF",
      backgroundSoft: "#EEEAF5",
      text: "#1F1A2B",
      textMuted: "#655E75",
      primary: "#6B4FA0",
      primaryPressed: "#5A418A",
      primarySoft: "#ECE4F7",
      primaryForeground: "#FFFFFF",
      border: "#E4DDEE",
      card: "#FFFFFF"
    },
    dark: {
      background: "#120F18",
      backgroundStrong: "#1B1724",
      backgroundSoft: "#262031",
      text: "#EFEAF7",
      textMuted: "#ADA5BD",
      primary: "#7659AD",
      primaryPressed: "#654A97",
      primarySoft: "#2D2440",
      primaryForeground: "#FFFFFF",
      border: "#2A2335",
      card: "#1B1724"
    }
  },
  sunset: {
    id: "sunset",
    name: "Sunset",
    description: "Golden-hour coral and amber",
    gradient: ["#3B1520", "#B3412F", "#C67D48"],
    glow: "#FFD9B8",
    light: {
      background: "#FCF7F3",
      backgroundStrong: "#FFFFFF",
      backgroundSoft: "#F5EAE2",
      text: "#2A1C17",
      textMuted: "#6F5F57",
      primary: "#B9452B",
      primaryPressed: "#9C3923",
      primarySoft: "#FBE3DA",
      primaryForeground: "#FFFFFF",
      border: "#EFDFD5",
      card: "#FFFFFF"
    },
    dark: {
      background: "#17100E",
      backgroundStrong: "#211714",
      backgroundSoft: "#2E211C",
      text: "#F7ECE6",
      textMuted: "#BCA89E",
      primary: "#B9452B",
      primaryPressed: "#9C3923",
      primarySoft: "#3D231C",
      primaryForeground: "#FFFFFF",
      border: "#33251F",
      card: "#211714"
    }
  },
  forest: {
    id: "forest",
    name: "Forest",
    description: "Sage and pine, grounded",
    gradient: ["#0F2A1F", "#2F6B4F", "#739C71"],
    glow: "#D5EDC9",
    light: {
      background: "#F5F7F2",
      backgroundStrong: "#FFFFFF",
      backgroundSoft: "#E8EDE2",
      text: "#18221C",
      textMuted: "#59655D",
      primary: "#2F6B4F",
      primaryPressed: "#265A42",
      primarySoft: "#E0EEE4",
      primaryForeground: "#FFFFFF",
      border: "#DDE4D6",
      card: "#FFFFFF"
    },
    dark: {
      background: "#0D1310",
      backgroundStrong: "#151D18",
      backgroundSoft: "#1F2A23",
      text: "#E8F0EA",
      textMuted: "#A2B3A8",
      primary: "#2F7555",
      primaryPressed: "#276447",
      primarySoft: "#1C3328",
      primaryForeground: "#FFFFFF",
      border: "#223028",
      card: "#151D18"
    }
  }
};

export const isPaletteId = (value: unknown): value is PaletteId =>
  typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);

type StatusColors = {
  overlay: string;
  like: string;
  nope: string;
  superLike: string;
  success: string;
  warning: string;
  warningSoft: string;
  error: string;
};

/** Status colours shared by every palette. */
const STATUS: Record<Scheme, StatusColors> = {
  light: {
    overlay: "rgba(20, 14, 22, 0.55)",
    like: "#2E9E6B",
    nope: "#E0564F",
    superLike: "#4F6BED",
    success: "#2E9E6B",
    warning: "#B0712F",
    warningSoft: "#FBF1E4",
    error: "#C8453D"
  },
  dark: {
    overlay: "rgba(6, 4, 8, 0.7)",
    like: "#43B884",
    nope: "#EF6A63",
    superLike: "#7088F5",
    success: "#43B884",
    warning: "#D9A066",
    warningSoft: "#33261A",
    error: "#EF6A63"
  }
};

/** Everything a Tamagui theme needs for one palette in one scheme. */
export function themeFor(palette: Palette, scheme: Scheme) {
  const [gradientStart, gradientMid, gradientEnd] = palette.gradient;
  return {
    ...palette[scheme],
    // Tamagui's default text colour: without it, un-styled Text stays black in dark mode.
    color: palette[scheme].text,
    ...STATUS[scheme],
    gradientStart,
    gradientMid,
    gradientEnd,
    glow: palette.glow
  };
}
