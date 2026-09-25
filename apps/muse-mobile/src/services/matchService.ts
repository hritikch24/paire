import {
  addDoc,
  collection,
  getDocs,
  getDoc,
  increment,
  orderBy,
  query,
  doc,
  updateDoc,
  where
} from "@firebase/firestore/dist/index.cjs.js";
import { db } from "./firebase";
import { MatchSummary, UserProfile } from "../types/models";

export async function fetchMatches(uid: string) {
  const fetchSnapshot = async () => {
    try {
      const matchesQuery = query(
        collection(db, "matches"),
        where("participants", "array-contains", uid),
        orderBy("updatedAt", "desc")
      );
      return await getDocs(matchesQuery);
    } catch {
      const fallbackQuery = query(
        collection(db, "matches"),
        where("participants", "array-contains", uid)
      );
      return await getDocs(fallbackQuery);
    }
  };

  const snapshot = await fetchSnapshot();
  const matches: MatchSummary[] = snapshot.docs.map(
    (docSnap: { data: () => MatchSummary; id: string }) => {
    const data = docSnap.data() as MatchSummary;
    return { ...data, id: docSnap.id };
    }
  );

  const otherIds = Array.from(
    new Set(
      matches
        .map((match) => match.participants?.find((participantId) => participantId !== uid))
        .filter((id): id is string => Boolean(id))
    )
  );

  const otherProfiles = await Promise.all(
    otherIds.map(async (otherId) => {
      try {
        const profileSnap = await getDoc(doc(db, "users", otherId));
        if (!profileSnap.exists()) return null;
        return { id: otherId, profile: profileSnap.data() as UserProfile };
      } catch {
        return null;
      }
    })
  );

  const profileMap = new Map(
    otherProfiles.filter(Boolean).map((entry) => [entry!.id, entry!.profile])
  );

  return matches
    .filter((match) => match.active !== false)
    .map((match) => {
      const otherUserId = match.participants?.find((participantId) => participantId !== uid);
      const otherUser = otherUserId ? profileMap.get(otherUserId) : undefined;
      return { ...match, otherUserId, otherUser };
    });
}

export async function sendMessage(params: {
  matchId: string;
  senderId: string;
  text: string;
}) {
  const { matchId, senderId, text } = params;
  const messageRef = await addDoc(collection(db, "matches", matchId, "messages"), {
    matchId,
    senderId,
    text,
    createdAt: Date.now(),
    readBy: [senderId]
  });

  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    if (matchSnap.exists()) {
      const match = matchSnap.data() as MatchSummary;
      const updates: Record<string, unknown> = {
        lastMessage: text,
        lastMessageAt: Date.now(),
        updatedAt: Date.now()
      };

      if (Array.isArray(match.participants)) {
        match.participants.forEach((participantId) => {
          if (participantId === senderId) {
            updates[`unreadCounts.${participantId}`] = 0;
          } else {
            updates[`unreadCounts.${participantId}`] = increment(1);
          }
        });
      }

      await updateDoc(matchRef, updates);
    }
  } catch {
    // Message creation should still succeed if match metadata updates fail.
  }

  return messageRef;
}

export async function endMatch(params: { matchId: string; endedBy: string; reason?: string }) {
  const { matchId, endedBy, reason } = params;
  const matchRef = doc(db, "matches", matchId);
  await updateDoc(matchRef, {
    active: false,
    endedAt: Date.now(),
    endedBy,
    endReason: reason ?? "unmatch"
  });
}
