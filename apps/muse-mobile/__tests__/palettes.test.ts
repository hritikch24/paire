import { PALETTE_IDS, PALETTES, themeFor } from "../src/theme/palettes";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("themes", () => {
  test.each(PALETTE_IDS.flatMap((id) => (["light", "dark"] as const).map((scheme) => [id, scheme] as const)))(
    "%s (%s) is readable",
    (id, scheme) => {
      const colors = PALETTES[id][scheme];
      // WCAG AA for body text and button labels.
      expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.textMuted, colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.text, colors.backgroundStrong)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.primaryForeground, colors.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.primaryForeground, colors.primaryPressed)).toBeGreaterThanOrEqual(4.5);
      // White text sits on the hero gradient's first two stops.
      expect(contrast("#FFFFFF", PALETTES[id].gradient[0])).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#FFFFFF", PALETTES[id].gradient[1])).toBeGreaterThanOrEqual(3);
      expect(contrast("#FFFFFF", PALETTES[id].gradient[2])).toBeGreaterThanOrEqual(3);
    }
  );

  test("every theme has the same keys, so no screen is missing a colour", () => {
    const keys = Object.keys(themeFor(PALETTES.rose, "light")).sort();
    for (const id of PALETTE_IDS) {
      expect(Object.keys(themeFor(PALETTES[id], "light")).sort()).toEqual(keys);
      expect(Object.keys(themeFor(PALETTES[id], "dark")).sort()).toEqual(keys);
    }
  });
});
