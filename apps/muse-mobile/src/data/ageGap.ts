import type { AgeGapSide, Gender } from "../types/models";

/** Silver Foxes and Cougars are 35 or older (the server enforces the same). */
export const AGE_GAP_OLDER_MIN_AGE = 35;

/** What a member's side is called on their card. */
export function ageGapLabel(side: AgeGapSide, gender: Gender | undefined): string {
  if (side === "intoOlder") return "✨ Into someone older";
  return gender === "woman" ? "🦊 Cougar" : "🦊 Silver Fox";
}

/** Paire Plus filter options on Discover. */
export const AGE_GAP_FILTERS: Array<{ id: AgeGapSide | null; label: string }> = [
  { id: null, label: "Everyone" },
  { id: "older", label: "🦊 Silver Foxes & Cougars" },
  { id: "intoOlder", label: "✨ Into someone older" }
];
