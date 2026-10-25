import { WEB_PREMIUM_PLANS, webPlan } from "../config/premium";
import type { GiftPlanId, GiftStatus } from "../services/giftService";

/** The three gift sizes are the existing Plus passes, with their existing prices and labels. */
export const GIFT_PLANS = WEB_PREMIUM_PLANS.filter((plan) => plan.id === "day" || plan.id === "week" || plan.id === "month");

export const giftPlanLabel = (plan: GiftPlanId) => {
  const found = GIFT_PLANS.find((candidate) => candidate.id === plan);
  return found ? webPlan(found).label : plan;
};

/** Plain words for where a gift stands, from the point of view of whoever is reading. */
export function giftStatusWord(status: GiftStatus, side: "sent" | "received"): string {
  if (side === "sent") {
    return { pending: "Waiting for a reply", claimed: "Accepted", declined: "Declined, refunded to you", expired: "Not opened in time, refunded to you", refunded: "Refunded", void: "Couldn't be delivered, refunded to you" }[status];
  }
  return { pending: "Waiting for you", claimed: "Added to your Plus", declined: "You said no thanks", expired: "Expired", refunded: "Taken back", void: "Couldn't be delivered" }[status];
}

export const formatGiftDate = (millis: number) => new Date(millis).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
