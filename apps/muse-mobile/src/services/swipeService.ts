import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "./firebase";
import { SwipeType } from "../types/models";

export async function recordSwipe(params: {
  fromUid: string;
  toUid: string;
  type: SwipeType;
}) {
  const { fromUid, toUid, type } = params;
  const now = Date.now();
  await setDoc(doc(db, "swipes", fromUid, "outgoing", toUid), {
    fromUid,
    toUid,
    type,
    createdAt: now
  });

  if (type === "nope") return;

  const matchId = [fromUid, toUid].sort().join("_");
  const matchRef = doc(db, "matches", matchId);
  try {
    await setDoc(matchRef, {
      id: matchId,
      participants: [fromUid, toUid],
      createdAt: now,
      updatedAt: now,
      unreadCounts: {
        [fromUid]: 0,
        [toUid]: 0
      }
    });
  } catch {
    // Match creation is best-effort; Firestore rules enforce mutual swipe.
  }
}
