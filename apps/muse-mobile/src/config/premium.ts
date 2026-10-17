/**
 * Paire Plus passes: fixed durations that never auto-renew. Display prices only;
 * the store's localised price is shown and charged when billing is live.
 * Product ids stay the same; only store prices change.
 */
export const PREMIUM_PLANS = [
  { id: "day", productId: "muse_premium_day", label: "1 day", days: 1, priceInr: 20, detail: "24 hours", badge: "Try it" },
  { id: "week", productId: "muse_premium_week", label: "1 week", days: 7, priceInr: 99, detail: "7 days", badge: "Popular" },
  { id: "month", productId: "muse_premium_month", label: "1 month", days: 30, priceInr: 299, detail: "30 days", badge: "Best value" }
] as const;
export type PremiumPlanId = (typeof PREMIUM_PLANS)[number]["id"];

/** Free and Plus daily allowances; mirrors firebase/functions/src/config.ts. */
export const ALLOWANCE = {
  free: { likes: 10, supers: 1 },
  plus: { likes: 100, supers: 5 }
} as const;

export function dailyPrice(priceInr: number, days: number): string {
  return (priceInr / days).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
