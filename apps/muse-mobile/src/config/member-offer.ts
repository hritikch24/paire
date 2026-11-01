import { OFFER_PRICES } from "./launch-offer";

/** Shared by the browser, Paire server and hosted checkout. Amounts are paise. */
export const MEMBER_OFFER = {
  campaign: "member-growth-v1", startsAt: Date.parse("2026-11-01T00:00:00+05:30"),
  durationMs: 7 * 86400000, discounts: [30, 40, 50], plans: ["month", "lifetime"]
} as const;
export type MemberDiscount = 30 | 40 | 50;
export type MemberPlan = "month" | "lifetime";
export type MemberOffer = { id: string; discountPercent: MemberDiscount; startsAt: number; expiresAt: number; reason: string; city: string | null; interest: string | null };
export const isMemberPlan = (id: string): id is MemberPlan => id === "month" || id === "lifetime";
export const memberPrice = (plan: MemberPlan, discount: MemberDiscount) => Math.round(OFFER_PRICES[plan].regular * (100 - discount) / 100);
export function engagementDiscount(likes: number, supers: number, activeDays: number, freeLikes = 10, freeSupers = 1): { percent: MemberDiscount; reason: string } {
  if (likes >= freeLikes && supers >= freeSupers) return { percent: 50, reason: "both-limits" };
  if (likes >= freeLikes || supers >= freeSupers) return { percent: 40, reason: "daily-limit" };
  if (activeDays >= 3) return { percent: 40, reason: "regular-use" };
  return { percent: 30, reason: "welcome" };
}
const HOBBIES = new Set(["music", "movies", "travel", "reading", "books", "coffee", "chai", "food", "cooking", "photography", "art", "gaming", "hiking", "sports", "dance", "dancing", "pets", "gardening", "writing", "comedy"]);
export function memberContext(city: unknown, interests: unknown): { city: string | null; interest: string | null } {
  const place = typeof city === "string" && city.trim().length <= 60 && !/[\n\r<>]|https?:/i.test(city) ? city.trim() : "";
  const hobby = Array.isArray(interests) ? interests.find(value => typeof value === "string" && HOBBIES.has(value.trim().toLowerCase())) : null;
  return { city: place || null, interest: typeof hobby === "string" ? hobby.trim().toLowerCase() : null };
}
export function validMemberQuote(plan: string, amount: number, notes: Record<string, unknown>, createdAt: unknown): boolean {
  const percent = Number(notes.discountPercent), start = Number(notes.offerStartedAt), end = Number(notes.offerExpiresAt);
  return isMemberPlan(plan) && notes.campaign === MEMBER_OFFER.campaign && notes.pricing === "member_offer" &&
    typeof notes.offerId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notes.offerId) &&
    (MEMBER_OFFER.discounts as readonly number[]).includes(percent) && amount === memberPrice(plan, percent as MemberDiscount) &&
    Number.isSafeInteger(start) && start >= MEMBER_OFFER.startsAt && Number.isSafeInteger(end) && end - start === MEMBER_OFFER.durationMs &&
    typeof createdAt === "number" && Number.isSafeInteger(createdAt) && createdAt * 1000 >= Math.floor(start / 1000) * 1000 && createdAt * 1000 < end;
}
