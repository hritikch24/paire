const PREFIX = "paire.plusOfferDismissed.";
/** Dismissals this session, so closing a card works even when storage is off. */
const memory = new Set<string>();

/** Whether she already closed the Plus offer for this match. Never throws. */
export function offerDismissed(matchId: string): boolean {
  if (memory.has(matchId)) return true;
  try {
    return localStorage.getItem(PREFIX + matchId) === "1";
  } catch {
    // No storage (private window, blocked site data): it shows again next visit.
    return false;
  }
}

/** Remembers, in this browser, that she closed the offer for this match. */
export function dismissOffer(matchId: string): void {
  memory.add(matchId);
  try {
    localStorage.setItem(PREFIX + matchId, "1");
  } catch {
    // Remembered for this session only.
  }
}

/** For tests: forgets this session's dismissals. */
export function resetOfferMemory(): void {
  memory.clear();
}
