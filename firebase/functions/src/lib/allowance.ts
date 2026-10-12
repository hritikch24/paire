/** Calendar-day limits reset together at midnight UTC, every 24 hours. */
export function nextDailyReset(now = Date.now()): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function remainingAllowance(used: unknown, limit: number): number {
  return Math.max(0, limit - (typeof used === "number" && Number.isFinite(used) ? Math.max(0, used) : 0));
}
