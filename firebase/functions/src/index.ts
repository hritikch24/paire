import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

const db = getFirestore();

function createMatchId(uidA: string, uidB: string) {
  const [first, second] = [uidA, uidB].sort();
  return `${first}_${second}`;
}

export const onSwipeCreated = onDocumentCreated("swipes/{uid}/outgoing/{targetUid}", async (event) => {
  const { uid, targetUid } = event.params;
  const swipe = event.data?.data() as { type?: string } | undefined;
  if (!swipe?.type) return;

  const now = Date.now();
  const dateKey = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const limitRef = db.doc(`limits/${uid}/daily/${dateKey}`);
  const swipeRef = db.doc(`swipes/${uid}/outgoing/${targetUid}`);

  await db.runTransaction(async (tx) => {
    const limitSnap = await tx.get(limitRef);
    const data = limitSnap.data() as { likes?: number; nopes?: number; supers?: number } | undefined;
    const likes = data?.likes ?? 0;
    const nopes = data?.nopes ?? 0;
    const supers = data?.supers ?? 0;

    if (swipe.type === "super" && supers >= 1) {
      tx.delete(swipeRef);
      return;
    }
    if (swipe.type === "like" && likes >= 100) {
      tx.delete(swipeRef);
      return;
    }
    if (swipe.type === "nope" && nopes >= 200) {
      tx.delete(swipeRef);
      return;
    }

    tx.set(
      limitRef,
      {
        likes: swipe.type === "like" ? likes + 1 : likes,
        nopes: swipe.type === "nope" ? nopes + 1 : nopes,
        supers: swipe.type === "super" ? supers + 1 : supers,
        updatedAt: now
      },
      { merge: true }
    );
  });

  if (swipe.type === "nope") return;

  const reciprocalRef = db.doc(`swipes/${targetUid}/outgoing/${uid}`);
  const reciprocalSnap = await reciprocalRef.get();
  const reciprocal = reciprocalSnap.data() as { type?: string } | undefined;
  if (!reciprocal?.type || reciprocal.type === "nope") return;

  const matchId = createMatchId(uid, targetUid);
  const matchRef = db.doc(`matches/${matchId}`);

  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (matchSnap.exists) return;
    tx.set(matchRef, {
      id: matchId,
      participants: [uid, targetUid],
      createdAt: now,
      updatedAt: now,
      unreadCounts: {
        [uid]: 0,
        [targetUid]: 0
      }
    });
  });
});

export const onMessageCreated = onDocumentCreated(
  "matches/{matchId}/messages/{messageId}",
  async (event) => {
    const { matchId } = event.params;
    const message = event.data?.data() as { text?: string; senderId?: string } | undefined;
    if (!message?.senderId) return;

    const matchRef = db.doc(`matches/${matchId}`);
    const matchSnap = await matchRef.get();
    const match = matchSnap.data() as { participants?: string[]; unreadCounts?: Record<string, number> } | undefined;
    const participants = match?.participants ?? [];

    const unreadCounts: Record<string, number> = { ...(match?.unreadCounts ?? {}) };
    participants.forEach((uid) => {
      if (uid !== message.senderId) {
        unreadCounts[uid] = (unreadCounts[uid] ?? 0) + 1;
      }
    });

    await matchRef.set(
      {
        lastMessage: message.text ?? "",
        lastMessageAt: Date.now(),
        updatedAt: Date.now(),
        unreadCounts
      },
      { merge: true }
    );
  }
);
