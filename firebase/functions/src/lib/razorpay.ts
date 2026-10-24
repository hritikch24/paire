import { createHmac } from "crypto";
import { sameSecret } from "./billing";
import { PAYMENT_NAMES } from "./payment-names";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Paire Plus passes sold on the web. Amounts are in paise (INR), GST inclusive. Never trust a client amount.
 * `bonusDays` is the web offer on top of the paid days: buy 1 month, get 1 month free (set it to 0 to end
 * the offer; passes already bought keep their days). Mirrored in apps/muse-mobile/src/config/premium.ts.
 */
export const PLUS_PASSES = {
  day: { days: 1, bonusDays: 0, amountPaise: 3500, label: PAYMENT_NAMES.labels.day, razorpayLabel: PAYMENT_NAMES.razorpayLabels.day },
  week: { days: 7, bonusDays: 0, amountPaise: 9900, label: PAYMENT_NAMES.labels.week, razorpayLabel: PAYMENT_NAMES.razorpayLabels.week },
  month: { days: 30, bonusDays: 30, amountPaise: 39900, label: PAYMENT_NAMES.labels.month, razorpayLabel: PAYMENT_NAMES.razorpayLabels.month },
  halfyear: { days: 180, bonusDays: 0, amountPaise: 79900, label: PAYMENT_NAMES.labels.halfyear, razorpayLabel: PAYMENT_NAMES.razorpayLabels.halfyear },
  lifetime: { days: 0, bonusDays: 0, amountPaise: 149900, label: PAYMENT_NAMES.labels.lifetime, razorpayLabel: PAYMENT_NAMES.razorpayLabels.lifetime }
} as const;
export type PlusPlan = keyof typeof PLUS_PASSES;

/** How long a web pass runs: the paid days plus any offer days. */
export const passDays = (plan: PlusPlan) => PLUS_PASSES[plan].days + PLUS_PASSES[plan].bonusDays;

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

export function planWindow(paidAt: number, plan: PlusPlan, currentExpiry: number): { startsAt: number; expiresAt: number | null; lifetime?: true } {
  return plan === "lifetime" ? { startsAt: paidAt, expiresAt: null, lifetime: true } : passWindow(paidAt, passDays(plan), currentExpiry);
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
