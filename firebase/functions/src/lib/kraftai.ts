import { PAYMENT_NAMES } from "./payment-names";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Razorpay Checkout hosted on kraftai.in. Paire's web payments run through
 * KraftAI's Razorpay account, which is registered for kraftai.in, so Checkout
 * has to open there rather than on paire.in:
 *
 *   paire.in (order created here, server side) → kraftai.in/pay/start?order=… (Checkout)
 *   → kraftai.in/pay/checkout/callback → paire.in/app/?kraftai=paid&kind=…&order=…&payment=…&signature=…
 *
 * Nothing about granting changes: confirmPlusPayment / confirmChatUnlock and the
 * signed webhook still verify every payment with Razorpay. kraftai.in only opens
 * Checkout for Paire orders at its own published prices (kanoon-simplified
 * src/lib/paire.ts must match PLUS_PASSES and CHAT_UNLOCK).
 *
 * KRAFTAI_CHECKOUT_URL (functions .env), e.g. https://kraftai.in/pay/start.
 * Required for new orders; unset or invalid refuses checkout.
 */
export function hostedCheckoutBase(raw = process.env.KRAFTAI_CHECKOUT_URL): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const merchant = url.hostname === "kraftai.in" || url.hostname === "www.kraftai.in";
    if ((merchant && url.protocol === "https:") || (local && (url.protocol === "http:" || url.protocol === "https:"))) {
      url.pathname = "/pay/start";
      url.search = "";
      url.hash = "";
      return url;
    }
  } catch {
    // Fall through: a malformed value never sends anyone to a broken page.
  }
  return null;
}

/** Require a configured host before creating an order; never fall back to inline checkout. */
export function requireHostedCheckout(): URL {
  const base = hostedCheckoutBase();
  if (!base) throw new HttpsError("failed-precondition", "Secure checkout is unavailable. Please try again later.");
  return base;
}

/** How Checkout is presented for an order: where it opens, and the merchant name it shows. */
export function checkoutHost(orderId: string): { name: string; hostedUrl: string } {
  const base = requireHostedCheckout();
  base.searchParams.set("order", orderId);
  // Checkout's display name is configured separately from the registered merchant identity.
  return { name: PAYMENT_NAMES.hostedMerchant, hostedUrl: base.toString() };
}

/**
 * The prices kraftai.in publishes and will charge (PAIRE_PLANS in kanoon-simplified
 * src/lib/paire.ts), in paise. kraftai.in refuses any order at another amount, so a
 * Paire price change must land on both sites together: a test fails here until this
 * table, and kraftai.in, are updated too.
 */
export const KRAFTAI_PUBLISHED_PAISE = { day: 2000, week: 9900, month: 29900, chat: 4900 } as const;
