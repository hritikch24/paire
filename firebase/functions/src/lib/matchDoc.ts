import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { snippetOf } from "../profiles";
import { DiscoveryEntry, PublicProfile, UserSettings } from "../types";
import { pairId } from "./ids";
import { candidateLatLng, isCandidateForViewer, isVisibleCandidate } from "./prefs";
import { firstMoveOf, sparksOf } from "./sparks";

export type BuildMatchDocArgs = {
  uid: string;
  targetUid: string;
  me?: Partial<PublicProfile>;
  target?: Partial<PublicProfile>;
  superLikedBy: string[];
  /** The note each person sent with their like, when they wrote one. */
  notes: Record<string, string | undefined>;
  /** Who chose "I'll message first". */
  firstMove: Record<string, boolean>;
};

/** The exact match document a mutual like creates. Shared by `swipe` and accepting a like. */
export function buildMatchDoc(args: BuildMatchDocArgs): { id: string; data: Record<string, unknown> } {
  const { uid, targetUid, me, target, superLikedBy, notes, firstMove } = args;
  const id = pairId(uid, targetUid);
  const participants = [uid, targetUid].sort();
  return {
    id,
    data: {
      id,
      participants,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
      profiles: { [uid]: snippetOf(me), [targetUid]: snippetOf(target) },
      lastMessage: null,
      unread: { [participants[0]]: 0, [participants[1]]: 0 },
      lastReadAt: {},
      superLikedBy,
      // The notes sent with each like open the chat, so it never starts empty.
      sparks: sparksOf(notes),
      // "I'll message first": set when exactly one of them chose it.
      firstMoveBy: firstMoveOf(firstMove)
    }
  };
}

/**
 * A stale card or a hand-crafted API request must not bypass current preferences or hiding.
 * Throws the same errors a positive swipe always has.
 */
export function assertLikeEligible(args: {
  mine: DiscoveryEntry;
  theirs: DiscoveryEntry;
  theyLikedMe: boolean;
  mySettings: UserSettings | undefined;
  note: string | null;
}): void {
  const { mine, theirs, theyLikedMe, mySettings, note } = args;
  const eligible = theyLikedMe
    ? isVisibleCandidate(mine, theirs)
    : isCandidateForViewer(mine, theirs, { viewerLocation: candidateLatLng(mine), sharedVibesOnly: mySettings?.sharedVibesOnly === true });
  if (!mine.visible || !eligible) {
    throw new HttpsError("not-found", "That profile is no longer available for matching.");
  }
  // Incognito members can only be liked back, never discovered.
  if (theirs.incognito && !theyLikedMe) {
    throw new HttpsError("not-found", "That profile is no longer available for matching.");
  }
  // "Notes only": a like needs a note, unless it answers their like.
  if (theirs.requireNote && !note && !theyLikedMe) {
    throw new HttpsError("failed-precondition", "They only accept likes with a note. Add one to say why you'd click.");
  }
}
