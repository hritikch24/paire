import { DiscoverProfile, PublicProfile } from "../types";

// Only fixed catalog choices leave Paire. Never forward arbitrary profile strings.
const INTERESTS = new Set(["soundscape", "frame", "canvas", "movement", "words", "design", "lens", "craft", "taste", "nature"]);
const VIBES = new Set(["cozy", "adventurous", "artsy", "foodie", "outdoorsy", "night-owl", "wellness", "curious", "ambitious"]);
const INTENTIONS = new Set(["marriage", "long-term", "short-term", "new-friends", "still-figuring"]);

export function matchingChoices(profile: Partial<PublicProfile>) {
  const pick = (value: unknown, allowed: Set<string>) => Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))] : [];
  return { interests: pick(profile.interests, INTERESTS), vibes: pick(profile.vibes, VIBES), intentions: pick(profile.intentions, INTENTIONS) };
}

/** Model output can adjust a score, never add a person or write a claim about them. */
export function applyVibeScores(profiles: DiscoverProfile[], eligible: Set<string>, reply: unknown): DiscoverProfile[] {
  const rows = (reply as { scores?: unknown } | null)?.scores;
  if (!Array.isArray(rows)) return profiles;
  const scores = new Map<number, number>();
  const duplicates = new Set<number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { index, score } = row as { index?: unknown; score?: unknown };
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= profiles.length ||
      typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100 || !eligible.has(profiles[index].uid)) continue;
    if (scores.has(index)) duplicates.add(index);
    scores.set(index, score);
  }
  return profiles.map((profile, index) => {
    const score = scores.get(index);
    return score === undefined || duplicates.has(index) ? profile : {
      ...profile, compatibility: Math.round(profile.compatibility * 0.8 + score * 0.2), matchingSource: "ai" as const
    };
  });
}
