import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
  where
} from "@firebase/firestore/dist/index.cjs.js";
import { DiscoverProfile, Duo, DuoCard, DuoInvite, DuoPendingRequest, DuoSwipeRecord } from "../types/models";
import { toMillis } from "../utils/time";
import { callFunction, db } from "./firebase";
import { appLink } from "./inviteService";

/** Your active Duo, live (null when you're not in one). */
export function subscribeToMyDuo(uid: string, onData: (duo: Duo | null) => void): Unsubscribe {
  const mine = query(
    collection(db, "duos"),
    where("members", "array-contains", uid),
    where("status", "==", "active"),
    limit(1)
  );
  return onSnapshot(
    mine,
    (snapshot) => {
      const snap = snapshot.docs[0];
      const data = snap?.data();
      onData(
        snap && data
          ? { id: snap.id, members: Array.isArray(data.members) ? data.members : [], profiles: data.profiles ?? {} }
          : null
      );
    },
    () => onData(null)
  );
}

/** The invite code you're waiting on a friend to use, if any. */
export function subscribeToMyInvite(uid: string, onData: (invite: DuoInvite | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "private", "duoInvite"),
    (snap) => {
      const data = snap.data();
      const expiresAt = typeof data?.expiresAt === "number" ? data.expiresAt : 0;
      const request = data?.request && typeof data.request.uid === "string" ? data.request : null;
      onData(data && typeof data.code === "string" && expiresAt > Date.now() ? { code: data.code, expiresAt, request } : null);
    },
    () => onData(null)
  );
}

/** A friend's code you entered, while they haven't confirmed yet. */
export function subscribeToMyRequest(uid: string, onData: (request: DuoPendingRequest | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "private", "duoRequest"),
    (snap) => {
      const data = snap.data();
      onData(
        data && typeof data.toName === "string" && (data.expiresAt ?? 0) > Date.now()
          ? { toName: data.toName, toPhotoUrl: data.toPhotoUrl ?? null }
          : null
      );
    },
    () => onData(null)
  );
}

/** Your pair's recent likes and passes, so both friends see what the other did. */
export function subscribeToDuoSwipes(duoId: string, onData: (swipes: DuoSwipeRecord[]) => void): Unsubscribe {
  const recent = query(collection(db, "duoSwipes", duoId, "outgoing"), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(
    recent,
    (snapshot) =>
      onData(
        snapshot.docs.map((snap) => {
          const data = snap.data({ serverTimestamps: "estimate" });
          return {
            targetDuoId: snap.id,
            type: data.type === "like" ? "like" : "nope",
            byUid: String(data.byUid ?? ""),
            target: Array.isArray(data.target) ? data.target : [],
            createdAt: toMillis(data.createdAt)
          };
        })
      ),
    () => onData([])
  );
}

export const createDuoInvite = () => callFunction<DuoInvite>("createDuoInvite", {});
export const cancelDuoInvite = () => callFunction("cancelDuoInvite", {});
/** Enters a friend's code: sends them a request to confirm. */
export const acceptDuoInvite = (code: string) =>
  callFunction<{ pending: boolean; friendName: string }>("acceptDuoInvite", { code });
/** The inviter's answer to the friend who entered their code. */
export const answerDuoRequest = (accept: boolean) => callFunction<{ duoId: string | null }>("answerDuoRequest", { accept });
export const cancelDuoRequest = () => callFunction("cancelDuoRequest", {});
export const leaveDuo = () => callFunction("leaveDuo", {});
export const leaveChat = (matchId: string) => callFunction("leaveChat", { matchId });

export async function fetchDuoFeed(): Promise<DuoCard[]> {
  return (await callFunction<{ duos: DuoCard[] }>("getDuoFeed", {})).duos;
}

export function sendDuoSwipe(targetDuoId: string, type: "like" | "nope") {
  return callFunction<{ matched: boolean; matchId: string | null }>("duoSwipe", { targetDuoId, type });
}

export const undoDuoSwipe = (targetDuoId: string) => callFunction("undoDuoSwipe", { targetDuoId });

/** Profiles of the others in a Duo chat. */
export async function fetchChatProfiles(matchId: string): Promise<DiscoverProfile[]> {
  return (await callFunction<{ profiles: DiscoverProfile[] }>("getChatProfiles", { matchId })).profiles;
}

/** Friend-facing share text for an invite code, with where to get the app. */
export function duoInviteMessage(code: string, myName: string): string {
  const link = appLink();
  return [
    `${myName} wants you as their Duo on Paire: double dates with your bestie 💞`,
    `Open Paire → Discover → Duos, and enter the code ${code} under "Got a code from a friend?"`,
    link ? `Don't have Paire yet? ${link}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
