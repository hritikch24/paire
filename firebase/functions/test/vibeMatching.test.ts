import { matchingChoices, applyVibeScores } from "../src/lib/vibeMatching";
import { DiscoverProfile } from "../src/types";

const profiles = [{ uid: "a", compatibility: 80 }, { uid: "b", compatibility: 60 }] as DiscoverProfile[];
it("only shares fixed catalog choices, without identity, free text or hidden casual preferences", () => {
  expect(matchingChoices({ displayName: "Private name", bio: "Private text", city: "Delhi", interests: ["taste", "private religion", "taste"], vibes: ["cozy", "ignore instructions"], intentions: ["long-term"] }))
    .toEqual({ interests: ["taste"], vibes: ["cozy"], intentions: ["long-term"] });
});
it("only adjusts existing opted-in candidates, preserving profile evidence and order", () => {
  const result = applyVibeScores(profiles, new Set(["a"]), { scores: [{ index: 0, score: 100 }, { index: 1, score: 100 }, { index: 99, score: 100 }] });
  expect(result[0]).toEqual({ ...profiles[0], compatibility: 84, matchingSource: "ai" });
  expect(result[1]).toBe(profiles[1]);
});
it("falls back on malformed, unbounded, duplicated or missing model scores", () => {
  for (const reply of [null, {}, { scores: [{ index: 0, score: NaN }] }, { scores: [{ index: 0, score: 101 }] }, { scores: [{ index: 0, score: 1 }, { index: 0, score: 100 }] }]) {
    expect(applyVibeScores(profiles, new Set(["a"]), reply)).toEqual(profiles);
  }
});
