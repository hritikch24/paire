import { buildDiscoveryEntry, isNewMember, sanitizeBasics, toDiscoverProfile } from "../src/lib/discovery";
import { rankCandidate, Traits } from "../src/lib/insights";
import { isMutualCandidate } from "../src/lib/prefs";
import { compareLikes, firstMoveOf, sparksOf } from "../src/lib/sparks";
import { parseNote, parseSwipeInput } from "../src/lib/validate";
import { DiscoveryEntry, PublicProfile } from "../src/types";

const HOUR = 60 * 60 * 1000;
const noTraits: Traits = { interests: [], vibes: [], intentions: [], quickAnswers: [], casual: false };
const noLocation = { viewerLocation: null, sharedVibesOnly: false };

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

const viewer = entry({ uid: "viewer", gender: "man", showMe: ["woman"], intentions: ["long-term"], languages: ["hindi"] });

const profile: Partial<PublicProfile> = {
  uid: "candidate",
  displayName: "Riya",
  age: 27,
  gender: "woman",
  photoUrls: ["https://example.com/a.jpg"],
  interests: [],
  isDiscoverable: true,
  onboardingComplete: true
};

describe("notes on likes", () => {
  test("are trimmed, collapsed and optional", () => {
    expect(parseNote(undefined)).toBeNull();
    expect(parseNote("   ")).toBeNull();
    expect(parseNote("  Your  sunset\nphoto is lovely ")).toBe("Your sunset photo is lovely");
  });

  test("refuse long notes, money talk, numbers and links", () => {
    expect(() => parseNote("x".repeat(141))).toThrow(/140/);
    expect(() => parseNote("send me 5000 rs on paytm")).toThrow(/can't be sent/);
    expect(() => parseNote("call me 9876543210")).toThrow(/can't be sent/);
    expect(() => parseNote("see bit.ly/abc")).toThrow(/can't be sent/);
    expect(() => parseNote(42)).toThrow(/text/);
  });

  test("only go with likes", () => {
    expect(parseSwipeInput({ targetUid: "abc", type: "like", note: "Hi there" })).toEqual({ targetUid: "abc", type: "like", note: "Hi there" });
    expect(() => parseSwipeInput({ targetUid: "abc", type: "nope", note: "Hi" })).toThrow(/likes/);
  });
});

describe("same intentions and shared languages", () => {
  test("apply both ways when either person turns them on", () => {
    const longTerm = entry({ intentions: ["long-term"], languages: ["tamil"] });
    const casual = entry({ intentions: ["casual"], languages: ["hindi"] });
    expect(isMutualCandidate(viewer, longTerm, noLocation)).toBe(true);
    expect(isMutualCandidate({ ...viewer, sameIntentOnly: true }, casual, noLocation)).toBe(false);
    expect(isMutualCandidate(viewer, { ...casual, sameIntentOnly: true }, noLocation)).toBe(false);
    expect(isMutualCandidate({ ...viewer, sameIntentOnly: true }, longTerm, noLocation)).toBe(true);
    expect(isMutualCandidate({ ...viewer, sharedLanguageOnly: true }, longTerm, noLocation)).toBe(false);
    expect(isMutualCandidate(viewer, { ...casual, sharedLanguageOnly: true }, noLocation)).toBe(true);
  });

  test("never treat unknown as shared", () => {
    expect(isMutualCandidate({ ...viewer, sameIntentOnly: true }, entry({}), noLocation)).toBe(false);
    expect(isMutualCandidate({ ...viewer, sharedLanguageOnly: true }, entry({}), noLocation)).toBe(false);
  });
});

describe("privacy controls in the index and the feed", () => {
  test("settings are mirrored on the discovery entry", () => {
    const built = buildDiscoveryEntry(
      "candidate",
      { ...profile, languages: ["hindi", "english"], createdAt: 5 },
      { incognito: true, privatePhotos: true, requireNote: true, sameIntentOnly: true, sharedLanguageOnly: true },
      undefined
    );
    expect(built).toMatchObject({
      languages: ["hindi", "english"],
      incognito: true,
      privatePhotos: true,
      requireNote: true,
      sameIntentOnly: true,
      sharedLanguageOnly: true,
      createdAt: 5
    });
  });

  test("private photos are left out until a match", () => {
    const hidden = toDiscoverProfile(profile, entry({ privatePhotos: true }), null, false, noTraits)!;
    expect(hidden.photoUrls).toEqual([]);
    expect(hidden.photosPrivate).toBe(true);
    const revealed = toDiscoverProfile(profile, entry({ privatePhotos: true }), null, false, noTraits, Date.now(), true)!;
    expect(revealed.photoUrls).toHaveLength(1);
    expect(revealed.photosPrivate).toBe(false);
  });

  test("cards say when a note is required, and carry languages and basics", () => {
    const card = toDiscoverProfile(
      { ...profile, languages: ["hindi"], basics: { heightCm: 165, diet: "veg", work: "  Architect " } },
      entry({ requireNote: true }),
      null,
      false,
      noTraits
    )!;
    expect(card.requiresNote).toBe(true);
    expect(card.languages).toEqual(["hindi"]);
    expect(card.basics).toEqual({ heightCm: 165, diet: "veg", work: "Architect" });
  });
});

describe("basics", () => {
  test("keep only well-formed values", () => {
    expect(sanitizeBasics(null)).toEqual({});
    expect(sanitizeBasics({ heightCm: 90, religion: "", diet: "x".repeat(61), caste: "anything", smoking: "never" })).toEqual({
      smoking: "never"
    });
    expect(sanitizeBasics({ heightCm: 172.4 })).toEqual({ heightCm: 172 });
  });
});

describe("new members", () => {
  test("get a short boost, never from a future or missing date", () => {
    const now = 1_000 * HOUR;
    expect(isNewMember(now - 10 * HOUR, now)).toBe(true);
    expect(isNewMember(now - 80 * HOUR, now)).toBe(false);
    expect(isNewMember(now + HOUR, now)).toBe(false);
    expect(isNewMember(undefined, now)).toBe(false);
    const insight = { compatibility: 70, reasons: [], casualMatch: false };
    expect(rankCandidate(insight, false, true, true)).toBeGreaterThan(rankCandidate(insight, false, true, false));
  });
});

describe("sparks", () => {
  test("keep only real notes", () => {
    expect(sparksOf({ a: "Hello", b: null, c: "" })).toEqual({ a: "Hello" });
  });

  test("first move goes to the one person who asked for it", () => {
    expect(firstMoveOf({ a: true, b: false })).toBe("a");
    expect(firstMoveOf({ a: true, b: true })).toBeNull();
    expect(firstMoveOf({ a: false, b: false })).toBeNull();
  });

  test("likes you lists effort first, then Plus priority, then the newest", () => {
    const likes = [
      { fromUid: "plain-old", type: "like", createdAt: 1 },
      { fromUid: "plain-new", type: "like", createdAt: 5 },
      { fromUid: "plus", type: "like", priority: true, createdAt: 2 },
      { fromUid: "note", type: "like", note: "Hi", createdAt: 3 },
      { fromUid: "super", type: "super", createdAt: 4 }
    ];
    expect([...likes].sort(compareLikes).map((like) => like.fromUid)).toEqual(["super", "note", "plus", "plain-new", "plain-old"]);
  });
});
