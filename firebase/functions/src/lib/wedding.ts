import { createHash, randomBytes } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { scanMessage } from "./chatSafety";

/**
 * Wedding Nods: adults going to the same wedding can privately signal interest.
 * Everything here is pure (no database), so the matching and screening rules are
 * easy to test. See docs/wedding-nods.md.
 */
export const WEDDING = {
  /** Under this many guests the app shows only "Guests are still joining". */
  minGuests: 10,
  nodsPerWedding: 3,
  /** Weddings a member may join in any rolling 7 days. */
  joinsPerWeek: 2,
  weekMs: 7 * 24 * 60 * 60 * 1000,
  /** A wedding closes this many days after its date. */
  retainDays: 7,
  /** A date may be entered from this many days in the past (the wedding is still open) up to this far ahead. */
  maxDaysAhead: 180,
  maxClueLength: 60,
  /** Invitation photos are deleted after this long. */
  inviteRetentionMs: 30 * 24 * 60 * 60 * 1000,
  maxInviteBytes: 8 * 1024 * 1024,
  /** Guests read per wedding. */
  maxGuestsScanned: 500,
  /** Distinct reporters before a guest is hidden from that wedding. */
  hideAfterReporters: 3,
  joinCallsPerDay: 20,
  guestCallsPerDay: 120,
  nodCallsPerDay: 60,
  safetyCallsPerDay: 60,
  /** Names shorter than this must match exactly; longer ones may differ by one letter. */
  fuzzyMinLength: 4
} as const;

export const WEDDING_SIDES = ["bride", "groom"] as const;
export type WeddingSide = (typeof WEDDING_SIDES)[number];
export const AGE_BANDS = ["18-24", "25-29", "30-34", "35+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "doctor", "prof", "professor", "er", "ca", "adv", "capt", "col", "maj", "lt",
  "shri", "shree", "sri", "sh", "smt", "shrimati", "kumari", "kum", "km", "ku", "sau", "saubhagyavati", "chi", "chiranjeevi",
  "late", "ji", "sir", "madam"
]);

/** One first name, lowercased, without accents, punctuation or honorifics. Null when nothing usable is left. */
export function normalizeFirstName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tokens = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{M}]+/u)
    .filter(Boolean);
  const first = tokens.find((token) => !HONORIFICS.has(token));
  if (!first || first.length < 2 || first.length > 24) return null;
  return first;
}

/** True when two strings differ by at most one inserted, deleted or replaced letter. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

/** Same first name: exact, or one typo for names long enough that a typo is unlikely to be another name. */
export function sameFirstName(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= WEDDING.fuzzyMinLength && withinOneEdit(a, b);
}

/** The two names in a fixed order, so "Riya and Arjun" and "Arjun and Riya" are the same wedding. */
export const sortedNames = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a]);

/** Do two couples (each already normalised) have the same names, in either order and allowing a typo? */
export function sameCouple(x: readonly [string, string], y: readonly [string, string]): boolean {
  return (sameFirstName(x[0], y[0]) && sameFirstName(x[1], y[1])) || (sameFirstName(x[0], y[1]) && sameFirstName(x[1], y[0]));
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
/** Finds the few weddings on one date at one PIN code; the names are compared afterwards. */
export const weddingBucket = (date: string, pin: string) => sha(`paire-wedding-bucket|${date}|${pin}`).slice(0, 32);
/** Hash of the exact normalised key. */
export const weddingKeyHash = (names: readonly [string, string], date: string, pin: string) => sha(`paire-wedding-key|${names.join("|")}|${date}|${pin}`).slice(0, 32);

export function istDateOf(now: number): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a wedding closes: the end of the 7th day after its date, India time. */
export function closesAtOf(date: string): number {
  return Date.parse(`${date}T00:00:00+05:30`) + (WEDDING.retainDays + 1) * DAY_MS;
}

/** Throws unless `date` is a real calendar date that is not yet closed and not too far ahead. */
export function assertWeddingDate(date: unknown, now = Date.now()): string {
  if (typeof date !== "string" || !DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new HttpsError("invalid-argument", "Enter the wedding date.");
  }
  if (closesAtOf(date) <= now) throw new HttpsError("failed-precondition", "That wedding has already closed.", { reason: "wedding-closed" });
  if (Date.parse(`${date}T00:00:00+05:30`) > now + WEDDING.maxDaysAhead * DAY_MS) {
    throw new HttpsError("invalid-argument", "Wedding Nods opens closer to the date. Come back within six months of it.", { reason: "wedding-too-far" });
  }
  return date;
}

export function assertPin(pin: unknown): string {
  if (typeof pin !== "string" || !/^[1-9]\d{5}$/.test(pin.trim())) throw new HttpsError("invalid-argument", "Enter the 6-digit PIN code of the venue.");
  return pin.trim();
}

export function ageBandOf(age: number): AgeBand {
  if (age <= 24) return "18-24";
  if (age <= 29) return "25-29";
  if (age <= 34) return "30-34";
  return "35+";
}

/** What the member typed, tidied for showing back to them only. */
export function displayName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, 24) : "";
}

const CLUE_BLOCKED = [
  /https?:|www\.|\.(com|in|me|co|net|org|app|ly)\b/i,
  /[@＠]/,
  /\d{6,}/,
  /\b(whats\s?app|wa\.me|insta(gram)?|snap(chat)?|telegram|facebook|fb|linkedin|twitter|contact|phone|mobile|call\s?me|dm\s?me|text\s?me|ping\s?me)\b/i,
  /\b(my|mera|meri)\s+(number|no)\b/i,
  /\b(room|suite)\s*(no\.?|number|#)?\s*\d+/i,
  /\b(hotel|resort)\b.*\b(room|floor)\b/i
];

/**
 * Screens the short "spot me" clue. Uses the chat-safety scanner (so the same
 * scams, threats, abuse and contact details are refused as in chat) plus checks
 * for contact details, links, handles, room numbers and the member's own name.
 * Returns the cleaned clue, or throws.
 */
export function screenClue(raw: unknown, ownName = ""): string {
  const clue = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (clue.length < 3) throw new HttpsError("invalid-argument", "Add a short clue so they can spot you, like “navy sherwani near the stage”.");
  if (clue.length > WEDDING.maxClueLength) throw new HttpsError("invalid-argument", `Keep the clue under ${WEDDING.maxClueLength} characters.`);
  const refuse = () => new HttpsError("invalid-argument", "That clue can't include a name, phone number, handle, link or location. Describe what you're wearing or where you'll be standing.", { reason: "clue-refused" });
  if (CLUE_BLOCKED.some((pattern) => pattern.test(clue))) throw refuse();
  if (scanMessage(clue)) throw refuse();
  const lower = clue.toLowerCase();
  for (const token of ownName.toLowerCase().split(/[^\p{L}]+/u)) {
    if (token.length >= 3 && new RegExp(`(^|[^\\p{L}])${token}($|[^\\p{L}])`, "u").test(lower)) throw refuse();
  }
  return clue;
}

const ADJECTIVES = [
  "Saffron", "Marigold", "Jasmine", "Velvet", "Golden", "Crimson", "Ivory", "Emerald", "Copper", "Rosy", "Silken", "Moonlit",
  "Sunny", "Starry", "Dreamy", "Gentle", "Merry", "Spicy", "Minty", "Cosmic", "Dapper", "Breezy", "Sparkly", "Quiet"
];
const NOUNS = [
  "Peacock", "Lotus", "Sitar", "Diya", "Tabla", "Mango", "Kite", "Chai", "Jalebi", "Paan", "Dhol", "Bangle", "Monsoon", "Lantern",
  "Parrot", "Elephant", "Swan", "Kulfi", "Mehendi", "Ghungroo", "Sparrow", "Cardamom", "Firefly", "Cuckoo"
];

/** A friendly anonymous nickname, never one already taken in the wedding. */
export function generateNickname(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const name = `${ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(random() * NOUNS.length)]}`;
    if (!taken.has(name)) return name;
  }
  for (let n = 2; ; n += 1) {
    const name = `${ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(random() * NOUNS.length)]} ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Opaque id shown to other guests instead of the uid. */
export const newCardId = () => randomBytes(12).toString("base64url");
export const reporterHash = (weddingId: string, reporterUid: string) => sha(`paire-wedding-reporter|${weddingId}|${reporterUid}`).slice(0, 20);
/** Stable pseudo-random order per viewer, so the list order never reveals who joined or acted first. */
export const orderKey = (viewerUid: string, cardId: string) => sha(`paire-wedding-order|${viewerUid}|${cardId}`);

export const nodId = (from: string, to: string) => `${from}_${to}`;

export function parseSide(value: unknown): WeddingSide {
  if (value === "bride" || value === "groom") return value;
  throw new HttpsError("invalid-argument", "Choose the bride's side or the groom's side.");
}

export type JoinInput = { names: [string, string]; labels: [string, string]; date: string; pin: string; side: WeddingSide; clue: string; invitePath: string | null };

export function parseJoinInput(data: unknown, uid: string, ownName: string, now = Date.now()): JoinInput {
  const body = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const bride = normalizeFirstName(body.brideName);
  const groom = normalizeFirstName(body.groomName);
  if (!bride || !groom) throw new HttpsError("invalid-argument", "Enter the bride's and the groom's first names.");
  const date = assertWeddingDate(body.date, now);
  const pin = assertPin(body.pin);
  const side = parseSide(body.side);
  const clue = screenClue(body.clue, ownName);
  let invitePath: string | null = null;
  if (body.invitePath !== undefined && body.invitePath !== null && body.invitePath !== "") {
    if (typeof body.invitePath !== "string" || !new RegExp(`^wedding-invites/${uid}/[A-Za-z0-9._-]{1,80}$`).test(body.invitePath)) {
      throw new HttpsError("invalid-argument", "That invitation photo isn't valid.");
    }
    invitePath = body.invitePath;
  }
  return { names: sortedNames(bride, groom), labels: [displayName(body.brideName), displayName(body.groomName)], date, pin, side, clue, invitePath };
}
