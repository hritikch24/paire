import { DiscoveryEntry, UserSettings } from "../types";
import { activeGarbaSeason, GARBA_RADIUS_KM, istDate, sharedGarbaNights, upcomingGarbaNights } from "./garba";
import { distanceKm, isValidLatLng } from "./geo";
import { isMutualCandidate } from "./prefs";

export const DAY_MS = 86_400_000;
export type ReminderState = { enabled?: boolean; recentAttempts?: number[]; garbaSeason?: string; latestId?: string; openedAt?: number };
export type ReminderPlan = { type: "people" | "garba"; title: string; body: string; season?: string };

/** A separate, explicit choice: an old browser permission is never marketing consent. */
export function reminderDue(settings: UserSettings | undefined, state: ReminderState, lastActiveAt: number, now: number): boolean {
  if (settings?.notifications?.reminders !== true || !Number.isFinite(lastActiveAt) || lastActiveAt <= 0) return false;
  const absent = now - lastActiveAt;
  if (absent < DAY_MS || absent > 30 * DAY_MS) return false;
  const recent = (state.recentAttempts ?? []).filter((at) => Number.isFinite(at) && now - at < 7 * DAY_MS);
  return recent.length < 2 && recent.every((at) => now - at >= 3 * DAY_MS);
}

/** Candidates supplied here have already passed current visibility, verification and exclusion checks. */
export function chooseReminder(viewer: DiscoveryEntry, settings: UserSettings, candidates: DiscoveryEntry[], state: ReminderState, now: number): ReminderPlan | null {
  const location = settings.locationEnabled && isValidLatLng(settings.location) ? settings.location : null;
  const eligible = candidates.filter((candidate) => isMutualCandidate(viewer, candidate, { viewerLocation: location, sharedVibesOnly: settings.sharedVibesOnly === true }));
  const season = activeGarbaSeason(now);
  // Event reminders require the recipient to have chosen nights and a recent approximate location.
  const freshLocation = location && typeof location.updatedAt === "number" && now - location.updatedAt >= 0 && now - location.updatedAt <= 7 * DAY_MS;
  if (season && state.garbaSeason !== season.id && freshLocation && upcomingGarbaNights(settings.garbaNights, now).length) {
    const tonight = istDate(now), tomorrow = istDate(now + DAY_MS);
    const relevant = eligible.some((candidate) => candidate.lat !== null && candidate.lng !== null &&
      distanceKm(location, { lat: candidate.lat, lng: candidate.lng }) <= GARBA_RADIUS_KM &&
      sharedGarbaNights(settings.garbaNights, candidate.garbaNights, now).some((night) => night === tonight || night === tomorrow));
    if (relevant) return { type: "garba", title: "Garba plans? Find your Paire 🪔", body: "People nearby share your upcoming Garba nights. Take a look and say hello with a thoughtful like.", season: season.id };
  }
  // A light twice-weekly discovery digest. "New" means joined after the member last visited or was reminded.
  const weekday = new Date(`${istDate(now)}T00:00:00Z`).getUTCDay();
  const cutoff = Math.max(viewer.lastActiveAt, now - 7 * DAY_MS, ...(state.recentAttempts ?? []).filter(Number.isFinite));
  if ((weekday === 2 || weekday === 5) && eligible.some((candidate) => typeof candidate.createdAt === "number" && candidate.createdAt > cutoff && candidate.createdAt <= now)) {
    return { type: "people", title: "A little spark for your week ✨", body: "New people fit your preferences on Paire. Come meet them and send a thoughtful like." };
  }
  return null;
}
