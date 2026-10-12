import {
  collection,
  doc,
  DocumentData,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where
} from "@firebase/firestore/dist/index.cjs.js";
import { Match } from "../types/models";
import { toMillis } from "../utils/time";
import { db } from "./firebase";

export function normalizeMatch(id: string, data: DocumentData): Match {
  const lastReadAt = (data.lastReadAt ?? {}) as Record<string, unknown>;
  return {
    id,
    kind: data.kind === "duo" ? "duo" : "pair",
    sides: data.kind === "duo" && data.sides && typeof data.sides === "object" ? data.sides : {},
    participants: Array.isArray(data.participants) ? data.participants : [],
    active: data.active !== false,
    createdAt: toMillis(data.createdAt),
    lastActivityAt: toMillis(data.lastActivityAt),
    profiles: data.profiles ?? {},
    lastMessage: data.lastMessage
      ? {
          text: String(data.lastMessage.text ?? ""),
          senderId: String(data.lastMessage.senderId ?? ""),
          createdAt: toMillis(data.lastMessage.createdAt)
        }
      : null,
    unread: data.unread ?? {},
    lastReadAt: Object.fromEntries(
      Object.entries(lastReadAt).map(([uid, value]) => [uid, toMillis(value, 0)])
    ),
    superLikedBy: Array.isArray(data.superLikedBy) ? data.superLikedBy : [],
    sparks:
      data.sparks && typeof data.sparks === "object"
        ? Object.fromEntries(
            Object.entries(data.sparks as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {},
    firstMoveBy: typeof data.firstMoveBy === "string" ? data.firstMoveBy : null,
    endReason: data.endReason
  };
}

export function otherParticipant(match: Match, uid: string): string {
  return match.participants.find((participant) => participant !== uid) ?? "";
}

/** Everyone in the chat but you. */
export function otherParticipants(match: Match, uid: string): string[] {
  return match.participants.filter((participant) => participant !== uid);
}

/** In a Duo chat: the other pair's members still in the chat. */
export function otherSide(match: Match, uid: string): string[] {
  const theirs = Object.values(match.sides).find((members) => !members.includes(uid));
  return theirs ?? otherParticipants(match, uid);
}

/** In a Duo chat: your friend, if they're still in it. */
export function partnerIn(match: Match, uid: string): string | null {
  const mine = Object.values(match.sides).find((members) => members.includes(uid));
  return mine?.find((member) => member !== uid) ?? null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What a chat is called in lists and headers: their name, or "Arjun & Kabir" for a Duo chat. */
export function chatTitle(match: Match, uid: string): string {
  if (match.kind !== "duo") return match.profiles[otherParticipant(match, uid)]?.displayName ?? "Your match";
  const names = otherSide(match, uid).map((member) => firstName(match.profiles[member]?.displayName ?? "Paire member"));
  return names.length ? names.join(" & ") : "Duo chat";
}

/** Live list of your active matches, most recent activity first. */
export function subscribeToMatches(
  uid: string,
  onData: (matches: Match[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const matchesQuery = query(
    collection(db, "matches"),
    where("participants", "array-contains", uid),
    where("active", "==", true),
    orderBy("lastActivityAt", "desc"),
    limit(200)
  );
  return onSnapshot(
    matchesQuery,
    (snapshot) =>
      onData(
        snapshot.docs.map((snap) => normalizeMatch(snap.id, snap.data({ serverTimestamps: "estimate" })))
      ),
    onError
  );
}

export function subscribeToMatch(
  matchId: string,
  onData: (match: Match | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "matches", matchId),
    (snapshot) =>
      onData(
        snapshot.exists()
          ? normalizeMatch(snapshot.id, snapshot.data({ serverTimestamps: "estimate" }))
          : null
      ),
    onError
  );
}

export async function unmatch(matchId: string, uid: string) {
  await updateDoc(doc(db, "matches", matchId), {
    active: false,
    endedAt: serverTimestamp(),
    endedBy: uid,
    endReason: "unmatch"
  });
}

/**
 * "I'll message first": while nobody has written yet, the member waiting for the
 * other to open. Returns the uid of whoever must go first, or null when anyone may.
 */
export function waitingForFirstMove(match: Match, uid: string): string | null {
  if (match.kind === "duo" || match.lastMessage || !match.firstMoveBy || match.firstMoveBy === uid) return null;
  return match.firstMoveBy;
}

/** Clears your unread badge and lets the other person see "Seen". */
export async function markMatchRead(matchId: string, uid: string) {
  await updateDoc(doc(db, "matches", matchId), {
    [`unread.${uid}`]: 0,
    [`lastReadAt.${uid}`]: serverTimestamp()
  });
}
