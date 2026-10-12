import { useTheme } from "tamagui";

type ThemeValue = { val?: string } | undefined;

/** Plain colour strings from the active theme, for components outside Tamagui (gradients, icons). */
export function useThemeColors() {
  const theme = useTheme() as unknown as Record<string, ThemeValue>;
  const color = (key: string, fallback: string) => theme[key]?.val ?? fallback;
  return {
    gradient: [
      color("gradientStart", "#3A1236"),
      color("gradientMid", "#9A2C5A"),
      color("gradientEnd", "#EE7A82")
    ] as const,
    glow: color("glow", "#FFD6E2"),
    primary: color("primary", "#B83A5E"),
    background: color("background", "#FBF8F6")
  };
}
