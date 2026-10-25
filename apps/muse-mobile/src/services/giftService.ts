import { Platform } from "react-native";
import { CheckoutOrder, leaveForHostedCheckout } from "./billingService";
import { callFunction } from "./firebase";

export type GiftPlanId = "day" | "week" | "month";
export type GiftStatus = "pending" | "claimed" | "declined" | "expired" | "refunded" | "void";

/** One gift as the server shows it to the sender or the recipient (listGifts). */
export type GiftView = {
  id: string;
  plan: GiftPlanId;
  status: GiftStatus;
  counterpartName: string;
  createdAt: number;
  expiresAt: number;
  /** Only on a received, claimed gift: when the added Plus ends. */
  endsAt?: number;
};
export type GiftList = { received: GiftView[]; sent: GiftView[] };
export type GiftConfirmation = { status: "paid" | "pending"; giftId: string; refunding?: true };

/**
 * Starts a gift for the person in this match. The server creates the order at
 * the pass's own price and refuses with a plain message (thrown as an error the
 * caller shows) when a gift can't be sent. Hosted checkout only: the page
 * leaves for kraftai.in and comes back to this chat (leaveForHostedCheckout
 * keeps drafts and the chat for the return). Resolves "redirecting" as it goes.
 */
export async function createGift(matchId: string, plan: GiftPlanId): Promise<"redirecting"> {
  if (Platform.OS !== "web") throw new Error("Gifts are available in the browser app for now.");
  const order = await callFunction<CheckoutOrder>("createGiftOrder", { matchId, plan });
  leaveForHostedCheckout(order, matchId);
  return "redirecting";
}

/** After the return from checkout: the server checks the signature and asks Razorpay itself before a gift exists. */
export const confirmGiftPayment = (orderId: string, paymentId: string, signature: string) =>
  callFunction<GiftConfirmation>("confirmGiftPayment", { orderId, paymentId, signature });

export const claimGift = (giftId: string) => callFunction<{ status: "claimed"; endsAt: number }>("claimGift", { giftId });
export const declineGift = (giftId: string) => callFunction<{ status: "declined" }>("declineGift", { giftId });
export const fetchGifts = () => callFunction<GiftList>("listGifts", {});
