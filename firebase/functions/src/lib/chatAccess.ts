import { FIXED_CATALOG } from "./fixed-catalog";
import { OFFER_PRICES } from "./launch-offer";
import { CHAT_UNLOCK } from "../config";

/** Paid-chat fields of runtime/trust: the sending gate and the Unlimited Chat sales switch. */
export type ChatPolicy = {
  /** Master switch for the sending gate. */
  enforcePaidChat: boolean;
  /** Server ms the gate starts (an announced date); 0 = as soon as it is enforced. */
  enforceFrom: number;
  /** Chats created before enforceFrom may keep sending free until this server ms; 0 = no grace. */
  legacyGraceUntil: number;
  /** Unlimited Chat can be bought through Razorpay (also needs MUSE_CHAT_UNLOCK_ENABLED and Razorpay keys). */
  unlockSales: boolean;
  /** Unlimited Chat and Plus can be paid by UPI into Paire's own account (also needs MUSE_UPI_VPA). */
  upiSales: boolean;
  /** New Paire Plus passes can be bought through Razorpay. Missing = yes (as before). */
  razorpayPlusSales: boolean;
  /** Unlimited Chat and Plus can be paid through CCAvenue (also needs MUSE_CCAVENUE_ENABLED and CCAvenue keys). */
  ccavenueSales: boolean;
  /** Women can accept likes into a match (see Likes). Missing = off. */
  acceptFlow: boolean;
  /** Women may send in any of their chats without a pass, once a man has paid to reach her. Missing = off. */
  womenSendFree: boolean;
  /** Gifts of Paire Plus passes between matches can be bought. Missing = off. */
  giftSales: boolean;
};

/** `freeSender`: the member is a woman, who sends free while runtime/trust.womenSendFree is on (it is no entitlement of her own). */
export type ChatAccessMirror = { unlimited: boolean; premiumUntil: number; premiumLifetime?: boolean; freeSender?: boolean };

const ms = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export function parseChatPolicy(data: unknown): ChatPolicy {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    enforcePaidChat: raw.enforcePaidChat === true,
    enforceFrom: ms(raw.enforceFrom),
    legacyGraceUntil: ms(raw.legacyGraceUntil),
    unlockSales: raw.unlockSales === true,
    upiSales: raw.upiSales === true,
    razorpayPlusSales: raw.razorpayPlusSales !== false,
    ccavenueSales: raw.ccavenueSales === true,
    acceptFlow: raw.acceptFlow === true,
    womenSendFree: raw.womenSendFree === true,
    giftSales: raw.giftSales === true
  };
}

/** The gate is on right now (mirrors paidChatOn() in firestore.rules). */
export function paidChatEnforced(policy: ChatPolicy, now: number): boolean {
  return policy.enforcePaidChat && now >= policy.enforceFrom;
}

/** The member's own entitlement, ignoring the gate. */
export function entitled(access: Partial<ChatAccessMirror> | undefined, now: number): boolean {
  return access?.unlimited === true || ms(access?.premiumUntil) > now;
}

/** A chat started before enforcement, still inside its grace period (mirrors legacyGrace()). */
export function inLegacyGrace(policy: ChatPolicy, chatCreatedAt: number, now: number): boolean {
  return policy.enforceFrom > 0 && chatCreatedAt > 0 && chatCreatedAt < policy.enforceFrom && now < policy.legacyGraceUntil;
}

export function maySend(_policy: ChatPolicy, access: Partial<ChatAccessMirror> | undefined, _chatCreatedAt: number, now: number): boolean {
  return entitled(access, now);
}

export type RazorpayMode = "test" | "live";

/** Razorpay key ids say which environment they belong to. */
export function razorpayMode(keyId: string | undefined): RazorpayMode | null {
  if (typeof keyId !== "string") return null;
  if (/^rzp_test_[A-Za-z0-9]+$/.test(keyId)) return "test";
  if (/^rzp_live_[A-Za-z0-9]+$/.test(keyId)) return "live";
  return null;
}

export type UnlockPayment = {
  id?: unknown;
  order_id?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  amount_refunded?: unknown;
  refund_status?: unknown;
};

/**
 * Whether a Razorpay payment (as read back from Razorpay itself) pays for this
 * Unlimited Chat order: the exact order, ₹49 in INR, captured, never refunded.
 */
export function unlockPaymentVerdict(payment: UnlockPayment | null | undefined, order: { orderId: string; amountPaise: number; currency: string }): "captured" | "pending" | "mismatch" {
  if (
    !payment ||
    payment.order_id !== order.orderId ||
    (order.amountPaise !== FIXED_CATALOG.chat.amount && !Object.values(OFFER_PRICES.chat).some(amount => amount === order.amountPaise)) ||
    order.currency !== CHAT_UNLOCK.currency ||
    payment.amount !== order.amountPaise ||
    payment.currency !== CHAT_UNLOCK.currency
  ) {
    return "mismatch";
  }
  if ((typeof payment.amount_refunded === "number" && payment.amount_refunded > 0) || (payment.refund_status !== undefined && payment.refund_status !== null)) return "mismatch";
  if (payment.status === "captured") return "captured";
  if (payment.status === "authorized" || payment.status === "created") return "pending";
  return "mismatch";
}

/** Short, unique-enough Razorpay receipt (≤ 40 characters) that doesn't reveal the uid. */
export function unlockReceipt(uidHash: string, now: number): string {
  return `chat_${uidHash.slice(0, 12)}_${now.toString(36)}`;
}
