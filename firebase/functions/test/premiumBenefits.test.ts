import { summarizeWebBenefits } from "../src/lib/premiumBenefits";
const now = 1800000000000, day = 86400000;
const order = (changes: Record<string, unknown> = {}) => ({ id: "month-order", plan: "month", status: "paid", startsAt: now - day, expiresAt: now + day, ...changes });
const benefits = (orders: Record<string, unknown>[], support?: Record<string, unknown>, gift?: Record<string, unknown>, lifetime?: Record<string, unknown>, at = now) => summarizeWebBenefits(orders, support, gift, lifetime, at);

test("monthly purchases have unlimited likes only during their paid and bonus time", () => {
  expect(benefits([order()])).toEqual({ expiresAt: now + day, lifetime: false, unlimitedLikesUntil: now + day });
  expect(benefits([order({ status: "approved", paymentSource: "upi" })]).unlimitedLikesUntil).toBe(now + day);
  expect(benefits([order({ startsAt: now + 1000 })]).unlimitedLikesUntil).toBe(0);
  expect(benefits([order({ expiresAt: now })]).unlimitedLikesUntil).toBe(0);
  for (const status of ["created", "refunded", "chargeback", "revoked", "duplicate", "rejected"]) expect(benefits([order({ status })])).toEqual({ expiresAt: 0, lifetime: false, unlimitedLikesUntil: 0 });
});
test("day/week access remains finite and a complimentary month does not fabricate a monthly purchase", () => {
  for (const plan of ["day", "week"]) expect(benefits([order({ plan })])).toEqual({ expiresAt: now + day, lifetime: false, unlimitedLikesUntil: 0 });
  expect(benefits([], undefined, { status: "active", expiresAt: now + day }).unlimitedLikesUntil).toBe(0);
});
test("legacy owner-confirmed monthly recoveries follow the actual covered plan", () => {
  const recovery = { status: "active", startsAt: now - day, expiresAt: now + day, coveredOrderIds: ["month-order"] };
  expect(benefits([order({ status: "created" })], recovery).unlimitedLikesUntil).toBe(now + day);
  expect(benefits([order({ status: "created", plan: "day" })], recovery).unlimitedLikesUntil).toBe(0);
  expect(benefits([], { ...recovery, status: "revoked", plan: "month" }).unlimitedLikesUntil).toBe(0);
});
test("a paid lifetime is explicit, immediate and permanent; refund revokes only that source", () => {
  const life = order({ plan: "lifetime", expiresAt: null });
  expect(benefits([life])).toEqual({ expiresAt: 0, lifetime: true, unlimitedLikesUntil: 0 });
  expect(benefits([life], undefined, undefined, undefined, now + 100 * 365 * day).lifetime).toBe(true);
  expect(benefits([life, order()])).toEqual({ expiresAt: now + day, lifetime: true, unlimitedLikesUntil: now + day });
  expect(benefits([{ ...life, status: "refunded" }, order()])).toEqual({ expiresAt: now + day, lifetime: false, unlimitedLikesUntil: now + day });
});
test("an owner lifetime gift survives unrelated payment reversals without pretending money was received", () => {
  const gift = { status: "active", startsAt: now, source: "owner-gift", amountReportedPaise: 0 };
  expect(benefits([order({ plan: "lifetime", status: "refunded" })], undefined, undefined, gift).lifetime).toBe(true);
  expect(benefits([], undefined, undefined, { ...gift, status: "revoked" }).lifetime).toBe(false);
  expect(benefits([], undefined, undefined, { ...gift, startsAt: now + day }).lifetime).toBe(false);
});

test("each provider requires its own confirmed status and future recovery periods stay deferred", () => {
  expect(benefits([order({ status: "approved", paymentSource: "razorpay" })]).expiresAt).toBe(0);
  expect(benefits([order({ status: "paid", paymentSource: "upi" })]).expiresAt).toBe(0);
  expect(benefits([], { status: "active", startsAt: now + day, expiresAt: now + 2 * day })).toEqual({ expiresAt: 0, lifetime: false, unlimitedLikesUntil: 0 });
});
