/**
 * Garba Nights: a free, seasonal edition of Discover for Navratri. Members pick
 * up to MAX_GARBA_NIGHTS nights they're going to Garba or Dandiya; the edition
 * shows only people nearby going on at least one of the same nights. Nights are
 * private: cards show only how many nights you share, never which ones, so nobody
 * can read someone's schedule. Only a match's icebreakers name a shared night.
 *
 * Dates are India (IST) calendar dates, "YYYY-MM-DD". Add next year's season
 * here (and in the app's src/data/garba.ts) once its dates are announced.
 */
export type GarbaSeason = {
  /** Stored on discovery entries; one composite index serves every season. */
  id: string;
  /** The edition opens this many days before the first night, for planning. */
  opensOn: string;
  firstNight: string;
  lastNight: string;
};

export const GARBA_SEASONS: GarbaSeason[] = [
  // Sharad Navratri 2026: 11–19 October, then Dussehra on the 20th.
  { id: "2026", opensOn: "2026-10-01", firstNight: "2026-10-11", lastNight: "2026-10-20" }
];

/** Nights a member can pick: enough for a plan, too few to map anyone's week. */
export const MAX_GARBA_NIGHTS = 4;
/** The edition is local: both people need a location, within this distance. */
export const GARBA_RADIUS_KM = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in India. */
export function istDate(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Every night of a season, in order. */
export function seasonNights(season: GarbaSeason): string[] {
  const nights: string[] = [];
  for (let day = Date.parse(`${season.firstNight}T00:00:00Z`); day <= Date.parse(`${season.lastNight}T00:00:00Z`); day += DAY_MS) {
    nights.push(new Date(day).toISOString().slice(0, 10));
  }
  return nights;
}

/** The season open today (from its opening day until its last night), if any. */
export function activeGarbaSeason(now = Date.now(), seasons = GARBA_SEASONS): GarbaSeason | null {
  const today = istDate(now);
  return seasons.find((season) => season.opensOn <= today && today <= season.lastNight) ?? null;
}

/** The member's chosen nights still to come (tonight included) in the open season, at most MAX_GARBA_NIGHTS. */
export function upcomingGarbaNights(value: unknown, now = Date.now(), seasons = GARBA_SEASONS): string[] {
  const season = activeGarbaSeason(now, seasons);
  if (!season || !Array.isArray(value)) return [];
  const today = istDate(now);
  const valid = new Set(seasonNights(season));
  const picked = value.filter(
    (night): night is string => typeof night === "string" && DATE_PATTERN.test(night) && valid.has(night) && night >= today
  );
  return Array.from(new Set(picked)).sort().slice(0, MAX_GARBA_NIGHTS);
}

/** Nights both members are going, still to come. */
export function sharedGarbaNights(mine: unknown, theirs: unknown, now = Date.now(), seasons = GARBA_SEASONS): string[] {
  const theirNights = new Set(upcomingGarbaNights(theirs, now, seasons));
  return upcomingGarbaNights(mine, now, seasons).filter((night) => theirNights.has(night));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 15 Oct". */
export function garbaNightLabel(night: string): string {
  const date = new Date(`${night}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}
