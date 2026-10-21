import { Timestamp } from "firebase-admin/firestore";
import { ManualReceipt, RevenueOrder, summarizeRevenue, recognizedPayments, recentPremiumPayments, summarizeRecentPremium } from "../src/lib/revenue";

const order = (overrides: Partial<RevenueOrder> = {}): RevenueOrder => ({ id: "month", source: "ccavenue", uid: "member", kind: "plus", currency: "INR", mode: "live", amountPaise: 29900, status: "created", ...overrides });
const receipt = (overrides: Partial<ManualReceipt> = {}): ManualReceipt => ({ id: "recovery", uid: "member", action: "plus-payment-recovery", status: "active", currency: "INR", amountReportedPaise: 29900, confirmationSource: "owner_statement", coveredOrderIds: ["month"], ...overrides });

test("owner-confirmed receipts and approved UPI count with exact paise, without changing entitlements", () => {
  const orders = [order(), order({ id: "week", amountPaise: 9900 }), order({ source: "upi", id: "upi", status: "approved", amountPaise: 2095 }), order({ id: "day", status: "paid", amountPaise: 2000 })];
  const receipts = [receipt({ expiresAt: 1 }), receipt({ id: "week-receipt", action: "payment-received", kind: "plus", orderSource: "ccavenue", amountReportedPaise: 9900, coveredOrderIds: ["week"], status: "confirmed" })];
  expect(summarizeRevenue(orders, receipts).plus).toEqual({ orders: 4, rupees: 438.95, manualOrders: 2, manualRupees: 398 });
});

test.each(["paid", "refunded", "chargeback", "duplicate", "orphaned", "rejected"])("gateway %s replaces or removes an owner receipt without counting it twice", (status) => {
  const result = summarizeRevenue([order({ status })], [receipt()]);
  expect(result.plus).toEqual({ orders: status === "paid" ? 1 : 0, rupees: status === "paid" ? 299 : 0, manualOrders: 0, manualRupees: 0 });
});

test("multiple checkout aliases and duplicate approvals count once; separate real payments count separately", () => {
  const orders = [order(), order({ id: "retry" })];
  const receipts = [receipt({ coveredOrderIds: ["month", "retry"] }), receipt({ id: "repeat-approval", coveredOrderIds: ["retry"] })];
  expect(summarizeRevenue(orders, receipts).plus.rupees).toBe(299);
  expect(summarizeRevenue(orders.map((o) => ({ ...o, status: "paid" })), receipts).plus).toMatchObject({ orders: 2, rupees: 598, manualOrders: 0 });
});

test("gifts, unconfirmed/refunded receipts, test payments and mismatched receipts add no revenue", () => {
  for (const changes of [{ action: "goodwill-grant" }, { confirmationSource: "member_statement" }, { status: "refunded" }, { status: "revoked" }, { currency: "USD" }, { uid: "other" }, { amountReportedPaise: -1 }, { amountReportedPaise: 299.5 }, { amountReportedPaise: 9900 }, { coveredOrderIds: ["missing"] }]) {
    expect(summarizeRevenue([order()], [receipt(changes)]).plus.rupees).toBe(0);
  }
  expect(summarizeRevenue([order({ mode: "test", status: "paid" })], [receipt()]).plus.rupees).toBe(0);
});

test("manual chat receipts, UPI approvals/revocations and legacy Razorpay chat payments use the right product", () => {
  const o = order({ source: "upi", kind: "chat", amountPaise: 4901 });
  const r = receipt({ action: "payment-received", kind: "chat", orderSource: "upi", amountReportedPaise: 4901 });
  expect(summarizeRevenue([o], [r]).unlimitedChat).toMatchObject({ rupees: 49.01, manualOrders: 1 });
  expect(summarizeRevenue([{ ...o, status: "approved" }], [r]).unlimitedChat).toMatchObject({ rupees: 49.01, manualOrders: 0 });
  expect(summarizeRevenue([{ ...o, status: "revoked" }], [r]).unlimitedChat.rupees).toBe(0);
  expect(summarizeRevenue([order({ source: "razorpay-chat", status: "paid", kind: undefined, amountPaise: 4900 })], []).unlimitedChat.rupees).toBe(49);
  expect(summarizeRevenue([order({ source: "upi", status: "approved", kind: undefined, amountPaise: 4901 })], []).unlimitedChat.rupees).toBe(49.01);
});

const now = Date.parse("2026-10-21T10:00:00Z"), day = 86_400_000;
test("rolling Premium reports count unique buyers separately from purchases and preserve paise", () => {
  const payments = recognizedPayments([
    order({ id: "one", status: "paid", paidAt: now - 1000, amountPaise: 1999, startsAt: now + day }),
    order({ id: "two", source: "upi", status: "approved", reviewedAt: Timestamp.fromMillis(now - 2000), amountPaise: 9900 }),
    order({ id: "three", uid: "other", status: "paid", paidAt: now - 3000, amountPaise: 29900 }),
    order({ id: "chat", source: "razorpay-chat", status: "paid", paidAt: now, amountPaise: 4900 })
  ], []);
  expect(summarizeRecentPremium(recentPremiumPayments(payments, now), now)).toMatchObject({ buyers: 2, orders: 3, rupees: 417.99, manualOrders: 0, windowStart: now - day, windowEnd: now });
});
test("the window includes its boundary and never guesses a payment time from checkout or pass dates", () => {
  const dates = [now - day, now, now - day - 1, now + 1, undefined, NaN];
  const payments = recognizedPayments(dates.map((paidAt, i) => order({ id: String(i), status: "paid", paidAt, createdAt: now, startsAt: now, expiresAt: now + day })), []);
  expect(recentPremiumPayments(payments, now)).toHaveLength(2);
});
test("old manual confirmations do not reappear in 24-hour sales after later gateway reconciliation", () => {
  const orders = [order(), order({ id: "retry" })];
  const receipts = [receipt({ createdAt: now - day - 1, coveredOrderIds: ["month", "retry"] }), receipt({ id: "duplicate", createdAt: now, coveredOrderIds: ["retry"] })];
  expect(recentPremiumPayments(recognizedPayments(orders, receipts), now)).toHaveLength(0);
  expect(recentPremiumPayments(recognizedPayments([{ ...orders[0], status: "paid", paidAt: now }, orders[1]], receipts), now)).toHaveLength(0);
  const recent = [receipt({ createdAt: now - 3600000 })];
  expect(recentPremiumPayments(recognizedPayments([order({ status: "paid", paidAt: now })], recent), now)[0].confirmedAt).toBe(now - 3600000);
});
test("recent purchases share revenue exclusions and omit test-cohort/support identities", () => {
  const orders = [order({ status: "paid", paidAt: now }), order({ id: "test", status: "paid", paidAt: now, mode: "test" }), order({ id: "refund", status: "refunded", paidAt: now }), order({ id: "staff-test", uid: "test-account", status: "paid", paidAt: now }), order({ id: "support", uid: "support_fake", status: "paid", paidAt: now })];
  const payments = recognizedPayments(orders, [receipt({ action: "goodwill-grant", createdAt: now })]);
  expect(recentPremiumPayments(payments, now, new Set(["test-account"]))).toHaveLength(1);
});
