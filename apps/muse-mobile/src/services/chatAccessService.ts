import { CheckoutOrder, openCheckout } from "./billingService";
import { callFunction } from "./firebase";

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
  unlock: {
    status: "owned" | "available" | "pending" | "unavailable";
    priceInr: number;
    reason?: "sales-off" | "no-match" | "verification-required" | "account";
    /** How it can be paid right now. */
    methods?: Array<"razorpay" | "upi">;
    /** A UPI payment is waiting for Paire to confirm it. */
    upiPending?: boolean;
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
 * the window is closed.
 */
export async function purchaseChatUnlock(theme: string): Promise<"owned" | "pending"> {
  const created = await callFunction<CreateResult>("createChatUnlockOrder");
  if (created.status !== "checkout") return created.status;
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

/** Your open UPI order (the same one each time, so you're never asked to pay twice). */
export async function startUpiUnlock(): Promise<{ status: "owned" } | { status: "order"; order: UpiOrder }> {
  return callFunction("createUpiUnlockOrder");
}

/** Chat unlocks only after Paire confirms the payment arrived with this reference. */
export async function submitUpiReference(orderId: string, utr: string): Promise<UpiOrder> {
  return (await callFunction<{ order: UpiOrder }>("submitUpiPayment", { orderId, utr })).order;
}

export type UpiReviewItem = { orderId: string; status: string; amountLabel: string; utr: string | null; memberName: string; submittedAt: number | null; createdAt: number };
export const fetchUpiReviewQueue = async () => (await callFunction<{ items: UpiReviewItem[] }>("getUpiReviewQueue")).items;
export const reviewUpiPayment = (orderId: string, decision: "approve" | "reject" | "revoke", note?: string) =>
  callFunction<{ status: string }>("reviewUpiPayment", { orderId, decision, note });
