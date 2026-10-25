import { createHash } from "crypto";
import { giftAmountPaise, GiftPlan } from "./gifts";
import { RazorpayMode } from "./chatAccess";

/**
 * Pure parts of gift payments (giftPayments.ts). A gift is a Paire Plus pass
 * bought for a match, sold through Razorpay as its own product: its orders
 * never share a collection, a receipt prefix or a product id with Plus.
 */

/** Public product identifier sent to Razorpay (kraftai.in accepts it for day, week and month). */
export const GIFT_PRODUCT = "gift_plan";

/** An open, unpaid gift checkout is reopened (not replaced) for this long. */
export const GIFT_CHECKOUT_REUSE_MS = 6 * 3600_000;

/** The Razorpay order for a gift: the existing pass price, and nothing about who is involved. */
export function giftOrderBody(plan: GiftPlan, now: number): { amount: number; currency: "INR"; receipt: string; notes: { plan: GiftPlan; product: typeof GIFT_PRODUCT } } {
  return { amount: giftAmountPaise(plan), currency: "INR", receipt: `gift_plan_${plan}_${now}`, notes: { plan, product: GIFT_PRODUCT } };
}

/** Match ids are pairIds of two uids; anything else is refused before it reaches a document path. */
export function isMatchId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,200}$/.test(value);
}

/** One open checkout per sender, match and plan (giftCheckout/{key}). */
export function giftCheckoutKey(fromUid: string, matchId: string, plan: GiftPlan): string {
  return createHash("sha256").update(`${fromUid}|${matchId}|${plan}`).digest("hex").slice(0, 40);
}

/** Start of the UTC day, the same day boundary as the daily quotas (lib/ids dayKey). */
export function giftDayStart(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * What a captured payment may do, decided again at capture time. An
 * ineligible recipient (deleted, banned, unmatched, blocked) orphans it; test
 * money never reaches a real account outside the emulator (as for Plus and
 * Unlimited Chat: only test-cohort accounts); either way it is refunded.
 */
export function giftCaptureVerdict(args: {
  fromUid: string;
  toUid: string;
  match: { active: boolean; participants: string[] } | undefined;
  blocked: boolean;
  recipientExists: boolean;
  recipientBanned: boolean;
  mode: RazorpayMode | null;
  emulator: boolean;
  senderCohort: unknown;
  recipientCohort: unknown;
}): "grant" | "orphaned" | "rejected" {
  const { match } = args;
  if (!match || !match.active || !match.participants.includes(args.fromUid) || !match.participants.includes(args.toUid)
    || args.blocked || !args.recipientExists || args.recipientBanned) return "orphaned";
  if (args.mode === "live" || args.emulator) return "grant";
  if (args.mode === "test" && args.senderCohort === "test" && args.recipientCohort === "test") return "grant";
  return "rejected";
}

/**
 * The recipient's push. Names the gifter only when the recipient opted into
 * previews; sendPushToUser applies notificationCopy on top, which keeps every
 * alert generic for members without previews.
 */
export function giftPushCopy(previews: unknown, senderName: unknown): { title: string; body: string } {
  if (previews === true && typeof senderName === "string" && senderName.trim()) {
    return { title: "You've got a gift 🎁", body: `${senderName.trim()} sent you Paire Plus. Open Paire to see it.` };
  }
  return { title: "Paire", body: "Someone sent you a gift." };
}
