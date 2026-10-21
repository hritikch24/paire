import { buildDiscoveryEntry, toDiscoverProfile, viewerTraits } from "../src/lib/discovery";
import { coarsen, displayDistanceKm, distanceKm, isValidLatLng } from "../src/lib/geo";
import { dayKey, pairId } from "../src/lib/ids";
import { matchInsight, rankCandidate, Traits } from "../src/lib/insights";
import { isCandidateForViewer, normalizeAgeRange, normalizeShowMe } from "../src/lib/prefs";
import { overlapScore } from "../src/lib/scoring";
import { templateBios, templateOpeners } from "../src/lib/suggestions";
import { parseFeedInput, parseSwipeInput } from "../src/lib/validate";
import { DiscoveryEntry, PublicProfile } from "../src/types";

const MUMBAI = { lat: 19.076, lng: 72.8777 };
const PUNE = { lat: 18.5204, lng: 73.8567 };
const noTraits: Traits = { interests: [], vibes: [], intentions: [], quickAnswers: [], casual: false };

function entry(overrides: Partial<DiscoveryEntry>): DiscoveryEntry {
  return {
    uid: "candidate",
    visible: true,
    cohort: "public",
    gender: "woman",
    age: 27,
    showMe: ["man"],
    ageMin: 18,
    ageMax: 100,
    maxDistanceKm: null,
    lat: null,
    lng: null,
    interests: [],
    vibes: [],
    lastActiveAt: 0,
    ...overrides
  };
}

const viewer = entry({ uid: "viewer", gender: "man", age: 29, showMe: ["woman"], ageMin: 24, ageMax: 32 });
const noLocation = { viewerLocation: null, sharedVibesOnly: false };

function profile(overrides: Partial<PublicProfile> = {}): Partial<PublicProfile> {
  return {
    uid: "candidate",
    displayName: "Anya",
    age: 27,
    gender: "woman",
    photoUrls: ["https://example.com/a.jpg"],
    interests: ["canvas"],
    isDiscoverable: true,
    onboardingComplete: true,
    lastActiveAt: Date.UTC(2026, 8, 26, 10, 42),
    ...overrides
  };
}

describe("ids", () => {
  it("builds the same match id regardless of order", () => {
    expect(pairId("b", "a")).toBe("a_b");
    expect(pairId("a", "b")).toBe("a_b");
  });

  it("formats UTC day keys", () => {
    expect(dayKey(new Date(Date.UTC(2026, 8, 6, 23, 0)))).toBe("20260906");
  });
});

describe("geo", () => {
  it("measures real distances", () => {
    expect(distanceKm(MUMBAI, PUNE)).toBeGreaterThan(115);
    expect(distanceKm(MUMBAI, PUNE)).toBeLessThan(125);
  });

  it("coarsens to a ~1 km grid and never shows under 1 km", () => {
    expect(coarsen({ lat: 19.07612, lng: 72.87774 })).toEqual({ lat: 19.08, lng: 72.88 });
    expect(displayDistanceKm(0.2)).toBe(1);
    expect(displayDistanceKm(12.6)).toBe(13);
  });

  it("validates coordinates", () => {
    expect(isValidLatLng(MUMBAI)).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: "19", lng: 72 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });
});

describe("preferences", () => {
  it("defaults an empty or invalid Show me to everyone", () => {
    expect(normalizeShowMe(undefined)).toEqual(["woman", "man"]);
    expect(normalizeShowMe(["alien"])).toEqual(["woman", "man"]);
    expect(normalizeShowMe(["woman", "woman"])).toEqual(["woman"]);
  });

  it("clamps and orders age ranges to adults", () => {
    expect(normalizeAgeRange(12, 200)).toEqual({ ageMin: 18, ageMax: 100 });
    expect(normalizeAgeRange(40, 30)).toEqual({ ageMin: 30, ageMax: 40 });
  });

  it("uses only the viewer's gender preferences", () => {
    expect(isCandidateForViewer(viewer, entry({}), noLocation)).toBe(true);
    expect(isCandidateForViewer(viewer, entry({ gender: "man" }), noLocation)).toBe(false);
    expect(isCandidateForViewer(viewer, entry({ showMe: ["woman"] }), noLocation)).toBe(true);
  });

  it("uses only the viewer's age range", () => {
    expect(isCandidateForViewer(viewer, entry({ age: 35 }), noLocation)).toBe(false);
    expect(isCandidateForViewer(viewer, entry({ ageMax: 28 }), noLocation)).toBe(true);
  });

  it("uses only the viewer's distance limit when both locations are known", () => {
    const withLocation = { viewerLocation: MUMBAI, sharedVibesOnly: false };
    const inPune = entry({ lat: PUNE.lat, lng: PUNE.lng });
    expect(isCandidateForViewer({ ...viewer, maxDistanceKm: 50 }, inPune, withLocation)).toBe(false);
    expect(isCandidateForViewer({ ...viewer, maxDistanceKm: 200 }, inPune, withLocation)).toBe(true);
    expect(
      isCandidateForViewer({ ...viewer, maxDistanceKm: 200 }, { ...inPune, maxDistanceKm: 10 }, withLocation)
    ).toBe(true);
    // Unknown distance is not a reason to hide someone.
    expect(isCandidateForViewer({ ...viewer, maxDistanceKm: 5 }, entry({}), withLocation)).toBe(true);
  });

  it("honours the shared-vibes filter", () => {
    const vibes = { viewerLocation: null, sharedVibesOnly: true };
    const cozyViewer = { ...viewer, vibes: ["cozy"] };
    expect(isCandidateForViewer(cozyViewer, entry({ vibes: ["artsy"] }), vibes)).toBe(false);
    expect(isCandidateForViewer(cozyViewer, entry({ vibes: ["cozy", "artsy"] }), vibes)).toBe(true);
  });

  it("keeps test accounts and real members apart", () => {
    expect(isCandidateForViewer(viewer, entry({ cohort: "test" }), noLocation)).toBe(false);
    expect(isCandidateForViewer({ ...viewer, cohort: "test" }, entry({ cohort: "test" }), noLocation)).toBe(true);
    expect(buildDiscoveryEntry("u", profile(), undefined, { status: "ok", cohort: "test" }).cohort).toBe("test");
    expect(buildDiscoveryEntry("u", profile(), undefined, undefined).cohort).toBe("public");
  });

  it("never returns the viewer or hidden profiles", () => {
    expect(isCandidateForViewer(viewer, entry({ uid: "viewer" }), noLocation)).toBe(false);
    expect(isCandidateForViewer(viewer, entry({ visible: false }), noLocation)).toBe(false);
  });
});

describe("discovery index", () => {
  it("is visible only for complete, discoverable, adult profiles (photos optional)", () => {
    expect(buildDiscoveryEntry("u", profile(), undefined, undefined).visible).toBe(true);
    const noPhoto = buildDiscoveryEntry("u", profile({ photoUrls: [] }), undefined, undefined);
    expect(noPhoto.visible).toBe(true);
    expect(noPhoto.hasPhoto).toBe(false);
    expect(buildDiscoveryEntry("u", profile({ age: 17 }), undefined, undefined).visible).toBe(false);
    expect(buildDiscoveryEntry("u", profile({ onboardingComplete: false }), undefined, undefined).visible).toBe(
      false
    );
    expect(buildDiscoveryEntry("u", profile({ isDiscoverable: false }), undefined, undefined).visible).toBe(false);
    expect(buildDiscoveryEntry("u", profile(), undefined, { status: "hidden" }).visible).toBe(false);
    expect(buildDiscoveryEntry("u", profile(), undefined, { status: "ok" }).visible).toBe(true);
  });

  it("records the one-night-stand opt-in from private settings", () => {
    expect(buildDiscoveryEntry("u", profile(), { openToCasual: true }, undefined).casual).toBe(true);
    expect(buildDiscoveryEntry("u", profile(), { openToCasual: false }, undefined).casual).toBe(false);
    expect(buildDiscoveryEntry("u", profile(), undefined, undefined).casual).toBe(false);
  });

  it("stores only a coarse location, and only when sharing is on", () => {
    const precise = { lat: 19.07612, lng: 72.87774 };
    const on = buildDiscoveryEntry("u", profile(), { locationEnabled: true, location: precise }, undefined);
    expect({ lat: on.lat, lng: on.lng }).toEqual({ lat: 19.08, lng: 72.88 });
    const off = buildDiscoveryEntry("u", profile(), { locationEnabled: false, location: precise }, undefined);
    expect({ lat: off.lat, lng: off.lng }).toEqual({ lat: null, lng: null });
  });

  it("returns only public fields with rounded distance and activity", () => {
    const indexEntry = entry({ uid: "u", lat: 19.08, lng: 72.88 });
    const result = toDiscoverProfile(
      { ...profile(), ...({ email: "leak@example.com" } as object) },
      indexEntry,
      { lat: 19.0761, lng: 72.8778 },
      true,
      noTraits
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("email");
    expect(result!.distanceKm).toBe(1);
    expect(result!.lastActiveAt).toBe(Date.UTC(2026, 8, 26, 10, 0));
    expect(result!.superLikedYou).toBe(true);
  });

  it("drops profiles missing required public fields", () => {
    expect(toDiscoverProfile(profile({ displayName: "" }), entry({}), null, false, noTraits)).toBeNull();
  });
});

describe("ranking", () => {
  it("scores overlap between tag lists", () => {
    expect(overlapScore(["a", "b"], ["b", "c"])).toBeCloseTo(0.5);
    expect(overlapScore([], ["a"])).toBe(0);
  });

  const now = Date.UTC(2026, 8, 26, 12, 0);
  const candidate = (overrides: Partial<Traits & { distanceKm: number | null; lastActiveAt: number }> = {}) => ({
    interests: ["canvas", "soundscape"],
    vibes: ["cozy"],
    intentions: ["long-term"],
    quickAnswers: [{ questionId: "first-date", answer: "Coffee + walk" }],
    casual: false,
    distanceKm: 3,
    lastActiveAt: now - 60 * 60 * 1000,
    ...overrides
  });
  const me: Traits = {
    interests: ["canvas", "soundscape", "taste"],
    vibes: ["cozy"],
    intentions: ["long-term"],
    quickAnswers: [{ questionId: "first-date", answer: "Coffee + walk" }],
    casual: false
  };

  it("explains a strong match with shared interests and gives it a high score", () => {
    const insight = matchInsight(me, candidate(), now);
    expect(insight.compatibility).toBeGreaterThanOrEqual(85);
    expect(insight.compatibility).toBeLessThanOrEqual(98);
    expect(insight.reasons[0]).toEqual({ kind: "interests", ids: ["canvas", "soundscape"] });
    expect(insight.reasons).toHaveLength(3);
  });

  it("keeps every match encouraging, but a better fit scores higher", () => {
    const weak = matchInsight(me, candidate({ interests: ["nature"], vibes: [], intentions: [], quickAnswers: [], distanceKm: null }), now);
    expect(weak.compatibility).toBeGreaterThanOrEqual(62);
    expect(weak.compatibility).toBeLessThan(matchInsight(me, candidate(), now).compatibility);
  });

  it("reveals the one-night-stand match only when both people opted in", () => {
    expect(matchInsight({ ...me, casual: true }, candidate({ casual: true }), now)).toMatchObject({ casualMatch: true });
    expect(matchInsight({ ...me, casual: true }, candidate({ casual: true }), now).reasons[0]).toEqual({ kind: "casual" });
    for (const [mine, theirs] of [[true, false], [false, true], [false, false]]) {
      const insight = matchInsight({ ...me, casual: mine }, candidate({ casual: theirs }), now);
      expect(insight.casualMatch).toBe(false);
      expect(insight.reasons.some((reason) => reason.kind === "casual")).toBe(false);
    }
  });

  it("puts people who super-liked you first and profiles without photos last", () => {
    const insight = matchInsight(me, candidate(), now);
    const weaker = matchInsight(me, candidate({ interests: [] }), now);
    expect(rankCandidate(weaker, true, true)).toBeGreaterThan(rankCandidate(insight, false, true));
    expect(rankCandidate(insight, false, false)).toBeLessThan(rankCandidate(insight, false, true));
  });

  it("reads the viewer's own traits from the index and profile", () => {
    const traits = viewerTraits(entry({ interests: ["canvas"], casual: true }), profile());
    expect(traits.casual).toBe(true);
    expect(traits.interests).toEqual(["canvas"]);
  });
});

describe("writing suggestions", () => {
  const person = (overrides = {}) => ({
    name: "Casey Rao",
    interests: ["lens", "frame"],
    vibes: ["curious"],
    intentions: ["long-term"],
    quickAnswers: [{ questionId: "first-date", answer: "Live music" }],
    city: "Powai, Mumbai",
    ...overrides
  });

  it("writes three different openers, starting from what you share", () => {
    const openers = templateOpeners(person({ name: "Dev", interests: ["frame"] }), person());
    expect(openers).toHaveLength(3);
    expect(new Set(openers).size).toBe(3);
    expect(openers[0]).toContain("We both love films");
    expect(openers.some((line) => line.includes("Live music"))).toBe(true);
  });

  it("still writes openers for a nearly empty profile", () => {
    const openers = templateOpeners(person({ interests: [] }), person({ interests: [], vibes: [], quickAnswers: [] }));
    expect(openers).toHaveLength(3);
    expect(openers[0]).toContain("Casey");
  });

  it("drafts three bios from the member's choices", () => {
    const bios = templateBios(person());
    expect(bios).toHaveLength(3);
    expect(bios[0]).toContain("a camera in hand");
    expect(bios[1]).toContain("in Powai");
    expect(bios.every((bio) => bio.length <= 220)).toBe(true);
    expect(templateBios(person({ interests: [], vibes: [], intentions: [] }))).toHaveLength(3);
  });
});

describe("input validation", () => {
  it("accepts well-formed swipes and rejects the rest", () => {
    expect(parseSwipeInput({ targetUid: "abc_123", type: "like" })).toEqual({
      targetUid: "abc_123",
      type: "like",
      note: null
    });
    expect(() => parseSwipeInput({ targetUid: "../users", type: "like" })).toThrow();
    expect(() => parseSwipeInput({ targetUid: "abc", type: "love" })).toThrow();
    expect(() => parseSwipeInput(null)).toThrow();
  });

  it("parses optional feed cursors", () => {
    expect(parseFeedInput(undefined)).toEqual({ cursor: null, ageGap: null, garba: false, revisit: false });
    expect(parseFeedInput({ cursor: { lastActiveAt: 5, uid: "abc" } })).toEqual({
      cursor: { lastActiveAt: 5, uid: "abc" },
      ageGap: null,
      garba: false,
      revisit: false
    });
    expect(() => parseFeedInput({ cursor: { lastActiveAt: "5", uid: "abc" } })).toThrow();
    expect(parseFeedInput({ cursor: null, revisit: true })).toMatchObject({ revisit: true });
    expect(() => parseFeedInput({ revisit: "yes" })).toThrow("revisit is invalid.");
  });
});
