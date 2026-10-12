const DAY_MS = 24 * 60 * 60 * 1000;

/** Share of overlap between two tag lists, 0..1. */
export function overlapScore(current: string[] = [], candidate: string[] = []): number {
  if (!current.length || !candidate.length) return 0;
  const currentSet = new Set(current);
  const overlap = candidate.filter((item) => currentSet.has(item)).length;
  return overlap / Math.max(currentSet.size, candidate.length);
}

/** 1 for someone active right now, falling to 0 after a week. */
export function recencyScore(lastActiveAt: number, now = Date.now()): number {
  if (!lastActiveAt) return 0;
  const age = Math.max(0, now - lastActiveAt);
  return Math.max(0, 1 - age / (7 * DAY_MS));
}

/** 1 when very close, falling to 0 at 100 km. Unknown distance scores neutral-low. */
export function proximityScore(km: number | null): number {
  if (km === null) return 0.2;
  return Math.max(0, 1 - km / 100);
}
