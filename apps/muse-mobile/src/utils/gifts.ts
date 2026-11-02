import { WEB_PREMIUM_PLANS, webPlan } from "../config/premium";
import type { GiftPlanId, GiftStatus } from "../services/giftService";

/** The three gift sizes are the existing Plus passes, with their existing prices and labels. */
export const GIFT_PLANS = WEB_PREMIUM_PLANS.filter((plan) => plan.id === "day" || plan.id === "week" || plan.id === "month");

export const giftPlanLabel = (plan: GiftPlanId) => {
  const found = GIFT_PLANS.find((candidate) => candidate.id === plan);
  return found ? webPlan(found).label : plan;
};

/** Plain words for where a gift stands, from the point of view of whoever is reading. */
export function giftStatusWord(status: GiftStatus, side: "sent" | "received", refundStatus?: string): string {
  if (side === "sent") {
    if (["declined", "expired", "void", "refunded"].includes(status)) {
      if (refundStatus === "needs_review") return "Refund needs help · contact support";
      if (refundStatus === "chargeback") return "Payment reversed";
      if (refundStatus === "processed") return "Refund processed · check your payment account";
      if (refundStatus === "submitted") return "Refund requested · bank processing";
      if (refundStatus === "pending") return "Refund pending · we will retry";
    }
    return { pending: "Waiting for a reply", claimed: "Accepted", declined: "Declined · refund due or in progress", expired: "Expired · refund due or in progress", refunded: "Refund sent to the payment method", void: "Not delivered · refund due or in progress" }[status];
  }
  return { pending: "Waiting for you", claimed: "Added to your Plus", declined: "You said no thanks", expired: "Expired", refunded: "Taken back", void: "Couldn't be delivered" }[status];
}

export const formatGiftDate = (millis: number) => new Date(millis).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
