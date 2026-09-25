import { createFont, createTamagui, createTokens } from "tamagui";
import { animations } from "@tamagui/config";

const spaceGrotesk = createFont({
  family: "SpaceGrotesk",
  size: {
    1: 12,
    2: 14,
    3: 16,
    4: 18,
    5: 20,
    6: 24,
    7: 28,
    8: 34,
    9: 40
  },
  lineHeight: {
    1: 16,
    2: 18,
    3: 20,
    4: 22,
    5: 26,
    6: 30,
    7: 34,
    8: 40,
    9: 48
  },
  weight: {
    3: "400",
    4: "500",
    5: "600",
    6: "700"
  },
  letterSpacing: {
    3: 0,
    4: -0.2,
    5: -0.4,
    6: -0.6
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
    ink: "#1C1B22",
    fog: "#F5F2EF",
    sand: "#E8E2DD",
    blush: "#D7E5E1",
    ember: "#0F3D52",
    night: "#0B1018",
    smoke: "#151B25",
    moon: "#F1F4F8",
    mint: "#8CC9BC",
    sky: "#7E9BD0",
    warning: "#C78B4A",
    success: "#4EA988",
    error: "#D36D6D"
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

const lightTheme = {
  background: tokens.color.fog,
  backgroundStrong: "#FFFFFF",
  backgroundSoft: tokens.color.sand,
  text: tokens.color.ink,
  textMuted: "#6D6672",
  primary: tokens.color.ember,
  primarySoft: tokens.color.blush,
  primaryForeground: "#FFFFFF",
  border: "#DED7D4",
  card: "#FFFFFF",
  overlay: "rgba(16, 18, 26, 0.45)"
};

const darkTheme = {
  background: tokens.color.night,
  backgroundStrong: tokens.color.smoke,
  backgroundSoft: "#1D2531",
  text: tokens.color.moon,
  textMuted: "#A5ACB8",
  primary: "#4FB3A3",
  primarySoft: "#1F3437",
  primaryForeground: "#FFFFFF",
  border: "#2A3340",
  card: "#111720",
  overlay: "rgba(6, 9, 14, 0.65)"
};

const config = createTamagui({
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
    light: lightTheme,
    dark: darkTheme
  }
});

export type AppConfig = typeof config;
export default config;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
