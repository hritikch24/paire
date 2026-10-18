/**
 * Paire Plus passes: fixed durations that never auto-renew. Display prices only;
 * the store's localised price is shown and charged when billing is live.
 * Product ids stay the same; only store prices change.
 */
export const PREMIUM_PLANS = [
  { id: "day", productId: "muse_premium_day", label: "1 day", days: 1, bonusDays: 0, priceInr: 20, detail: "24 hours", badge: "Try it" },
  { id: "week", productId: "muse_premium_week", label: "1 week", days: 7, bonusDays: 0, priceInr: 99, detail: "7 days", badge: "Popular" },
  { id: "month", productId: "muse_premium_month", label: "1 month", days: 30, bonusDays: 30, priceInr: 299, detail: "30 days", badge: "Best value" }
] as const;
export type PremiumPlanId = (typeof PREMIUM_PLANS)[number]["id"];
export type PremiumPlan = (typeof PREMIUM_PLANS)[number];

/**
 * Web offer: buy 1 month, get 1 month free (`bonusDays`, granted by the server: PLUS_PASSES in
 * firebase/functions/src/lib/razorpay.ts). Store passes in the app keep their own durations.
 */
export const MONTH_OFFER = "Buy 1 month, get 1 month free";

/** How a pass is shown on the web: total days with the offer, the per-day price and the saving against daily passes. */
export function webPlan(plan: PremiumPlan) {
  const days = plan.days + plan.bonusDays;
  const perDay = plan.priceInr / days;
  const daily = PREMIUM_PLANS[0].priceInr;
  return {
    days,
    perDay: dailyPrice(plan.priceInr, days),
    savePercent: Math.round((1 - perDay / daily) * 100),
    label: plan.bonusDays ? `${plan.label} + 1 month free` : plan.label,
    detail: plan.bonusDays ? `${days} days for the price of ${plan.days}` : plan.detail
  };
}

/** Free and Plus daily allowances; mirrors firebase/functions/src/config.ts. */
export const ALLOWANCE = {
  free: { likes: 10, supers: 1 },
  plus: { likes: 100, supers: 5 }
} as const;

export function dailyPrice(priceInr: number, days: number): string {
  return (priceInr / days).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
