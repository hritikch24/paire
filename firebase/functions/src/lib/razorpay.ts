import { createHmac } from "crypto";
import { sameSecret } from "./billing";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Paire Plus passes sold on the web. Amounts are in paise (INR), GST inclusive. Never trust a client amount. */
export const PLUS_PASSES = {
  day: { days: 1, amountPaise: 2000, label: "Paire Plus · 1 day" },
  week: { days: 7, amountPaise: 9900, label: "Paire Plus · 7 days" },
  month: { days: 30, amountPaise: 29900, label: "Paire Plus · 30 days" }
} as const;
export type PlusPlan = keyof typeof PLUS_PASSES;

export function isPlusPlan(value: unknown): value is PlusPlan {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLUS_PASSES, value);
}

/** Razorpay ids look like order_XXXXXXXX / pay_XXXXXXXX. */
export function isRazorpayId(value: unknown, prefix: "order" | "pay"): value is string {
  return typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`).test(value);
}

/** Checkout success: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function validCheckoutSignature(orderId: string, paymentId: string, signature: unknown, secret: string | undefined): boolean {
  if (!secret || secret === "disabled" || typeof signature !== "string") return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return sameSecret(signature, expected);
}

/** Webhooks: HMAC-SHA256 of the exact raw body with the webhook secret. */
export function validWebhookSignature(raw: Buffer, signature: string | undefined, secret: string | undefined): boolean {
  if (!secret || secret === "disabled" || !signature) return false;
  return sameSecret(signature, createHmac("sha256", secret).update(raw).digest("hex"));
}

/**
 * When a newly paid pass runs. Passes never overlap: a pass bought while
 * another is still running starts when that one ends, so nobody loses days.
 */
export function passWindow(paidAt: number, days: number, currentExpiry: number): { startsAt: number; expiresAt: number } {
  const startsAt = Math.max(paidAt, currentExpiry);
  return { startsAt, expiresAt: startsAt + days * DAY_MS };
}

/** A Razorpay payment we can grant for: captured, for this exact order, amount and currency. */
export function paymentMatchesOrder(
  payment: { order_id?: unknown; status?: unknown; amount?: unknown; currency?: unknown; amount_refunded?: unknown } | null | undefined,
  order: { orderId: string; amountPaise: number }
): "captured" | "pending" | "mismatch" {
  if (!payment || payment.order_id !== order.orderId || payment.amount !== order.amountPaise || payment.currency !== "INR") {
    return "mismatch";
  }
  // Any refund, full or partial, means no pass.
  if (typeof payment.amount_refunded === "number" && payment.amount_refunded > 0) return "mismatch";
  if (payment.status === "captured") return "captured";
  if (payment.status === "authorized" || payment.status === "created") return "pending";
  return "mismatch";
}
