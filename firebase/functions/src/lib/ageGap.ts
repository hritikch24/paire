import { AGE_GAP_SIDES, AgeGapSide, DiscoveryEntry } from "../types";

/** Silver Foxes and Cougars are 35 or older. */
export const AGE_GAP_OLDER_MIN_AGE = 35;

export function isAgeGapSide(value: unknown): value is AgeGapSide {
  return typeof value === "string" && (AGE_GAP_SIDES as readonly string[]).includes(value);
}

/** The side a member actually holds: "older" needs the minimum age, anything else is no side. */
export function eligibleAgeGap(side: unknown, age: number | null): AgeGapSide | null {
  if (side === "older") return age !== null && age >= AGE_GAP_OLDER_MIN_AGE ? "older" : null;
  return side === "intoOlder" ? "intoOlder" : null;
}

/**
 * The Plus age-gap filter. "older" shows Silver Foxes and Cougars older than the
 * viewer; "intoOlder" shows people into someone older who are younger than the viewer.
 */
export function matchesAgeGapFilter(
  filter: AgeGapSide,
  viewerAge: number,
  candidate: Pick<DiscoveryEntry, "ageGap" | "age">
): boolean {
  if (candidate.ageGap !== filter || typeof candidate.age !== "number") return false;
  return filter === "older" ? candidate.age > viewerAge : candidate.age < viewerAge;
}
