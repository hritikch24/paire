/**
 * Garba Nights: a free, seasonal edition of Discover for Navratri. Mirrors the
 * server's firebase/functions/src/lib/garba.ts (keep the seasons in step).
 * Dates are India (IST) calendar dates, "YYYY-MM-DD".
 */
export type GarbaSeason = { id: string; opensOn: string; firstNight: string; lastNight: string };

export const GARBA_SEASONS: GarbaSeason[] = [
  // Sharad Navratri 2026: 11–19 October, then Dussehra on the 20th.
  { id: "2026", opensOn: "2026-10-01", firstNight: "2026-10-11", lastNight: "2026-10-20" }
];

/** Nights a member can pick (the server keeps the same limit). */
export const MAX_GARBA_NIGHTS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function istDate(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function activeGarbaSeason(now = Date.now()): GarbaSeason | null {
  const today = istDate(now);
  return GARBA_SEASONS.find((season) => season.opensOn <= today && today <= season.lastNight) ?? null;
}

export type GarbaNight = { date: string; title: string; day: string };

/** The season's nights still to come (tonight included): "Night 3" … "Dussehra". */
export function upcomingNights(now = Date.now()): GarbaNight[] {
  const season = activeGarbaSeason(now);
  if (!season) return [];
  const today = istDate(now);
  const nights: GarbaNight[] = [];
  const first = Date.parse(`${season.firstNight}T00:00:00Z`);
  for (let day = first, index = 1; day <= Date.parse(`${season.lastNight}T00:00:00Z`); day += DAY_MS, index += 1) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (date < today) continue;
    nights.push({ date, title: date === season.lastNight ? "Dussehra" : `Night ${index}`, day: garbaNightLabel(date) });
  }
  return nights;
}

/** The member's picked nights that are still to come. */
export function myUpcomingNights(picked: string[] | null | undefined, now = Date.now()): string[] {
  const valid = new Set(upcomingNights(now).map((night) => night.date));
  return Array.from(new Set((picked ?? []).filter((night) => valid.has(night)))).sort().slice(0, MAX_GARBA_NIGHTS);
}

/** "Thu 15 Oct". */
export function garbaNightLabel(night: string): string {
  const date = new Date(`${night}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** Card badge: how many of your nights they're going to (the server never says which). */
export function garbaBadge(shared: number): string {
  return shared === 1 ? "🪔 Going on 1 of your Garba nights" : `🪔 Going on ${shared} of your Garba nights`;
}
