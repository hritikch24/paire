import { UserRecord } from "firebase-admin/auth";
import { adminAuth, db } from "../src/admin";
import { promoCheckout } from "../src/launchOffer";
import { LAUNCH_OFFER, OFFER_PRICES } from "../src/lib/launch-offer";

let sequence = 0;
const uid = () => `offer_qa_${Date.now()}_${++sequence}`;
const provider = jest.fn(async (amount: number, notes: Record<string, string>) => ({ orderId: `order_PROMOQA${++sequence}`, amount, notes }));
beforeEach(async () => {
  jest.spyOn(Date, "now").mockReturnValue(LAUNCH_OFFER.startsAt + 12 * 3600000);
  jest.spyOn(adminAuth(), "getUser").mockImplementation(async member => ({ uid: member, metadata: { creationTime: new Date(member.startsWith("old_") ? LAUNCH_OFFER.startsAt - 1000 : LAUNCH_OFFER.startsAt + 1000).toUTCString() } } as UserRecord));
  provider.mockClear();
  await db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`).delete();
});
afterEach(() => jest.restoreAllMocks());
test("all marketing codes share the final remaining slot under simultaneous claims", async () => {
  await db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`).set({ claimed: 249 });
  const outcomes = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => promoCheckout(uid(), "day", LAUNCH_OFFER.codes[i % 3], provider)));
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(provider).toHaveBeenCalledTimes(1);
  expect((await db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`).get()).get("claimed")).toBe(250);
  expect(provider.mock.calls[0][0]).toBe(2800);
});
test("retries reopen one immutable checkout; switching plans cannot consume a second coupon", async () => {
  const member = uid();
  const first = await promoCheckout(member, "week", " paire250 ", provider, 8500);
  expect(first.amount).toBe(8500);
  expect(await promoCheckout(member, "week", "WELCOME250", provider, 8500)).toEqual(first);
  await expect(promoCheckout(member, "day", "DIWALI250", provider)).rejects.toThrow("another plan");
  expect(provider).toHaveBeenCalledTimes(1);
  expect((await db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`).get()).get("claimed")).toBe(1);
});
test("concurrent same-account requests cannot create two coupon orders", async () => {
  const member = uid();
  const results = await Promise.allSettled([promoCheckout(member, "day", "PAIRE250", provider), promoCheckout(member, "day", "WELCOME250", provider)]);
  expect(results.some(result => result.status === "fulfilled")).toBe(true);
  expect(provider).toHaveBeenCalledTimes(1);
  expect((await db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`).get()).get("claimed")).toBe(1);
});
test("invalid, ineligible, previously paying and price-tampered claims never reach the provider", async () => {
  await expect(promoCheckout(uid(), "day", "FREE", provider)).rejects.toThrow("isn't valid");
  await expect(promoCheckout(`old_${uid()}`, "day", "PAIRE250", provider)).rejects.toThrow("new members");
  const member = uid();
  await db.doc(`razorpayOrders/previous_${member}`).set({ uid: member, status: "paid" });
  await expect(promoCheckout(member, "month", "PAIRE250", provider)).rejects.toThrow("first purchase");
  await expect(promoCheckout(uid(), "day", "PAIRE250", provider, 1)).rejects.toThrow("price changed");
  expect(provider).not.toHaveBeenCalled();
  expect((await db.doc(`launchOfferCampaigns/${LAUNCH_OFFER.id}`).get()).exists).toBe(false);
});
test("expiry rejects new coupons and changes only new normal quotes", async () => {
  const existing = uid();
  const quote = await promoCheckout(existing, "day", "PAIRE250", provider);
  jest.spyOn(Date, "now").mockReturnValue(LAUNCH_OFFER.endsAt);
  await expect(promoCheckout(uid(), "day", "PAIRE250", provider)).rejects.toThrow("first purchase");
  expect(await promoCheckout(existing, "day", "PAIRE250", provider)).toEqual(quote);
  const regular = await promoCheckout(uid(), "day", "", provider, OFFER_PRICES.day.regular);
  expect(regular.amount).toBe(4900);
  await expect(promoCheckout(uid(), "day", "", provider, 3500)).rejects.toThrow("price changed");
});
test("provider uncertainty holds one claim without creating a second discounted order", async () => {
  const member = uid();
  const unavailable = jest.fn(async () => { throw new Error("provider timeout"); });
  await expect(promoCheckout(member, "day", "PAIRE250", unavailable)).rejects.toThrow("timeout");
  await expect(promoCheckout(member, "day", "WELCOME250", unavailable)).rejects.toThrow("being prepared");
  expect(unavailable).toHaveBeenCalledTimes(1);
});
