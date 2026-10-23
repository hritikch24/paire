export type BillingSnapshot = { expiresAt?: unknown; checkedAt?: unknown; lifetime?: unknown; unlimitedLikesUntil?: unknown };
export type WebBenefits = { expiresAt: number; lifetime: boolean; unlimitedLikesUntil: number };
type RecordData = Record<string, unknown>;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const started = (record: RecordData, now: number) => finite(record.startsAt) <= now;

/** Server-owned payment/grant records only. Lifetime is explicit, never a distant expiry. */
export function summarizeWebBenefits(orders: RecordData[], support: RecordData | undefined, gift: RecordData | undefined, lifetimeGrant: RecordData | undefined, now: number): WebBenefits {
  const paid = orders.filter(order => order.status === (order.paymentSource === "upi" ? "approved" : "paid"));
  const timed = [...paid, ...(support?.status === "active" && started(support, now) ? [support] : []), ...(gift?.status === "active" ? [gift] : [])];
  const expiresAt = timed.reduce((until, item) => Math.max(until, finite(item.expiresAt)), 0);
  const lifetime = Boolean(lifetimeGrant?.status === "active" && started(lifetimeGrant, now)) || paid.some(order => order.plan === "lifetime" && started(order, now));
  // Older owner recoveries may predate the plan field: follow their covered order IDs.
  const recoveredMonth = support?.status === "active" && (support.plan === "month" || orders.some(order => order.plan === "month" && Array.isArray(support.coveredOrderIds) && support.coveredOrderIds.includes(order.id)));
  const monthly = [...paid.filter(order => order.plan === "month"), ...(recoveredMonth ? [support!] : [])];
  const unlimitedLikesUntil = monthly.filter(item => started(item, now)).reduce((until, item) => Math.max(until, finite(item.expiresAt)), 0);
  return { expiresAt: expiresAt > now ? expiresAt : 0, lifetime, unlimitedLikesUntil: unlimitedLikesUntil > now ? unlimitedLikesUntil : 0 };
}
