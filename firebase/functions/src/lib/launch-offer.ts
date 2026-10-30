/** Shared campaign contract. Keep the three copies byte-identical; parity is tested. */
export const LAUNCH_OFFER = {
  id: "october-2026",
  startsAt: Date.parse("2026-10-30T00:00:00+05:30"),
  endsAt: Date.parse("2026-11-01T00:00:00+05:30"),
  limit: 250,
  codes: ["PAIRE250", "WELCOME250", "DIWALI250"],
  endLabel: "31 October 2026, 11:59 pm IST"
} as const;
export const OFFER_PRICES = {
  day: { regular: 4900, offer: 3500, coupon: 2800 },
  week: { regular: 15000, offer: 9900, coupon: 8500 },
  month: { regular: 57000, offer: 39900, coupon: 35910 },
  halfyear: { regular: 114143, offer: 79900, coupon: 71910 },
  lifetime: { regular: 214143, offer: 149900, coupon: 134910 },
  chat: { regular: 7000, offer: 4900, coupon: 4410 }
} as const;
export type OfferPlan = keyof typeof OFFER_PRICES;
export const offerActive = (now = Date.now()) => now >= LAUNCH_OFFER.startsAt && now < LAUNCH_OFFER.endsAt;
export const currentPrice = (plan: OfferPlan, now = Date.now()) => offerActive(now) ? OFFER_PRICES[plan].offer : OFFER_PRICES[plan].regular;
export const formatInr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const normalizePromo = (code: unknown) => typeof code === "string" ? code.trim().toUpperCase() : "";
export const validPromo = (code: string) => (LAUNCH_OFFER.codes as readonly string[]).includes(code);
