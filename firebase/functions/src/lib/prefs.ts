import { DiscoveryEntry, GENDERS, Gender, LatLng } from "../types";
import { distanceKm } from "./geo";

export const MIN_AGE = 18;
export const MAX_AGE = 100;

export function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

export function normalizeShowMe(value: unknown): Gender[] {
  if (!Array.isArray(value)) return [...GENDERS];
  const genders = Array.from(new Set(value.filter(isGender)));
  return genders.length ? genders : [...GENDERS];
}

export function clampAge(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(value)));
}

export function normalizeAgeRange(min: unknown, max: unknown): { ageMin: number; ageMax: number } {
  const ageMin = clampAge(min, MIN_AGE);
  const ageMax = clampAge(max, MAX_AGE);
  return ageMin <= ageMax ? { ageMin, ageMax } : { ageMin: ageMax, ageMax: ageMin };
}

export type Viewer = Pick<
  DiscoveryEntry,
  "uid" | "cohort" | "gender" | "age" | "showMe" | "ageMin" | "ageMax" | "maxDistanceKm" | "vibes"
> &
  Partial<Pick<DiscoveryEntry, "intentions" | "languages" | "sameIntentOnly" | "sharedLanguageOnly">>;

const overlaps = (a: string[] | undefined, b: string[] | undefined) => {
  const set = new Set(a ?? []);
  return (b ?? []).some((item) => set.has(item));
};

export type CompatibilityOptions = {
  /** The viewer's precise location, if they share it. */
  viewerLocation: LatLng | null;
  sharedVibesOnly: boolean;
};

/**
 * Both people must want to see each other: gender preferences and age ranges
 * are checked in both directions, and distance limits apply to both sides when
 * both locations are known.
 */
export function isMutualCandidate(
  viewer: Viewer,
  candidate: DiscoveryEntry,
  options: CompatibilityOptions
): boolean {
  if (!candidate.visible || candidate.uid === viewer.uid) return false;
  if ((candidate.cohort ?? "public") !== (viewer.cohort ?? "public")) return false;
  if (!isGender(candidate.gender) || typeof candidate.age !== "number") return false;
  if (!isGender(viewer.gender) || typeof viewer.age !== "number") return false;

  if (!normalizeShowMe(viewer.showMe).includes(candidate.gender)) return false;
  if (!normalizeShowMe(candidate.showMe).includes(viewer.gender)) return false;

  if (candidate.age < viewer.ageMin || candidate.age > viewer.ageMax) return false;
  if (viewer.age < (candidate.ageMin ?? MIN_AGE) || viewer.age > (candidate.ageMax ?? MAX_AGE)) {
    return false;
  }

  // "Same intentions only" and "Speaks my language" work both ways: whoever turns
  // them on neither sees nor is seen by people outside them. Unknown never counts as shared.
  if ((viewer.sameIntentOnly || candidate.sameIntentOnly) && !overlaps(viewer.intentions, candidate.intentions)) {
    return false;
  }
  if ((viewer.sharedLanguageOnly || candidate.sharedLanguageOnly) && !overlaps(viewer.languages, candidate.languages)) {
    return false;
  }

  if (options.sharedVibesOnly) {
    const viewerVibes = new Set(viewer.vibes ?? []);
    if (!(candidate.vibes ?? []).some((vibe) => viewerVibes.has(vibe))) return false;
  }

  const candidateLocation = candidateLatLng(candidate);
  if (options.viewerLocation && candidateLocation) {
    const km = distanceKm(options.viewerLocation, candidateLocation);
    if (viewer.maxDistanceKm && km > viewer.maxDistanceKm) return false;
    if (candidate.maxDistanceKm && km > candidate.maxDistanceKm) return false;
  }

  return true;
}

export function candidateLatLng(entry: Pick<DiscoveryEntry, "lat" | "lng">): LatLng | null {
  if (typeof entry.lat !== "number" || typeof entry.lng !== "number") return null;
  return { lat: entry.lat, lng: entry.lng };
}
