import { HttpsError, onCall } from "firebase-functions/v2/https";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { FIXED_CATALOG, FIXED_PRICE_VERSION } from "./lib/fixed-catalog";

function rejectPromo(code: unknown) {
  if (code !== undefined && code !== null && code !== "") throw new HttpsError("failed-precondition", "Promo codes have ended. Refresh to see the fixed price.");
}

export const getLaunchOffer = onCall({ region: REGION }, async request => {
  requireAuth(request);
  rejectPromo(request.data?.code);
  const plans = Object.fromEntries(Object.entries(FIXED_CATALOG).map(([id, { amount, days }]) => [id, { regular: amount, amount, offer: amount, coupon: amount, days }]));
  return { personalized: null as import("./lib/member-offer").MemberOffer | null, active: false, endsAt: 0, remaining: 0, couponAvailable: false, code: null, plans, priceVersion: FIXED_PRICE_VERSION };
});

export async function promoCheckout<T extends object>(_uid: string, plan: keyof typeof FIXED_CATALOG, code: unknown, create: (amount: number, notes: Record<string, string>) => Promise<T>, expectedAmount?: unknown): Promise<T> {
  rejectPromo(code);
  const { amount } = FIXED_CATALOG[plan];
  if (expectedAmount !== undefined && expectedAmount !== amount) throw new HttpsError("failed-precondition", "The price changed. Refresh before paying.");
  return create(amount, { pricing: "fixed", priceVersion: FIXED_PRICE_VERSION });
}
