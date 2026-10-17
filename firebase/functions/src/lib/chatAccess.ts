import { CHAT_UNLOCK } from "../config";

/**
 * Who may send chat messages. One model for the app, the functions and the
 * Firestore rules:
 *
 *   may send = paid chat isn't enforced
 *           || the sender owns Unlimited Chat (one-time, account-wide, no expiry)
 *           || the sender's Paire Plus pass is still running
 *           || the chat existed before enforcement and its grace period is running
 *
 * Only the sender's own access counts: receiving and reading are always free,
 * and a paying member can message someone who hasn't paid. Payment never
 * bypasses matching, blocks, bans, verification or "I'll message first"; the
 * rules check those separately and first.
 *
 * The rules can't afford another document read per message (Duo chats already
 * read every member's moderation record), so the server mirrors each member's
 * access onto moderation/{uid}.chatAccess, which the rules read anyway. The
 * sources of truth are chatUnlocks/{uid} and billing/{uid}.
 */

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
};

export type ChatAccessMirror = { unlimited: boolean; premiumUntil: number };

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
    ccavenueSales: raw.ccavenueSales === true
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

export function maySend(policy: ChatPolicy, access: Partial<ChatAccessMirror> | undefined, chatCreatedAt: number, now: number): boolean {
  return !paidChatEnforced(policy, now) || entitled(access, now) || inLegacyGrace(policy, chatCreatedAt, now);
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
    order.amountPaise !== CHAT_UNLOCK.amountPaise ||
    order.currency !== CHAT_UNLOCK.currency ||
    payment.amount !== CHAT_UNLOCK.amountPaise ||
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
