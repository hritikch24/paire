import { MatchReason, QuickAnswer } from "../types";
import { proximityScore, recencyScore } from "./scoring";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REASONS = 3;

export type Traits = {
  interests: string[];
  vibes: string[];
  intentions: string[];
  quickAnswers: QuickAnswer[];
  /** Open to a one-night stand. */
  casual: boolean;
};

export type CandidateTraits = Traits & {
  distanceKm: number | null;
  lastActiveAt: number;
};

export type MatchInsight = {
  /** 0–100. Everyone in a feed already fits the viewer's preferences, so it starts at 62. */
  compatibility: number;
  reasons: MatchReason[];
  /** Both opted in to one-night stands. Never set when only one did. */
  casualMatch: boolean;
};

const shared = (a: string[], b: string[]) => {
  const set = new Set(a);
  return Array.from(new Set(b.filter((item) => set.has(item))));
};

/** Share of the smaller list that overlaps, so a focused profile isn't penalised. */
const shareOf = (a: string[], b: string[], overlap: number) =>
  a.length && b.length ? overlap / Math.min(a.length, b.length) : 0;

/**
 * The matchmaker: how well two people fit, and why, from what they chose to
 * share. Deterministic and cheap enough to run for every card in a feed.
 */
export function matchInsight(viewer: Traits, candidate: CandidateTraits, now = Date.now()): MatchInsight {
  const interests = shared(viewer.interests, candidate.interests);
  const vibes = shared(viewer.vibes, candidate.vibes);
  const intentions = shared(viewer.intentions, candidate.intentions);
  const theirAnswers = new Map(candidate.quickAnswers.map((item) => [item.questionId, item.answer]));
  const answers = viewer.quickAnswers.filter((item) => theirAnswers.get(item.questionId) === item.answer);
  const casualMatch = viewer.casual && candidate.casual;

  // Unknown intentions count as half a match: not a conflict, just unsaid.
  const intentScore =
    !viewer.intentions.length || !candidate.intentions.length ? 0.5 : intentions.length ? 1 : 0;
  const raw =
    shareOf(viewer.interests, candidate.interests, interests.length) * 0.35 +
    shareOf(viewer.vibes, candidate.vibes, vibes.length) * 0.15 +
    intentScore * 0.15 +
    (viewer.quickAnswers.length ? answers.length / viewer.quickAnswers.length : 0) * 0.1 +
    proximityScore(candidate.distanceKm) * 0.1 +
    recencyScore(candidate.lastActiveAt, now) * 0.1 +
    (casualMatch ? 0.05 : 0);

  const reasons: MatchReason[] = [];
  if (casualMatch) reasons.push({ kind: "casual" });
  if (interests.length) reasons.push({ kind: "interests", ids: interests.slice(0, 3) });
  if (intentions.length) reasons.push({ kind: "intentions", ids: intentions.slice(0, 2) });
  if (vibes.length) reasons.push({ kind: "vibes", ids: vibes.slice(0, 2) });
  if (answers.length) reasons.push({ kind: "answer", questionId: answers[0].questionId, answer: answers[0].answer });
  if (candidate.distanceKm !== null && candidate.distanceKm <= 10) {
    reasons.push({ kind: "nearby", km: Math.max(1, Math.round(candidate.distanceKm)) });
  }
  if (candidate.lastActiveAt && now - candidate.lastActiveAt < DAY_MS) reasons.push({ kind: "active" });

  return {
    compatibility: Math.round(62 + 36 * Math.min(1, raw)),
    reasons: reasons.slice(0, MAX_REASONS),
    casualMatch
  };
}

/**
 * Feed order: best fit first, people who super-liked you on top, a gentle lift
 * for new members (so nobody starts invisible), and profiles without a photo
 * after those with one. Attractiveness is never scored.
 */
export function rankCandidate(insight: MatchInsight, superLikedYou: boolean, hasPhoto: boolean, isNew = false): number {
  return insight.compatibility / 100 + (superLikedYou ? 1 : 0) + (isNew ? 0.08 : 0) - (hasPhoto ? 0 : 0.25);
}
