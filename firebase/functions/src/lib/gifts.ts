import { passDays, PLUS_PASSES } from "./razorpay";

/**
 * Gift a Plus pass to a match. Pure rules and the plan table only; payments live elsewhere.
 * Prices and days come from the existing pass table (nothing is retyped here), and only
 * the day, week and month passes can be gifted.
 */
export const GIFT_PLAN_IDS = ["day", "week", "month"] as const;
export type GiftPlan = (typeof GIFT_PLAN_IDS)[number];

/** A gift nobody has claimed or declined after this long expires and is refunded. */
export const GIFT_PENDING_MS = 7 * 86_400_000;
/** Gifts one member can send per day. */
export const GIFTS_PER_DAY = 3;

export function isGiftPlan(value: unknown): value is GiftPlan {
  return typeof value === "string" && (GIFT_PLAN_IDS as readonly string[]).includes(value);
}

/** What the gifter pays, in paise: exactly the pass's existing price. */
export const giftAmountPaise = (plan: GiftPlan): number => PLUS_PASSES[plan].amountPaise;

/** How long the gift runs once claimed: as long as buying the pass (month = 60 days). */
export const giftDays = (plan: GiftPlan): number => passDays(plan);

export type GiftDenied = "no-match" | "blocked" | "unavailable" | "limit" | "already-lifetime";

export function canGift(args: {
  fromUid: string;
  toUid: string;
  match: { active: boolean; participants: string[] } | undefined;
  blocked: boolean;
  recipientBanned: boolean;
  recipientVerified: boolean;
  recipientExists: boolean;
  sentToday: number;
  recipientLifetime: boolean;
}): { ok: true } | { ok: false; reason: GiftDenied } {
  const { fromUid, toUid, match } = args;
  if (
    !match ||
    !match.active ||
    fromUid === toUid ||
    !match.participants.includes(fromUid) ||
    !match.participants.includes(toUid)
  ) {
    return { ok: false, reason: "no-match" };
  }
  if (args.blocked) return { ok: false, reason: "blocked" };
  if (!args.recipientExists || args.recipientBanned || !args.recipientVerified) return { ok: false, reason: "unavailable" };
  if (args.sentToday >= GIFTS_PER_DAY) return { ok: false, reason: "limit" };
  if (args.recipientLifetime) return { ok: false, reason: "already-lifetime" };
  return { ok: true };
}

export type GiftStateName = "pending" | "claimed" | "declined" | "expired" | "refunded" | "void";

/** The gift as members see it: a pending gift past its deadline reads as expired. */
export function giftState(gift: { status: string; expiresAt: number }, now: number): GiftStateName {
  switch (gift.status) {
    case "pending":
      return now >= gift.expiresAt ? "expired" : "pending";
    case "claimed":
    case "declined":
    case "expired":
    case "refunded":
      return gift.status;
    default:
      return "void";
  }
}
