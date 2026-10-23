/**
 * Payment display names. Keep this environment contract in sync with
 * kanoon-simplified/src/lib/payment-names.ts. See docs/kraftai-checkout.md.
 * Product IDs, plan IDs, prices and entitlements are independent of these names.
 */
const configured = (value: string | undefined, fallback: string): string => value?.trim() || fallback;

const plus = configured(process.env.PAIRE_PLUS_NAME, "Paire Plus");
const chat = configured(process.env.PAIRE_CHAT_NAME, "Paire Unlimited Chat");

const labels = {
  day: configured(process.env.PAIRE_PLUS_DAY_LABEL, `${plus} · 1 day`),
  week: configured(process.env.PAIRE_PLUS_WEEK_LABEL, `${plus} · 7 days`),
  month: configured(process.env.PAIRE_PLUS_MONTH_LABEL, `${plus} · 1 month + 1 month free`),
  lifetime: configured(process.env.PAIRE_PLUS_LIFETIME_LABEL, `${plus} · Lifetime`),
  chat: configured(process.env.PAIRE_CHAT_LABEL, `${chat} · one-time ₹49 unlock`)
};
const razorpayPlus = configured(process.env.RAZORPAY_PLUS_NAME, "KraftAI Plus");
const razorpayChat = configured(process.env.RAZORPAY_CHAT_NAME, "KraftAI Unlimited Chat");

export const PAYMENT_NAMES = {
  plus,
  chat,
  labels,
  // Razorpay descriptions can differ from the labels on our own pages.
  // Public payment descriptions never inherit the app's branding by default.
  razorpayLabels: {
    day: configured(process.env.RAZORPAY_PLUS_DAY_LABEL, `${razorpayPlus} · 1 day`),
    week: configured(process.env.RAZORPAY_PLUS_WEEK_LABEL, `${razorpayPlus} · 7 days`),
    month: configured(process.env.RAZORPAY_PLUS_MONTH_LABEL, `${razorpayPlus} · 1 month + 1 month free`),
    lifetime: configured(process.env.RAZORPAY_PLUS_LIFETIME_LABEL, `${razorpayPlus} · Lifetime`),
    chat: configured(process.env.RAZORPAY_CHAT_LABEL, `${razorpayChat} · one-time ₹49 unlock`)
  },
  hostedMerchant: configured(process.env.KRAFTAI_CHECKOUT_NAME, "KraftAI")
} as const;
