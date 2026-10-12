import { compatibilityLabel, listOf, reasonLines, reasonText } from "../src/utils/insights";

describe("Paire AI reasons", () => {
  it("joins lists like a person would", () => {
    expect(listOf(["a"])).toBe("a");
    expect(listOf(["a", "b"])).toBe("a and b");
    expect(listOf(["a", "b", "c"])).toBe("a, b and c");
  });

  it("describes each kind of reason", () => {
    expect(reasonText({ kind: "interests", ids: ["soundscape", "frame"] })).toBe("You both love 🎧 Soundscape and 🎞️ Frame");
    expect(reasonText({ kind: "intentions", ids: ["long-term"] })).toBe("You both want long-term");
    expect(reasonText({ kind: "vibes", ids: ["cozy", "night-owl"] })).toBe("Same vibe: cozy and night owl");
    expect(reasonText({ kind: "answer", questionId: "first-date", answer: "Live music" })).toBe(
      'Same answer to “Ideal first date?”: Live music'
    );
    expect(reasonText({ kind: "casual" })).toBe("You're both open to a one-night stand");
    expect(reasonText({ kind: "nearby", km: 3 })).toBe("Just 3 km away");
    expect(reasonText({ kind: "active" })).toBe("Active today");
  });

  it("skips reasons it can't describe (e.g. from a newer server)", () => {
    expect(reasonText({ kind: "interests", ids: ["unknown"] })).toBeNull();
    expect(reasonLines([{ kind: "active" }, { kind: "interests", ids: ["nope"] }, { kind: "mystery" } as never])).toEqual([
      "Active today"
    ]);
    expect(reasonLines(undefined)).toEqual([]);
  });

  it("labels compatibility", () => {
    expect(compatibilityLabel(91.6)).toBe("92/100 vibe");
    expect(compatibilityLabel(undefined)).toBeNull();
    expect(compatibilityLabel(NaN)).toBeNull();
    expect(compatibilityLabel(Infinity)).toBeNull();
    expect(compatibilityLabel(200)).toBe("100/100 vibe");
  });
});
