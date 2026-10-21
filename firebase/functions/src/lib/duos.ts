import { randomInt } from "crypto";
import { DiscoveryEntry, MatchReason } from "../types";
import { MatchInsight, Traits, matchInsight } from "./insights";
import { candidateLatLng, isCandidateForViewer } from "./prefs";

/**
 * Duos: two friends match with another pair. These are the pure rules; the
 * callables live in ../duos.ts.
 */

/** Unambiguous characters for invite codes (no 0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;

/** Cryptographically random, so codes can't be predicted. */
export function newInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Codes are typed by people: accept lower case and stray spaces. */
export function normaliseInviteCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  return code.length === INVITE_CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}

/** The group chat between two duos. */
export const duoMatchIdOf = (duoA: string, duoB: string) =>
  duoA < duoB ? `duo_${duoA}__${duoB}` : `duo_${duoB}__${duoA}`;

/** Both would want to see each other: gender, age and distance, in both directions. */
function wantEachOther(a: DiscoveryEntry, b: DiscoveryEntry): boolean {
  // Duo group compatibility continues to account for every friend's preferences.
  return isCandidateForViewer(a, b, { viewerLocation: candidateLatLng(a), sharedVibesOnly: false }) &&
    isCandidateForViewer(b, a, { viewerLocation: candidateLatLng(b), sharedVibesOnly: false });
}

/**
 * Two duos fit when all four people are visible in the same cohort, and every
 * person has someone on the other side they'd want to see and who'd want to
 * see them. The one-night-stand setting is never used for duos.
 */
export function duosFit(mine: DiscoveryEntry[], theirs: DiscoveryEntry[]): boolean {
  if (mine.length !== 2 || theirs.length !== 2) return false;
  const everyone = [...mine, ...theirs];
  if (new Set(everyone.map((entry) => entry.uid)).size !== 4) return false;
  const cohort = mine[0].cohort ?? "public";
  if (!everyone.every((entry) => entry.visible && (entry.cohort ?? "public") === cohort)) return false;
  return (
    mine.every((person) => theirs.some((other) => wantEachOther(person, other))) &&
    theirs.every((person) => mine.some((other) => wantEachOther(other, person)))
  );
}

const union = (lists: string[][]) => Array.from(new Set(lists.flat()));

/** What a pair shares as a whole, for the matchmaker. Never includes the casual flag. */
export function duoTraits(members: Traits[]): Traits {
  return {
    interests: union(members.map((member) => member.interests)),
    vibes: union(members.map((member) => member.vibes)),
    intentions: union(members.map((member) => member.intentions)),
    quickAnswers: [],
    casual: false
  };
}

const DUO_REASONS = new Set<MatchReason["kind"]>(["interests", "vibes", "intentions"]);

/** How well two pairs fit, and why ("You all love music"). */
export function duoInsight(mine: Traits[], theirs: Traits[], lastActiveAt: number, now = Date.now()): MatchInsight {
  const insight = matchInsight(duoTraits(mine), { ...duoTraits(theirs), distanceKm: null, lastActiveAt }, now);
  return {
    compatibility: insight.compatibility,
    reasons: insight.reasons.filter((reason) => DUO_REASONS.has(reason.kind)),
    casualMatch: false
  };
}
