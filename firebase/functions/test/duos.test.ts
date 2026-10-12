import { duoInsight, duoMatchIdOf, duosFit, newInviteCode, normaliseInviteCode } from "../src/lib/duos";
import { templateGroupOpeners } from "../src/lib/suggestions";
import { DiscoveryEntry } from "../src/types";

function person(uid: string, overrides: Partial<DiscoveryEntry> = {}): DiscoveryEntry {
  return {
    uid,
    visible: true,
    cohort: "public",
    gender: "woman",
    age: 26,
    showMe: ["man"],
    ageMin: 21,
    ageMax: 35,
    maxDistanceKm: null,
    lat: null,
    lng: null,
    interests: [],
    vibes: [],
    lastActiveAt: 0,
    ...overrides
  };
}

const riya = person("riya");
const neha = person("neha", { age: 27 });
const arjun = person("arjun", { gender: "man", age: 28, showMe: ["woman"] });
const kabir = person("kabir", { gender: "man", age: 29, showMe: ["woman"] });

describe("duos", () => {
  test("invite codes are 6 unambiguous characters, typed forgivingly", () => {
    const code = newInviteCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(new Set(Array.from({ length: 50 }, newInviteCode)).size).toBe(50);
    expect(normaliseInviteCode(` ${code.toLowerCase().slice(0, 3)}-${code.slice(3)} `)).toBe(code);
    expect(normaliseInviteCode("ABC12")).toBeNull();
    expect(normaliseInviteCode("ABCDE0")).toBeNull(); // 0 is never used
    expect(normaliseInviteCode(42)).toBeNull();
  });

  test("a Duo chat's id is the same whichever pair asks", () => {
    expect(duoMatchIdOf("y_z", "a_b")).toBe(duoMatchIdOf("a_b", "y_z"));
    expect(duoMatchIdOf("a_b", "y_z")).toBe("duo_a_b__y_z");
  });

  test("two pairs fit when everyone has someone they'd want to see on the other side", () => {
    expect(duosFit([riya, neha], [arjun, kabir])).toBe(true);
    // Mixed pairs work too, checked person by person.
    const sam = person("sam", { gender: "man", age: 27, showMe: ["man"] });
    const dev = person("dev", { gender: "man", age: 28, showMe: ["man"] });
    expect(duosFit([riya, sam], [arjun, dev])).toBe(true);
  });

  test("a pair doesn't fit when someone would see nobody they want", () => {
    // Neha only wants women; nobody in the other pair fits her.
    expect(duosFit([riya, { ...neha, showMe: ["woman"] }], [arjun, kabir])).toBe(false);
    // Kabir is outside both women's age ranges.
    expect(duosFit([riya, neha], [arjun, { ...kabir, age: 45 }])).toBe(false);
  });

  test("hidden people, other cohorts, and overlapping members never fit", () => {
    expect(duosFit([riya, neha], [arjun, { ...kabir, visible: false }])).toBe(false);
    expect(duosFit([riya, neha], [arjun, { ...kabir, cohort: "test" }])).toBe(false);
    expect(duosFit([riya, neha], [riya, kabir])).toBe(false);
    expect(duosFit([riya], [arjun, kabir])).toBe(false);
  });

  test("the pair insight uses shared interests and never the casual flag", () => {
    const traits = (interests: string[], casual = true) => ({ interests, vibes: [], intentions: [], quickAnswers: [], casual });
    const insight = duoInsight([traits(["soundscape"]), traits(["taste"])], [traits(["soundscape"]), traits(["frame"])], Date.now());
    expect(insight.casualMatch).toBe(false);
    expect(insight.reasons).toContainEqual({ kind: "interests", ids: ["soundscape"] });
    expect(insight.reasons.some((reason) => reason.kind === "casual")).toBe(false);
    expect(insight.compatibility).toBeGreaterThanOrEqual(62);
  });

  test("group icebreakers talk to the whole other pair", () => {
    const me = { name: "Riya", interests: ["soundscape"], vibes: [], intentions: [], quickAnswers: [] };
    const them = [
      { name: "Arjun Mehta", interests: ["soundscape"], vibes: ["foodie"], intentions: [], quickAnswers: [] },
      { name: "Kabir", interests: ["soundscape", "lens"], vibes: [], intentions: [], quickAnswers: [] }
    ];
    const lines = templateGroupOpeners(me, them);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/we all love music/i);
    expect(lines.join(" ")).toContain("Arjun and Kabir");
  });
});
