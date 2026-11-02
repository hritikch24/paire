import { passDays, isPlusPlan } from "./razorpay";

const DAY = 86_400_000;
type RecordData = Record<string, unknown>;
export type PremiumCredit = { key: string; milliseconds: number; acceptedAt: number; unlimitedLikes: boolean; revokedAt?: number };
export type PremiumQueue = { version: 2; initializedAt: number; anchor: number; credits: PremiumCredit[] };
export type PremiumWindow = { key: string; startsAt: number; expiresAt: number; active: boolean; unlimitedLikes: boolean };
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
export const purchaseKey = (source: string, id: string) => `${source}:${id}`;
export const giftCreditKey = (id: string) => `gift:${id}`;

export function premiumQueue(value: unknown): PremiumQueue | null {
  if (!value || typeof value !== "object") return null;
  const q = value as PremiumQueue;
  if (q.version !== 2 || !Number.isSafeInteger(q.initializedAt) || !Number.isSafeInteger(q.anchor) || !Array.isArray(q.credits)) return null;
  if (q.credits.some(c => !c || typeof c.key !== "string" || !Number.isSafeInteger(c.milliseconds) || c.milliseconds <= 0 || !Number.isSafeInteger(c.acceptedAt) || typeof c.unlimitedLikes !== "boolean" || (c.revokedAt !== undefined && !Number.isSafeInteger(c.revokedAt)))) return null;
  if (new Set(q.credits.map(c => c.key)).size !== q.credits.length) return null;
  return q;
}

/** A reversal retains elapsed service only. Other queued sources move forward, never into the past. */
export function premiumWindows(queue: PremiumQueue): PremiumWindow[] {
  let cursor = queue.anchor;
  return queue.credits.map(credit => {
    const startsAt = Math.max(cursor, credit.acceptedAt);
    const expiresAt = credit.revokedAt === undefined ? startsAt + credit.milliseconds : Math.max(startsAt, Math.min(startsAt + credit.milliseconds, credit.revokedAt));
    cursor = expiresAt;
    return { key: credit.key, startsAt, expiresAt, active: credit.revokedAt === undefined, unlimitedLikes: credit.unlimitedLikes };
  });
}

export function queueBenefits(queue: PremiumQueue, now: number) {
  const windows = premiumWindows(queue).filter(w => w.active && w.expiresAt > now);
  return {
    expiresAt: windows.reduce((until, w) => Math.max(until, w.expiresAt), 0),
    unlimitedLikesUntil: windows.filter(w => w.unlimitedLikes && w.startsAt <= now).reduce((until, w) => Math.max(until, w.expiresAt), 0)
  };
}

/** Drop fully elapsed prefixes so an account's financial history cannot grow this document forever. */
function compact(queue: PremiumQueue, now: number) {
  const windows = premiumWindows(queue);
  let drop = 0, anchor = queue.anchor;
  while (drop < windows.length && windows[drop].expiresAt <= now) { anchor = windows[drop].expiresAt; drop += 1; }
  return { queue: { ...queue, anchor, credits: queue.credits.slice(drop) }, retired: windows.slice(0, drop) };
}

export function appendPremiumCredit(queue: PremiumQueue, key: string, plan: string | number, now: number) {
  const existing = premiumWindows(queue).find(w => w.key === key);
  if (existing) return { queue, window: existing, retired: [] };
  const milliseconds = typeof plan === "number" ? plan * DAY : isPlusPlan(plan) && plan !== "lifetime" ? passDays(plan) * DAY : 0;
  if (milliseconds <= 0 || !Number.isSafeInteger(milliseconds)) throw new Error("Invalid premium duration");
  const { queue: next, retired } = compact(queue, now);
  next.credits = [...next.credits, { key, milliseconds, acceptedAt: now, unlimitedLikes: plan === "month" || plan === "halfyear" }];
  return { queue: next, window: premiumWindows(next).at(-1)!, retired };
}

export function reversePremiumCredit(queue: PremiumQueue, key: string, now: number) {
  const next = { ...queue, credits: queue.credits.map(c => (c.key === key || c.key.startsWith(`${key}:recovery:`)) && c.revokedAt === undefined ? { ...c, revokedAt: now } : c) };
  return compact(next, now);
}

/**
 * On first gift acceptance only, preserve remaining authoritative legacy rights.
 * Purchased windows are already serialized by the old ledger. Free grants overlap
 * those windows under the old max-expiry model, so only their uncovered tail is added.
 * Cache-only expiry never creates credit. Ambiguous overlapping paid windows need review.
 */
export function initialPremiumQueue(orders: RecordData[], support: RecordData | undefined, complimentary: RecordData | undefined, storeExpiry: number, now: number): PremiumQueue {
  if (complimentary?.lastSource === "gift" && complimentary?.status === "active") throw new Error("Legacy gifted access needs review before adding another gift");
  type Segment = { from: number; until: number; key: string; unlimitedLikes: boolean };
  const paid = orders.filter(o => o.plan !== "lifetime" && o.status === (o.paymentSource === "upi" ? "approved" : "paid") && finite(o.expiresAt) > now).map(o => ({
    from: Math.max(now, finite(o.startsAt)), until: finite(o.expiresAt), key: purchaseKey(String(o.paymentSource), String(o.id)), unlimitedLikes: o.plan === "month" || o.plan === "halfyear"
  })).filter(s => s.until > s.from).sort((a,b) => a.from-b.from || a.key.localeCompare(b.key));
  if (paid.some((s,i) => i > 0 && s.from < paid[i-1].until)) throw new Error("Overlapping existing paid passes need support review");
  const segments: Segment[] = [...paid];
  const grants = [
    { key: "legacy:store", until: storeExpiry, unlimitedLikes: false },
    { key: "legacy:support", until: support?.status === "active" && finite(support.startsAt) <= now ? finite(support.expiresAt) : 0, unlimitedLikes: support?.plan === "month" || support?.plan === "halfyear" || (Array.isArray(support?.coveredOrderIds) && orders.some(o => (o.plan === "month" || o.plan === "halfyear") && (support!.coveredOrderIds as unknown[]).includes(o.id))) },
    { key: "legacy:complimentary", until: complimentary?.status === "active" ? finite(complimentary.expiresAt) : 0, unlimitedLikes: false }
  ];
  for (const grant of grants) {
    let pieces = [{ from: now, until: grant.until }].filter(s => s.until > s.from);
    for (const occupied of segments) pieces = pieces.flatMap(s => occupied.until <= s.from || occupied.from >= s.until ? [s] : [{ from:s.from, until:Math.min(s.until,occupied.from) }, { from:Math.max(s.from,occupied.until), until:s.until }].filter(p => p.until > p.from));
    segments.push(...pieces.map((s,i) => ({ ...s, key:`${grant.key}:${i}`, unlimitedLikes: grant.unlimitedLikes })));
  }
  segments.sort((a,b) => a.from-b.from || a.key.localeCompare(b.key));
  let cursor = now;
  for (const s of segments) { if (s.from > cursor) throw new Error("Existing pass dates need support review"); cursor = Math.max(cursor,s.until); }
  return { version:2, initializedAt:now, anchor:now, credits:segments.map(s => ({ key:s.key, milliseconds:s.until-s.from, acceptedAt:now, unlimitedLikes:s.unlimitedLikes })) };
}

/** Link a previously owner-recovered pass to its later confirmed payment without granting it twice. */
export function reconcileSupportCredit(queue: PremiumQueue, sourceKey: string): PremiumQueue {
  return { ...queue, credits: queue.credits.map(c => c.key.startsWith("legacy:support:") ? { ...c, key: `${sourceKey}:recovery:${c.key.slice("legacy:support:".length)}` } : c) };
}
