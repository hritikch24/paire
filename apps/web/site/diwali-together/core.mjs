/**
 * Pure logic for the Diwali Together page and invitation-card maker. No DOM access, so it can be
 * tested in Node. Mirrors the app's plans (apps/muse-mobile/src/data/diwali.ts); keep them in step.
 * Everything here runs in the visitor's browser: nothing about a card is sent anywhere.
 */
export const SEASON = { opensOn: '2026-10-24', firstDay: '2026-11-05', diwali: '2026-11-08', lastDay: '2026-11-10' };
export const DAYS = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
export const VIBES = {
  chai: { label: 'Chai & mithai', ask: 'Chai & mithai, anyone?', alt: 'chai and mithai' },
  mela: { label: 'Mela stroll', ask: 'A mela stroll, anyone?', alt: 'a mela stroll' },
  lights: { label: 'Lights walk', ask: 'A walk to see the lights?', alt: 'a lights walk' },
  meal: { label: 'Café meal', ask: 'A café meal, anyone?', alt: 'a café meal' },
  bash: { label: 'Diwali bash', ask: 'Going to a Diwali bash?', alt: 'a Diwali bash' }
};
export const DEFAULT_VIBE = 'chai';
export const MAX_CITY = 40;
const MAX_FRAGMENT = 200;

/** India's calendar date, "YYYY-MM-DD". */
export const istDate = (now = Date.now()) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);
/** soon → open (24 Oct to 10 Nov IST) → closed. */
export function campaignState(now = Date.now()) {
  const today = istDate(now);
  return today < SEASON.opensOn ? 'soon' : today <= SEASON.lastDay ? 'open' : 'closed';
}
/** Days still to come in the planning window (tonight included). */
export const upcomingDays = (now = Date.now()) => DAYS.filter((day) => day >= istDate(now));
/** "Sun 8 Nov" */
export const dayLabel = (day) => new Date(`${day}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).replace(',', '');
/** "Sunday 8 November" */
export const longDayLabel = (day) => new Date(`${day}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).replace(',', '');

/** A city name only: letters, marks, spaces and . ' - (no digits, symbols, links or addresses). */
export function cleanCity(value) {
  return String(value ?? '').normalize('NFKC').replace(/[^\p{L}\p{M}\s.'’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CITY).trim();
}
/** The first valid, still-upcoming day; defaults to Diwali itself, or the next day left. */
export function pickDay(day, now = Date.now()) {
  const days = upcomingDays(now);
  if (days.includes(day)) return day;
  return days.includes(SEASON.diwali) ? SEASON.diwali : days[0] ?? SEASON.diwali;
}
export const normalizeState = (state = {}, now = Date.now()) => ({
  vibe: Object.hasOwn(VIBES, state.vibe) ? state.vibe : DEFAULT_VIBE,
  day: pickDay(state.day, now),
  city: cleanCity(state.city)
});
/** Share state lives in the URL fragment, so it is never sent to a server. Oversized or odd input is ignored. */
export function parseFragment(hash, now = Date.now()) {
  const raw = String(hash ?? '').replace(/^#/, '');
  if (!raw.includes('=') || raw.length > MAX_FRAGMENT) return null;
  let params;
  try { params = new URLSearchParams(raw); } catch { return null; }
  const text = (key) => { const value = params.get(key); return typeof value === 'string' && value.length <= 120 ? value : undefined; };
  if (!params.has('v') && !params.has('d') && !params.has('c')) return null;
  return normalizeState({ vibe: text('v'), day: text('d'), city: text('c') }, now);
}
export function toFragment(state) {
  const { vibe, day, city } = normalizeState(state);
  const params = new URLSearchParams({ v: vibe, d: day });
  if (city) params.set('c', city);
  return `#${params}`;
}
/** Lines drawn on the card. */
export function cardLines(state) {
  const { vibe, day, city } = normalizeState(state);
  return {
    eyebrow: 'DIWALI 2026',
    title: 'Diwali, together.',
    ask: VIBES[vibe].ask,
    where: `${city ? `Around ${city} · ` : ''}${dayLabel(day)}`,
    care: 'Public places. Mutual yes only.',
    brand: 'paire.in/diwali-together'
  };
}
/** Plain-text description for alt text and the live region. */
export const describeCard = (state) => {
  const { vibe, day, city } = normalizeState(state);
  return `${VIBES[vibe].label}, ${longDayLabel(day)}${city ? `, around ${city}` : ''}`;
};
export const shareText = (state) => `${cardLines(state).ask} ${cardLines(state).where}. Public places, mutual yes only.`;

/** Small seeded generator so one choice always draws the same sky. */
export function seeded(seed) {
  let a = 0;
  for (const char of String(seed)) a = (Math.imul(a, 31) + char.charCodeAt(0)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Shapes of one diya in a 200 × 140 box; the page art and the card share them. */
export const DIYA = {
  bowl: 'M14 76C14 108 52 126 100 126C148 126 186 108 186 76C160 86 130 90 100 90C70 90 40 86 14 76Z',
  rim: 'M14 76C40 86 70 90 100 90C130 90 160 86 186 76',
  lip: { cx: 100, cy: 76, rx: 86, ry: 12 },
  flame: 'M100 72C82 54 90 30 100 6C110 30 118 54 100 72Z',
  core: 'M100 70C92 60 95 46 100 34C105 46 108 60 100 70Z'
};
