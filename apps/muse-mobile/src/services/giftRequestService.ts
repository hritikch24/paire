import { callFunction } from "./firebase";
import type { GiftPlanId } from "./giftService";
export type GiftRequest = { id: string; version: string; fromUid: string; toUid: string; plan: GiftPlanId; status: "pending" | "declined" | "withdrawn" | "expired"; createdAt: number; expiresAt: number };
export const fetchGiftRequests = (matchId: string) => callFunction<{ enabled: boolean; requests: GiftRequest[] }>("getPlusGiftRequests", { matchId });
export const requestPlusGift = (matchId: string, plan: GiftPlanId) => callFunction<GiftRequest>("requestPlusGift", { matchId, plan });
export const closeGiftRequest = (request: GiftRequest, action: "decline" | "withdraw") => callFunction("closePlusGiftRequest", { id: request.id, version: request.version, action });
