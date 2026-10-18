import { ManualReceipt, RevenueOrder, summarizeRevenue } from "../src/lib/revenue";

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
