import { createFont, createTamagui, createTokens } from "tamagui";
import { animations } from "@tamagui/config";
import { DEFAULT_PALETTE, PALETTE_IDS, PALETTES, PaletteId, Scheme, themeFor } from "./src/theme/palettes";

// One typeface and one scale for the whole app. Every <Text> uses it through
// `defaultFont` below; without that, plain Text fell back to the system font.
const spaceGrotesk = createFont({
  // Android only knows the per-weight font names, so the default must be one of them.
  family: "SpaceGrotesk_400Regular",
  size: {
    1: 13, // captions, timestamps, footnotes
    2: 14, // secondary text, chips
    3: 16, // body
    true: 16,
    4: 17, // row labels, emphasised body
    5: 20, // section titles
    6: 22, // card titles
    7: 26, // screen titles (compact)
    8: 30, // screen titles
    9: 34 // display
  },
  lineHeight: {
    1: 18,
    2: 20,
    3: 22,
    true: 22,
    4: 24,
    5: 26,
    6: 28,
    7: 32,
    8: 36,
    9: 40
  },
  weight: {
    3: "400",
    4: "500",
    5: "600",
    6: "700"
  },
  // No negative tracking: Android clips the last glyph of tightly tracked bold text.
  letterSpacing: {
    3: 0,
    4: 0,
    5: 0,
    6: 0
  },
  face: {
    400: { normal: "SpaceGrotesk_400Regular" },
    500: { normal: "SpaceGrotesk_500Medium" },
    600: { normal: "SpaceGrotesk_600SemiBold" },
    700: { normal: "SpaceGrotesk_700Bold" }
  }
});

const tokens = createTokens({
  color: {
    ink: "#1F1A24",
    cream: "#FBF8F6",
    sand: "#F3ECE9",
    rose: "#B83A5E",
    roseDeep: "#9E2F4F",
    roseSoft: "#F8E4EA",
    night: "#141016",
    plum: "#1D171F",
    moon: "#F3EEF2",
    like: "#2E9E6B",
    nope: "#E0564F",
    superLike: "#4F6BED",
    warning: "#C78B4A",
    success: "#2E9E6B",
    error: "#C8453D"
  },
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    true: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 40
  },
  size: {
    1: 28,
    2: 32,
    3: 36,
    4: 44,
    true: 44,
    5: 52,
    6: 60,
    7: 72,
    8: 88,
    9: 104
  },
  radius: {
    1: 8,
    2: 12,
    3: 16,
    4: 20,
    5: 24,
    6: 28
  },
  zIndex: {
    1: 0,
    2: 10,
    3: 20,
    4: 30,
    5: 40
  }
});

const shorthands = {
  p: "padding",
  px: "paddingHorizontal",
  py: "paddingVertical",
  m: "margin",
  mx: "marginHorizontal",
  my: "marginVertical",
  bg: "backgroundColor",
  w: "width",
  h: "height"
} as const;

// Every palette (src/theme/palettes.ts) as light_<id> / dark_<id>; the app picks
// one with <Theme name={paletteId}>. Plain light/dark are the signature palette.
const paletteThemes = Object.fromEntries(
  PALETTE_IDS.flatMap((id) => [
    [`light_${id}`, themeFor(PALETTES[id], "light")],
    [`dark_${id}`, themeFor(PALETTES[id], "dark")]
  ])
) as Record<`${Scheme}_${PaletteId}`, ReturnType<typeof themeFor>>;

const config = createTamagui({
  defaultFont: "body",
  defaultTheme: "light",
  themeClassNameOnRoot: false,
  shorthands,
  animations,
  fonts: {
    heading: spaceGrotesk,
    body: spaceGrotesk
  },
  tokens,
  themes: {
    light: themeFor(PALETTES[DEFAULT_PALETTE], "light"),
    dark: themeFor(PALETTES[DEFAULT_PALETTE], "dark"),
    ...paletteThemes
  }
});

export type AppConfig = typeof config;
export default config;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
