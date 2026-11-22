import { collection, onSnapshot, type Unsubscribe } from "@firebase/firestore/dist/index.cjs.js";
import type { ReportReason } from "../types/models";
import { callFunction, db } from "./firebase";

/** Wedding Nods (browser only). See docs/wedding-nods.md. */
export type WeddingSide = "bride" | "groom";
export const AGE_BAND_LABELS = ["18-24", "25-29", "30-34", "35+"] as const;

/** The member's own spot in a wedding, mirrored by the server under users/{uid}/weddingSpots. */
export type WeddingSpot = {
  weddingId: string;
  label: string;
  date: string;
  closesAt: number;
  nickname: string;
  side: WeddingSide;
  ageBand: string;
  clue: string;
  active: boolean;
  nodsUsed: number;
  nodsTotal: number;
  joinedAt: number;
};

export type WeddingCard = { cardId: string; nickname: string; side: WeddingSide; ageBand: string; clue: string; nodded: boolean };
export type WeddingGuests =
  | { status: "joining"; nodsLeft: number }
  | { status: "ready"; guests: WeddingCard[]; nodsLeft: number }
  | { status: "closed" | "unavailable" };

export type JoinWeddingInput = {
  brideName: string;
  groomName: string;
  date: string;
  pin: string;
  side: WeddingSide;
  clue: string;
  invitePath?: string | null;
};

export const joinWedding = (input: JoinWeddingInput) => callFunction<{ spot: WeddingSpot }>("joinWedding", input);
export const fetchWeddingGuests = (weddingId: string) => callFunction<WeddingGuests>("getWeddingGuests", { weddingId });
export const sendNod = (weddingId: string, cardId: string) => callFunction<{ matched: boolean; matchId: string | null; nodsLeft: number }>("sendNod", { weddingId, cardId });
export const leaveWedding = (weddingId: string) => callFunction<{ ok: boolean }>("leaveWedding", { weddingId });
export const reportWeddingGuest = (weddingId: string, cardId: string, reason: ReportReason, details = "") =>
  callFunction<{ ok: boolean }>("weddingGuestSafety", { weddingId, cardId, action: "report", reason, details });
export const blockWeddingGuest = (weddingId: string, cardId: string) =>
  callFunction<{ ok: boolean }>("weddingGuestSafety", { weddingId, cardId, action: "block" });

/** Live list of the member's own spots (soonest wedding first). */
export function subscribeWeddingSpots(uid: string, onSpots: (spots: WeddingSpot[]) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    collection(db, "users", uid, "weddingSpots"),
    (snap) => onSpots(snap.docs.map((doc) => ({ ...(doc.data() as WeddingSpot), weddingId: doc.id })).sort((a, b) => a.date.localeCompare(b.date))),
    onError
  );
}
