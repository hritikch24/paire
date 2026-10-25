import { FieldValue } from "firebase-admin/firestore";
import { assertLikeEligible, buildMatchDoc } from "../src/lib/matchDoc";
import { DiscoveryEntry, PublicProfile } from "../src/types";

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

const mine = entry({ uid: "viewer", gender: "man", age: 30, showMe: ["woman"] });
const theirs = entry({ uid: "candidate", gender: "woman", age: 27, showMe: ["man"] });

const meProfile: Partial<PublicProfile> = { uid: "zed", displayName: "Zed", photoUrls: ["https://example.com/z.jpg"] };
const targetProfile: Partial<PublicProfile> = { uid: "amy", displayName: "Amy", photoUrls: [] };

describe("buildMatchDoc", () => {
  it("builds the document swipe has always written", () => {
    const { id, data } = buildMatchDoc({
      uid: "zed",
      targetUid: "amy",
      me: meProfile,
      target: targetProfile,
      superLikedBy: [],
      notes: {},
      firstMove: { zed: false, amy: false }
    });
    expect(id).toBe("amy_zed");
    expect(data).toEqual({
      id: "amy_zed",
      participants: ["amy", "zed"],
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
      profiles: {
        zed: { displayName: "Zed", photoUrl: "https://example.com/z.jpg" },
        amy: { displayName: "Amy", photoUrl: null }
      },
      lastMessage: null,
      unread: { amy: 0, zed: 0 },
      lastReadAt: {},
      superLikedBy: [],
      sparks: {},
      firstMoveBy: null
    });
  });

  it("sorts participants whichever side is the caller", () => {
    const a = buildMatchDoc({ uid: "amy", targetUid: "zed", superLikedBy: [], notes: {}, firstMove: {} });
    const b = buildMatchDoc({ uid: "zed", targetUid: "amy", superLikedBy: [], notes: {}, firstMove: {} });
    expect(a.id).toBe(b.id);
    expect(a.data.participants).toEqual(["amy", "zed"]);
    expect(b.data.participants).toEqual(["amy", "zed"]);
  });

  it("keeps who super liked, the notes that became sparks, and who moves first", () => {
    const { data } = buildMatchDoc({
      uid: "zed",
      targetUid: "amy",
      superLikedBy: ["zed", "amy"],
      notes: { zed: "Loved your trek photo", amy: undefined },
      firstMove: { zed: true, amy: false }
    });
    expect(data.superLikedBy).toEqual(["zed", "amy"]);
    expect(data.sparks).toEqual({ zed: "Loved your trek photo" });
    expect(data.firstMoveBy).toBe("zed");
    expect(data.active).toBe(true);
    expect(data.unread).toEqual({ amy: 0, zed: 0 });
  });

  it("falls back to a generic name when a profile is missing", () => {
    const { data } = buildMatchDoc({ uid: "zed", targetUid: "amy", superLikedBy: [], notes: {}, firstMove: {} });
    expect(data.profiles).toEqual({
      zed: { displayName: "Paire member", photoUrl: null },
      amy: { displayName: "Paire member", photoUrl: null }
    });
  });
});

describe("assertLikeEligible", () => {
  const base = { mine, theirs, theyLikedMe: false, mySettings: undefined, note: null as string | null };

  it("passes for a normal like", () => {
    expect(() => assertLikeEligible(base)).not.toThrow();
  });

  it("rejects when the viewer is invisible", () => {
    expect(() => assertLikeEligible({ ...base, mine: { ...mine, visible: false } })).toThrow(
      expect.objectContaining({ code: "not-found", message: "That profile is no longer available for matching." })
    );
  });

  it("rejects an ineligible target", () => {
    expect(() => assertLikeEligible({ ...base, theirs: { ...theirs, gender: "man" } })).toThrow(
      expect.objectContaining({ code: "not-found", message: "That profile is no longer available for matching." })
    );
  });

  it("rejects an invisible target even when they liked first", () => {
    expect(() => assertLikeEligible({ ...base, theirs: { ...theirs, visible: false }, theyLikedMe: true })).toThrow(
      expect.objectContaining({ code: "not-found" })
    );
  });

  it("honours the viewer's shared-vibes setting for non-reciprocal likes only", () => {
    const settings = { sharedVibesOnly: true } as never;
    expect(() => assertLikeEligible({ ...base, mySettings: settings })).toThrow(expect.objectContaining({ code: "not-found" }));
    expect(() => assertLikeEligible({ ...base, mySettings: settings, theyLikedMe: true })).not.toThrow();
  });

  it("hides incognito members unless they liked first", () => {
    const incognito = { ...theirs, incognito: true };
    expect(() => assertLikeEligible({ ...base, theirs: incognito })).toThrow(
      expect.objectContaining({ code: "not-found", message: "That profile is no longer available for matching." })
    );
    expect(() => assertLikeEligible({ ...base, theirs: incognito, theyLikedMe: true })).not.toThrow();
  });

  it("needs a note for notes-only members unless it answers their like", () => {
    const notesOnly = { ...theirs, requireNote: true };
    expect(() => assertLikeEligible({ ...base, theirs: notesOnly })).toThrow(
      expect.objectContaining({
        code: "failed-precondition",
        message: "They only accept likes with a note. Add one to say why you'd click."
      })
    );
    expect(() => assertLikeEligible({ ...base, theirs: notesOnly, note: "Hi there" })).not.toThrow();
    expect(() => assertLikeEligible({ ...base, theirs: notesOnly, theyLikedMe: true })).not.toThrow();
  });
});
