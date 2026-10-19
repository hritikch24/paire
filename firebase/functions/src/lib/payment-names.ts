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
  chat: configured(process.env.PAIRE_CHAT_LABEL, `${chat} · one-time ₹49 unlock`)
};
const razorpayPlus = process.env.RAZORPAY_PLUS_NAME?.trim();
const razorpayChat = process.env.RAZORPAY_CHAT_NAME?.trim();

export const PAYMENT_NAMES = {
  plus,
  chat,
  labels,
  // Razorpay descriptions can differ from the labels on our own pages.
  // Without overrides, preserve the UI labels (including full-label customizations).
  razorpayLabels: {
    day: configured(process.env.RAZORPAY_PLUS_DAY_LABEL, razorpayPlus ? `${razorpayPlus} · 1 day` : labels.day),
    week: configured(process.env.RAZORPAY_PLUS_WEEK_LABEL, razorpayPlus ? `${razorpayPlus} · 7 days` : labels.week),
    month: configured(process.env.RAZORPAY_PLUS_MONTH_LABEL, razorpayPlus ? `${razorpayPlus} · 1 month + 1 month free` : labels.month),
    chat: configured(process.env.RAZORPAY_CHAT_LABEL, razorpayChat ? `${razorpayChat} · one-time ₹49 unlock` : labels.chat)
  },
  directMerchant: configured(process.env.PAIRE_CHECKOUT_NAME, "Paire"),
  hostedMerchant: configured(process.env.KRAFTAI_CHECKOUT_NAME, "KraftAI")
} as const;
