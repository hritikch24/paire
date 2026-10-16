import type { ChatAccess } from "../services/chatAccessService";

/**
 * Whether the composer should show the access options instead of sending.
 * Mirrors maySend() in firestore.rules, which is what actually decides. While
 * access is unknown (loading, offline) nothing is locked here; a refused send
 * then shows the options.
 */
export function sendLocked(access: ChatAccess | undefined, chatCreatedAt: number, now = Date.now()): boolean {
  if (!access?.enforced) return false;
  if (access.unlimited || (access.premiumUntil ?? 0) > now) return false;
  const grace = access.legacyCutoff !== null && access.legacyGraceUntil !== null && chatCreatedAt > 0 && chatCreatedAt < access.legacyCutoff && now < access.legacyGraceUntil;
  return !grace;
}

/** Composed messages survive checkout, cancellation and leaving the chat (for this app session). */
const drafts = new Map<string, string>();
export const draftFor = (matchId: string) => drafts.get(matchId) ?? "";
export function saveDraft(matchId: string, text: string) {
  if (text) drafts.set(matchId, text);
  else drafts.delete(matchId);
}
