import { CheckoutOrder, leaveForHostedCheckout, openCheckout } from "./billingService";
import { callFunction } from "./firebase";
import { Platform } from "react-native";

/**
 * Who may send messages, as the server sees it (getChatAccess). The app only
 * displays this; the Firestore rules enforce it. Mirrors ChatAccessStatus in
 * firebase/functions/src/chatAccess.ts.
 */
export type ChatAccess = {
  /** The sending gate is on right now. */
  enforced: boolean;
  /** An announced start date for the gate, while still in the future. */
  enforceFrom: number | null;
  /** Chats created before this keep sending free until legacyGraceUntil. */
  legacyCutoff: number | null;
  legacyGraceUntil: number | null;
  /** Your own Unlimited Chat or a running Plus pass. */
  canSend: boolean;
  unlimited: boolean;
  premiumUntil: number | null;
  premiumLifetime?: boolean;
  unlock: {
    status: "owned" | "available" | "pending" | "unavailable";
    priceInr: number;
    reason?: "sales-off" | "no-match" | "verification-required" | "account";
    /** How it can be paid right now. */
    methods?: Array<"razorpay" | "upi" | "ccavenue">;
    /** A UPI payment is waiting for Paire to confirm it. */
    upiPending?: boolean;
    /** A CCAvenue payment the bank is still confirming. */
    ccavenuePending?: boolean;
  };
  serverNow: number;
};

/** `reconcile` asks the server to settle an open checkout with Razorpay first ("Check payment status"). */
export const fetchChatAccess = (reconcile = false) => callFunction<ChatAccess>("getChatAccess", reconcile ? { reconcile: true } : {});

type CreateResult = { status: "checkout"; checkout: CheckoutOrder } | { status: "owned" } | { status: "pending" };
type ConfirmResult = { status: "owned" | "pending"; access: ChatAccess };

/**
 * Unlimited Chat on the web. The server creates the ₹49 order for the signed-in
 * account (reusing an open one, never a second charge), Razorpay Checkout takes
 * the payment, and the server confirms it with Razorpay before unlocking. A
 * Checkout success alone never unlocks anything. Throws CheckoutCancelled if
 * the window is closed. With Checkout on kraftai.in, resolves "redirecting"
 * as the page leaves.
 */
export async function purchaseChatUnlock(theme: string, returnToChat?: string, promoCode?: string, expectedAmount?: number): Promise<"owned" | "pending" | "redirecting"> {
  const created = await callFunction<CreateResult>("createChatUnlockOrder", { ...(promoCode ? { promoCode } : {}), ...(expectedAmount !== undefined ? { expectedAmount } : {}) });
  if (created.status !== "checkout") return created.status;
  // Checkout on kraftai.in: the page leaves, and comes back to this chat.
  if (created.checkout.hostedUrl || Platform.OS === "web") {
    leaveForHostedCheckout(created.checkout, returnToChat);
    return "redirecting";
  }
  const result = await openCheckout(created.checkout, theme);
  try {
    const confirmed = await callFunction<ConfirmResult>("confirmChatUnlock", {
      orderId: result.razorpay_order_id,
      paymentId: result.razorpay_payment_id,
      signature: result.razorpay_signature
    });
    return confirmed.status;
  } catch {
    // The money may have moved: never invite a second payment. The signed webhook
    // completes the unlock even if this confirmation didn't get through.
    const access = await fetchChatAccess(true).catch(() => null);
    return access?.unlimited ? "owned" : "pending";
  }
}

/** A UPI order for Unlimited Chat: pay this exact amount to Paire's UPI ID, then submit the UTR. */
export type UpiOrder = {
  orderId: string;
  kind: "chat" | "plus";
  /** "Unlimited Chat" or "Paire Plus · 7 days". */
  product: string;
  status: "awaiting_payment" | "submitted" | "approved" | "rejected" | "expired" | "revoked";
  amountPaise: number;
  amountLabel: string;
  vpa: string;
  payeeName: string;
  upiLink: string;
  qrDataUrl: string;
  expiresAt: number;
  utr: string | null;
};

/** Your open UPI order (the same one each time, so you're never asked to pay twice). With `plan`, a Paire Plus pass. */
export async function startUpiUnlock(plan?: "day" | "week" | "month" | "halfyear" | "lifetime"): Promise<{ status: "owned" } | { status: "order"; order: UpiOrder }> {
  return callFunction("createUpiUnlockOrder", plan ? { plan } : {});
}

/** Your open UPI order of this kind, if any (waiting for payment or for confirmation). */
export async function fetchOpenUpiOrder(kind: "chat" | "plus"): Promise<UpiOrder | null> {
  return (await callFunction<{ order: UpiOrder | null }>("getUpiUnlockOrder", { kind })).order;
}

/** "I've paid" (the UTR is optional). Nothing unlocks until Paire confirms the payment arrived. */
export async function submitUpiReference(orderId: string, utr: string): Promise<UpiOrder> {
  return (await callFunction<{ order: UpiOrder }>("submitUpiPayment", { orderId, utr })).order;
}

export type UpiReviewItem = { orderId: string; product: string; status: string; amountLabel: string; utr: string | null; memberName: string; submittedAt: number | null; createdAt: number };
export const fetchUpiReviewQueue = async () => (await callFunction<{ items: UpiReviewItem[] }>("getUpiReviewQueue")).items;
export const reviewUpiPayment = (orderId: string, decision: "approve" | "reject" | "revoke", note?: string) =>
  callFunction<{ status: string }>("reviewUpiPayment", { orderId, decision, note });
