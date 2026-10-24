declare const require: (name: string) => any;
declare const __dirname: string;
const { readFileSync } = require("fs");
const { join } = require("path");
import { DIWALI_LABELS, DIWALI_SEASON, DIWALI_VIBES, diwaliBadge, diwaliDates, diwaliDayLabel, diwaliOpen, normalizeDiwaliPlan, sharedDiwaliPlans } from "../src/data/diwali";
import { withSettingsDefaults } from "../src/utils/profile";

// Noon IST on a given day.
const at = (date: string) => Date.parse(`${date}T06:30:00Z`);
const now = at("2026-11-04");

describe("Diwali Together (browser app)", () => {
  test("shares its season, activities and labels with the server", () => {
    const server = readFileSync(join(__dirname, "../../../firebase/functions/src/lib/diwali.ts"), "utf8");
    const field = (name: string) => new RegExp(`${name}: "([^"]+)"`).exec(server)?.[1];
    expect(field("id")).toBe(DIWALI_SEASON.id);
    expect(field("opensOn")).toBe(DIWALI_SEASON.opensOn);
    expect(field("firstDay")).toBe(DIWALI_SEASON.firstDay);
    expect(field("lastDay")).toBe(DIWALI_SEASON.lastDay);
    expect(server).toContain(`DIWALI_VIBES = ${JSON.stringify(DIWALI_VIBES).replace(/,/g, ", ")} as const`);
    for (const vibe of DIWALI_VIBES) expect(server).toContain(`${vibe}: "${DIWALI_LABELS[vibe]}"`);
  });
  test("the campaign closes on its own after 10 November IST", () => {
    expect(diwaliOpen(Date.parse("2026-10-23T18:29:00Z"))).toBe(false);
    expect(diwaliOpen(Date.parse("2026-10-23T18:30:00Z"))).toBe(true);
    expect(diwaliOpen(Date.parse("2026-11-10T18:29:00Z"))).toBe(true);
    expect(diwaliOpen(Date.parse("2026-11-10T18:30:00Z"))).toBe(false);
    expect(diwaliDates(at("2026-11-11"))).toEqual([]);
  });
  test("offers only days still to come and labels them for India", () => {
    expect(diwaliDates(at("2026-11-08"))).toEqual(["2026-11-08", "2026-11-09", "2026-11-10"]);
    expect(diwaliDayLabel("2026-11-08")).toBe("Sun, 8 Nov");
  });
  test("keeps at most three valid days and activities", () => {
    expect(normalizeDiwaliPlan({ dates: ["2026-11-10", "2026-11-05", "2026-11-06", "2026-11-07", "bad"], vibes: ["bash", "bash", "chai", "meal", "mela", "x"] }, now))
      .toEqual({ dates: ["2026-11-05", "2026-11-06", "2026-11-07"], vibes: ["bash", "chai", "meal"] });
    expect(normalizeDiwaliPlan({ dates: ["2026-11-05"], vibes: [] }, now)).toBeNull();
    expect(normalizeDiwaliPlan({ dates: ["2026-11-05"], vibes: ["chai"] }, at("2026-11-11"))).toBeNull();
  });
  test("settings loaded from the server keep a live plan and drop an expired one", () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      expect(withSettingsDefaults({ diwaliPlan: { dates: ["2026-11-08"], vibes: ["chai"] } }).diwaliPlan).toEqual({ dates: ["2026-11-08"], vibes: ["chai"] });
      jest.setSystemTime(at("2026-11-11"));
      expect(withSettingsDefaults({ diwaliPlan: { dates: ["2026-11-08"], vibes: ["chai"] } }).diwaliPlan).toBeNull();
    } finally { jest.useRealTimers(); }
    expect(withSettingsDefaults({}).diwaliPlan).toBeNull();
    expect(withSettingsDefaults({ diwaliPlan: { dates: ["nope"], vibes: ["chai"] } }).diwaliPlan).toBeNull();
  });
  test("shares only counts and activity labels", () => {
    const shared = sharedDiwaliPlans({ dates: ["2026-11-08", "2026-11-09"], vibes: ["chai", "bash"] }, { dates: ["2026-11-09"], vibes: ["bash"] }, now);
    expect(shared).toEqual({ days: 1, vibes: ["bash"] });
    expect(diwaliBadge(shared!)).toBe("🪔 Diwali together · Diwali bash");
    expect(diwaliBadge({ days: 1, vibes: [] })).toBe("🪔 Diwali together");
  });
});
