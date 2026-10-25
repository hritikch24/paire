/**
 * Pure rules for a gift after payment (giftLifecycle.ts): when a claimed gift
 * starts and ends, whether a refund may take it back, and what the daily sweep
 * does with a gift nobody claimed. No I/O here.
 */

import { GIFT_REFUND_CLAIM_MS } from "./giftPayments";

const DAY_MS = 86_400_000;
/** A refund call claimed by one worker is left alone by the others for this long. */
export const REFUND_CLAIM_MS = GIFT_REFUND_CLAIM_MS;

const finite = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * The claimed gift starts when the recipient's current access ends (a paid
 * pass, a store pass or an earlier complimentary grant), or now, and runs its days.
 * Nothing already bought is shortened or overlapped.
 */
export function giftWindow(args: { now: number; billingExpiresAt: number; complimentaryExpiresAt: number; days: number }): { startsAt: number; endsAt: number } {
  const startsAt = Math.max(args.now, finite(args.billingExpiresAt), finite(args.complimentaryExpiresAt));
  return { startsAt, endsAt: startsAt + args.days * DAY_MS };
}

/**
 * A gift as the reversal sees it: the gift's id and status (gifts/{id}) plus the
 * server-only bookkeeping kept on giftOrders/{id} (never shown to either member).
 */
type GiftRecord = {
  id?: unknown;
  status?: unknown;
  endsAt?: unknown;
  needsReview?: unknown;
  previousCompExpiry?: unknown;
  previousCompStatus?: unknown;
  previousCompLastGiftId?: unknown;
};
type CompRecord = { expiresAt?: unknown; status?: unknown; lastGiftId?: unknown } | undefined;

/**
 * The revoke condition: a claimed gift may be taken back only while the
 * complimentary grant is still active, still ends exactly where this gift put it,
 * and was last set by this gift. If the owner or another gift has changed it
 * since, a person has to decide.
 */
export function shouldRevokeGift(gift: GiftRecord, comp: CompRecord): boolean {
  return gift.status === "claimed" && typeof gift.id === "string" && typeof gift.endsAt === "number" && Number.isFinite(gift.endsAt)
    && comp?.status === "active" && comp.lastGiftId === gift.id && comp.expiresAt === gift.endsAt;
}

export type GiftReversal =
  | { action: "refund-pending" }
  | { action: "close" }
  | { action: "none" }
  | { action: "restore"; expiresAt: number; status: string; lastGiftId: string | null }
  | { action: "review" };

/**
 * What a refund or a lost dispute does to a gift. Never claimed: it is refunded.
 * Declined, expired or void: that was our own refund, so it only closes. Claimed and
 * unchanged since: the previous complimentary expiry comes back (never later than
 * now's). Claimed and changed since, or anything unknown: flagged for review.
 */
export function giftReversal(gift: GiftRecord, comp: CompRecord): GiftReversal {
  switch (gift.status) {
    case "pending":
      return { action: "refund-pending" };
    case "declined":
    case "expired":
    case "void":
      return { action: "close" };
    case "refunded":
      return { action: "none" };
    case "claimed":
      if (gift.needsReview === true) return { action: "none" };
      if (!shouldRevokeGift(gift, comp)) return { action: "review" };
      return {
        action: "restore",
        expiresAt: Math.min(finite(gift.previousCompExpiry), finite(comp?.expiresAt)),
        status: typeof gift.previousCompStatus === "string" ? gift.previousCompStatus : "ended",
        lastGiftId: typeof gift.previousCompLastGiftId === "string" ? gift.previousCompLastGiftId : null
      };
    default:
      return { action: "review" };
  }
}

export type GiftClaimVerdict = "ok" | "not-found" | "not-recipient" | "already-claimed" | "closed" | "expired" | "no-match" | "unavailable" | "lifetime";

/** Who may claim, and when. Expired, no-match, unavailable and lifetime also void the gift and refund it. */
export function giftClaimVerdict(args: {
  exists: boolean;
  callerUid: string;
  gift: { fromUid?: unknown; toUid?: unknown; status?: unknown; expiresAt?: unknown };
  match: { active: boolean; participants: string[] } | undefined;
  recipientBanned: boolean;
  lifetime: boolean;
  now: number;
}): GiftClaimVerdict {
  const { gift, match } = args;
  if (!args.exists) return "not-found";
  if (gift.toUid !== args.callerUid) return "not-recipient";
  if (gift.status === "claimed") return "already-claimed";
  if (gift.status !== "pending") return "closed";
  if (args.now >= finite(gift.expiresAt)) return "expired";
  if (!match || !match.active || !match.participants.includes(String(gift.fromUid)) || !match.participants.includes(args.callerUid)) return "no-match";
  if (args.recipientBanned) return "unavailable";
  if (args.lifetime) return "lifetime";
  return "ok";
}

/** The daily sweep: an overdue pending gift expires; one that can no longer be delivered is void. */
export function giftSweepVerdict(args: { status: unknown; expiresAt: unknown; now: number; matchActive: boolean; recipientExists: boolean; recipientBanned: boolean }): "keep" | "expire" | "void" {
  if (args.status !== "pending") return "keep";
  if (args.now >= finite(args.expiresAt)) return "expire";
  if (!args.matchActive || !args.recipientExists || args.recipientBanned) return "void";
  return "keep";
}

export function firstName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const first = name.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

/**
 * The gifter's alert when the gift is accepted. Names the recipient (first name
 * only) only for a gifter who opted into previews; sendPushToUser applies
 * notificationCopy on top, which keeps every alert generic without previews.
 */
export function giftAcceptedPushCopy(previews: unknown, recipientName: unknown): { title: string; body: string } {
  const name = firstName(recipientName);
  if (previews === true && name) return { title: "Gift accepted 🎁", body: `${name} accepted your gift.` };
  return { title: "Paire", body: "Your gift was accepted." };
}
