/** Deterministic match id shared by both people: the two uids sorted and joined. */
export function pairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

/** UTC day key used for daily limits, e.g. 20260926. */
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, "");
}
