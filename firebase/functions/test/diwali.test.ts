import { DIWALI_SEASON, diwaliCityKey, diwaliDates, diwaliOpen, diwaliOverlap, normalizeDiwaliPlan, sameDiwaliArea, sharedDiwaliPlans } from "../src/lib/diwali";
import { buildDiscoveryEntry } from "../src/lib/discovery";
import { chooseReminder, DAY_MS } from "../src/lib/reminders";
import { diwaliOpener } from "../src/lib/suggestions";
import { parseFeedInput } from "../src/lib/validate";
import { notificationCopy, preferenceFor } from "../src/lib/notificationPrivacy";
import { UserSettings } from "../src/types";

// Noon IST on a given day.
const at = (date: string) => Date.parse(`${date}T06:30:00Z`);
const now = at("2026-11-04");
const pune = { lat: 18.52, lng: 73.86 };
const plan = (dates: string[], vibes: string[]) => ({ dates, vibes });

describe("Diwali Together season", () => {
  test("opens on 24 October IST and closes after 10 November IST", () => {
    expect(diwaliOpen(Date.parse("2026-10-23T18:29:00Z"))).toBe(false); // 23 Oct 23:59 IST
    expect(diwaliOpen(Date.parse("2026-10-23T18:30:00Z"))).toBe(true); // 24 Oct 00:00 IST
    expect(diwaliOpen(at("2026-11-10"))).toBe(true);
    expect(diwaliOpen(Date.parse("2026-11-10T18:29:00Z"))).toBe(true); // 10 Nov 23:59 IST
    expect(diwaliOpen(Date.parse("2026-11-10T18:30:00Z"))).toBe(false); // 11 Nov 00:00 IST
  });
  test("offers only the planning window, and never dates already past", () => {
    expect(diwaliDates(at("2026-10-25"))).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
    expect(diwaliDates(at("2026-11-08"))).toEqual(["2026-11-08", "2026-11-09", "2026-11-10"]);
    expect(diwaliDates(at("2026-11-11"))).toEqual([]);
    expect(diwaliDates(at("2026-10-23"))).toEqual([]);
  });
});

describe("Diwali plans", () => {
  test("keeps up to three valid dates and activities, dropping everything else", () => {
    expect(normalizeDiwaliPlan(plan(["2026-11-09", "2026-11-05", "2026-11-05", "2026-11-08", "2026-11-10", "2026-12-01", "x"], ["bash", "chai", "chai", "nope", "meal", "mela"]), now))
      .toEqual({ dates: ["2026-11-05", "2026-11-08", "2026-11-09"], vibes: ["bash", "chai", "meal"] });
  });
  test("needs both a date and an activity, and an open season", () => {
    expect(normalizeDiwaliPlan(plan([], ["chai"]), now)).toBeNull();
    expect(normalizeDiwaliPlan(plan(["2026-11-08"], []), now)).toBeNull();
    expect(normalizeDiwaliPlan(plan(["2026-11-08"], ["chai"]), at("2026-11-11"))).toBeNull();
    expect(normalizeDiwaliPlan(plan(["2026-11-04"], ["chai"]), now)).toBeNull();
    for (const bad of [null, undefined, 5, "x", [], { dates: "2026-11-08", vibes: "chai" }]) expect(normalizeDiwaliPlan(bad, now)).toBeNull();
  });
  test("expires dates as the days pass", () => {
    const p = plan(["2026-11-05", "2026-11-09"], ["chai"]);
    expect(normalizeDiwaliPlan(p, at("2026-11-06"))?.dates).toEqual(["2026-11-09"]);
    expect(normalizeDiwaliPlan(p, at("2026-11-10"))).toBeNull();
  });
  test("shares only a count and the overlapping activities", () => {
    const shared = sharedDiwaliPlans(plan(["2026-11-05", "2026-11-08"], ["chai", "bash"]), plan(["2026-11-08", "2026-11-09"], ["bash", "meal"]), now);
    expect(shared).toEqual({ days: 1, vibes: ["bash"] });
    expect(JSON.stringify(shared)).not.toContain("2026-11");
  });
  test("needs a shared date AND a shared activity", () => {
    expect(sharedDiwaliPlans(plan(["2026-11-05"], ["chai"]), plan(["2026-11-06"], ["chai"]), now)).toBeNull();
    expect(sharedDiwaliPlans(plan(["2026-11-05"], ["chai"]), plan(["2026-11-05"], ["mela"]), now)).toBeNull();
    expect(sharedDiwaliPlans(plan(["2026-11-05"], ["chai"]), null, now)).toBeNull();
    expect(sharedDiwaliPlans(null, plan(["2026-11-05"], ["chai"]), now)).toBeNull();
  });
});

describe("Diwali area", () => {
  test("city keys ignore case, spacing and the state after a comma", () => {
    expect(diwaliCityKey("  Pune, Maharashtra ")).toBe("pune");
    expect(diwaliCityKey("NAVI   MUMBAI")).toBe("navi mumbai");
    expect(diwaliCityKey(undefined)).toBe("");
    expect(diwaliCityKey("x".repeat(81))).toBe("");
  });
  test("uses distance when both share a location, otherwise the stated city", () => {
    expect(sameDiwaliArea(pune, { lat: 18.6, lng: 73.9 }, "Pune", "Delhi")).toBe(true); // GPS wins over city labels
    expect(sameDiwaliArea(pune, { lat: 28.6, lng: 77.2 }, "Pune", "Pune")).toBe(false); // too far apart, however labelled
    expect(sameDiwaliArea(null, null, "Pune", "pune, MH")).toBe(true);
    expect(sameDiwaliArea(pune, null, "Pune", "Pune")).toBe(true);
    expect(sameDiwaliArea(null, pune, "Pune", "Delhi")).toBe(false);
    expect(sameDiwaliArea(null, null, "", "")).toBe(false);
    expect(sameDiwaliArea(null, null, "Pune", undefined)).toBe(false);
  });
  test("overlap combines plans and area", () => {
    const viewer = { plan: normalizeDiwaliPlan(plan(["2026-11-08"], ["chai", "bash"]), now)!, location: null, city: "Pune" };
    expect(diwaliOverlap(viewer, plan(["2026-11-08"], ["bash"]), null, "pune", now)).toEqual({ days: 1, vibes: ["bash"] });
    expect(diwaliOverlap(viewer, plan(["2026-11-08"], ["bash"]), null, "delhi", now)).toBeNull();
    expect(diwaliOverlap(viewer, plan(["2026-11-09"], ["bash"]), null, "pune", now)).toBeNull();
  });
});

describe("Diwali discovery index and feed request", () => {
  const person = { displayName: "A", gender: "woman" as const, age: 26, isDiscoverable: true, onboardingComplete: true, city: "Pune, Maharashtra" };
  test("indexes only members who opted in during the open season", () => {
    const settings: UserSettings = { diwaliPlan: plan(["2026-11-08"], ["chai"]) };
    const entry = buildDiscoveryEntry("a", person, settings, undefined, now);
    expect(entry.city).toBe("pune");
    expect(entry.diwali).toBe(DIWALI_SEASON.id);
    expect(entry.diwaliPlan).toEqual({ dates: ["2026-11-08"], vibes: ["chai"] });
    expect(buildDiscoveryEntry("a", person, {}, undefined, now).diwali).toBeNull();
    expect(buildDiscoveryEntry("a", person, { diwaliPlan: null }, undefined, now).diwaliPlan).toBeNull();
    // Withdrawal after the window closes, or once every date has passed, leaves the index.
    expect(buildDiscoveryEntry("a", person, settings, undefined, at("2026-11-11")).diwali).toBeNull();
    expect(buildDiscoveryEntry("a", person, settings, undefined, at("2026-11-09")).diwali).toBeNull();
  });
  test("the Diwali filter is one filter at a time and must be a boolean", () => {
    expect(parseFeedInput({ diwali: true }).diwali).toBe(true);
    expect(parseFeedInput({ diwali: false }).diwali).toBeUndefined();
    expect(() => parseFeedInput({ diwali: "yes" })).toThrow(/diwali is invalid/);
    for (const other of [{ garba: true }, { ageGap: "older" }, { circle: "banking" }]) expect(() => parseFeedInput({ diwali: true, ...other })).toThrow(/one filter/);
  });
});

describe("Diwali reminders", () => {
  const settings: UserSettings = { notifications: { reminders: true }, showMe: ["woman"], ageMin: 23, ageMax: 35, diwaliPlan: plan(["2026-11-08"], ["chai"]) };
  const base = { gender: "woman" as const, age: 27, onboardingComplete: true, createdAt: 0, city: "Pune" };
  const mine = buildDiscoveryEntry("viewer", { gender: "man", age: 28, onboardingComplete: true, city: "Pune", lastActiveAt: now - 2 * DAY_MS }, settings, {});
  const theirs = (p: unknown, city = "Pune") => buildDiscoveryEntry("c", { ...base, city }, { showMe: ["man"], ageMin: 25, ageMax: 30, diwaliPlan: p as UserSettings["diwaliPlan"] }, {});
  const entryAt = (p: unknown, city = "Pune") => ({ ...theirs(p, city), diwaliPlan: normalizeDiwaliPlan(p, now) });
  test("is sent only for a real shared plan in the same city, once per season", () => {
    const shared = entryAt(plan(["2026-11-08"], ["chai"]));
    const plain = chooseReminder({ ...mine, city: "pune" }, settings, [shared], {}, now);
    expect(plain?.type).toBe("diwali");
    expect(plain?.body).not.toMatch(/match(ed)?\b|liked you|waiting/i);
    expect(chooseReminder({ ...mine, city: "pune" }, settings, [shared], { diwaliSeason: DIWALI_SEASON.id }, now)?.type).not.toBe("diwali");
    expect(chooseReminder({ ...mine, city: "pune" }, settings, [entryAt(plan(["2026-11-08"], ["mela"]))], {}, now)?.type).not.toBe("diwali");
    expect(chooseReminder({ ...mine, city: "pune" }, settings, [entryAt(plan(["2026-11-09"], ["chai"]))], {}, now)?.type).not.toBe("diwali");
    expect(chooseReminder({ ...mine, city: "pune" }, settings, [entryAt(plan(["2026-11-08"], ["chai"]), "Delhi")], {}, now)?.type).not.toBe("diwali");
    expect(chooseReminder({ ...mine, city: "pune" }, { ...settings, diwaliPlan: null }, [shared], {}, now)?.type).not.toBe("diwali");
    expect(chooseReminder({ ...mine, city: "pune" }, settings, [shared], {}, at("2026-11-11"))?.type).not.toBe("diwali");
  });
});

describe("Diwali openers and likes alerts", () => {
  test("suggests a public, dateless plan for a shared activity", () => {
    for (const vibe of ["chai", "mela", "lights", "meal", "bash"]) {
      const line = diwaliOpener({ name: "Aditi Rao" } as never, vibe);
      expect(line).toMatch(/^Aditi,/);
      expect(line).not.toMatch(/\d{4}|\bNov/);
    }
  });
  test("likes alerts hide content unless previews are on and follow the matches preference", () => {
    expect(notificationCopy("likes", "Someone likes you", "Open Paire", undefined)).toEqual({ title: "Paire", body: "You have a new like." });
    expect(notificationCopy("likes", "Someone likes you", "Open Paire", true)).toEqual({ title: "Someone likes you", body: "Open Paire" });
    expect(preferenceFor("likes")).toBe("matches");
    expect(preferenceFor("messages")).toBe("messages");
  });
});
