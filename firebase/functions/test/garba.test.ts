import { garbaOpener } from "../src/lib/suggestions";
import { activeGarbaSeason, garbaNightLabel, istDate, seasonNights, sharedGarbaNights, upcomingGarbaNights } from "../src/lib/garba";
import { buildDiscoveryEntry } from "../src/lib/discovery";
import { parseFeedInput } from "../src/lib/validate";

// Noon IST on a given day.
const at = (date: string) => Date.parse(`${date}T06:30:00Z`);
const profile = { displayName: "A", gender: "woman" as const, age: 24, isDiscoverable: true, onboardingComplete: true };

describe("Garba Nights", () => {
  test("dates are India dates", () => {
    expect(istDate(Date.parse("2026-10-14T19:00:00Z"))).toBe("2026-10-15");
    expect(istDate(Date.parse("2026-10-14T18:00:00Z"))).toBe("2026-10-14");
  });

  test("the 2026 season covers the nine nights and Dussehra", () => {
    const season = activeGarbaSeason(at("2026-10-12"))!;
    expect(season.id).toBe("2026");
    expect(seasonNights(season)).toHaveLength(10);
    expect(seasonNights(season)[0]).toBe("2026-10-11");
    expect(seasonNights(season)[9]).toBe("2026-10-20");
  });

  test("the edition opens ten days early and closes after Dussehra", () => {
    expect(activeGarbaSeason(at("2026-09-30"))).toBeNull();
    expect(activeGarbaSeason(at("2026-10-01"))?.id).toBe("2026");
    expect(activeGarbaSeason(at("2026-10-20"))?.id).toBe("2026");
    expect(activeGarbaSeason(at("2026-10-21"))).toBeNull();
  });

  test("only real, upcoming nights of the open season count", () => {
    const now = at("2026-10-14");
    expect(upcomingGarbaNights(["2026-10-16", "2026-10-13", "2026-10-14", "2026-10-16", "2026-10-25", "x", 5], now)).toEqual([
      "2026-10-14",
      "2026-10-16"
    ]);
    expect(upcomingGarbaNights("2026-10-16", now)).toEqual([]);
    expect(upcomingGarbaNights(["2026-10-16"], at("2026-11-01"))).toEqual([]);
  });

  test("shared nights are the ones both are still going to", () => {
    const now = at("2026-10-14");
    expect(sharedGarbaNights(["2026-10-13", "2026-10-15", "2026-10-17"], ["2026-10-13", "2026-10-17", "2026-10-18"], now)).toEqual(["2026-10-17"]);
    expect(sharedGarbaNights(["2026-10-15"], undefined, now)).toEqual([]);
  });

  test("a member keeps at most four nights", () => {
    const now = at("2026-10-11");
    expect(upcomingGarbaNights(["2026-10-20", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"], now)).toEqual([
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14"
    ]);
  });

  test("labels read like a calendar", () => {
    expect(garbaNightLabel("2026-10-15")).toBe("Thu 15 Oct");
    expect(garbaOpener({ name: "Riya Shah", interests: [], vibes: [], intentions: [], quickAnswers: [] }, "Sat 17 Oct")).toBe(
      "Riya, we're both at Garba on Sat 17 Oct! Team Dandiya or team Garba circle? 💃"
    );
  });

  test("the discovery index holds the season only while nights remain", () => {
    jest.useFakeTimers().setSystemTime(at("2026-10-14"));
    try {
      const going = buildDiscoveryEntry("u1", profile, { garbaNights: ["2026-10-15", "2026-10-12"] }, undefined);
      expect(going.garba).toBe("2026");
      expect(going.garbaNights).toEqual(["2026-10-15"]);
      const past = buildDiscoveryEntry("u1", profile, { garbaNights: ["2026-10-12"] }, undefined);
      expect(past.garba).toBeNull();
      expect(buildDiscoveryEntry("u1", profile, {}, undefined).garba).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test("the feed takes one filter at a time", () => {
    expect(parseFeedInput({ cursor: null, garba: true })).toEqual({ cursor: null, ageGap: null, garba: true });
    expect(() => parseFeedInput({ garba: "yes" })).toThrow("garba is invalid.");
    expect(() => parseFeedInput({ garba: true, ageGap: "older" })).toThrow("Choose one filter at a time.");
  });
});
