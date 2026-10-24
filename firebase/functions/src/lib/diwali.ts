import { istDate } from "./garba";
import { distanceKm, isValidLatLng } from "./geo";
import type { LatLng } from "../types";

/** India Post lists Diwali on 8 November 2026; this is our planning window, not an organised event. */
export const DIWALI_SEASON = { id: "diwali-2026", opensOn: "2026-10-24", firstDay: "2026-11-05", lastDay: "2026-11-10" } as const;
export const DIWALI_VIBES = ["chai", "mela", "lights", "meal", "bash"] as const;
export type DiwaliVibe = typeof DIWALI_VIBES[number];
export type DiwaliPlan = { dates: string[]; vibes: DiwaliVibe[] };
export const MAX_DIWALI_CHOICES = 3;
export const DIWALI_RADIUS_KM = 50;
export const DIWALI_LABELS: Record<DiwaliVibe, string> = { chai: "Chai & mithai", mela: "Mela stroll", lights: "Lights walk", meal: "Café meal", bash: "Diwali bash" };
export const diwaliOpen = (now = Date.now()) => DIWALI_SEASON.opensOn <= istDate(now) && istDate(now) <= DIWALI_SEASON.lastDay;
export function diwaliDates(now = Date.now()): string[] {
  if (!diwaliOpen(now)) return [];
  return Array.from({ length: 6 }, (_, i) => `2026-11-${String(i + 5).padStart(2, "0")}`).filter(date => date >= istDate(now));
}
export function normalizeDiwaliPlan(value: unknown, now = Date.now()): DiwaliPlan | null {
  if (!diwaliOpen(now) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>, validDates = new Set(diwaliDates(now));
  if (!Array.isArray(raw.dates) || !Array.isArray(raw.vibes)) return null;
  const dates = [...new Set(raw.dates.filter((date): date is string => typeof date === "string" && validDates.has(date)))].sort().slice(0, MAX_DIWALI_CHOICES);
  const vibes = [...new Set(raw.vibes.filter((vibe): vibe is DiwaliVibe => DIWALI_VIBES.includes(vibe as DiwaliVibe)))].slice(0, MAX_DIWALI_CHOICES);
  return dates.length && vibes.length ? { dates, vibes } : null;
}
/** Only a count and overlapping activities may leave the server. Exact dates stay private. */
export function sharedDiwaliPlans(mine: unknown, theirs: unknown, now = Date.now()): { days: number; vibes: DiwaliVibe[] } | null {
  const a = normalizeDiwaliPlan(mine, now), b = normalizeDiwaliPlan(theirs, now);
  if (!a || !b) return null;
  const days = a.dates.filter(date => b.dates.includes(date)).length;
  const vibes = a.vibes.filter(vibe => b.vibes.includes(vibe));
  return days && vibes.length ? { days, vibes } : null;
}
export function diwaliCityKey(value: unknown): string {
  // "Pune, Maharashtra" and "Pune" are the same city for this purpose.
  return typeof value === "string" && value.length <= 80 ? value.normalize("NFKC").split(",")[0].trim().toLowerCase().replace(/\s+/g, " ") : "";
}
/** Existing search preferences still apply. GPS is optional; otherwise require the same stated city. */
export function sameDiwaliArea(viewerLocation: LatLng | null, candidateLocation: LatLng | null, viewerCity: unknown, candidateCity: unknown): boolean {
  if (isValidLatLng(viewerLocation) && isValidLatLng(candidateLocation)) return distanceKm(viewerLocation, candidateLocation) <= DIWALI_RADIUS_KM;
  const city = diwaliCityKey(viewerCity);
  return Boolean(city && city === diwaliCityKey(candidateCity));
}

export type DiwaliViewer = { plan: DiwaliPlan; location: LatLng | null; city: unknown };
/**
 * What two members share, or null when they can't plan together: needs a common upcoming
 * date AND activity, in the same area. Used for the index scan and again on fresh data.
 */
export function diwaliOverlap(viewer: DiwaliViewer, plan: unknown, location: LatLng | null, city: unknown, now = Date.now()): { days: number; vibes: DiwaliVibe[] } | null {
  const shared = sharedDiwaliPlans(viewer.plan, plan, now);
  return shared && sameDiwaliArea(viewer.location, location, viewer.city, city) ? shared : null;
}
