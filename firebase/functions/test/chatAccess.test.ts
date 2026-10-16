import { CHAT_UNLOCK } from "../src/config";
import { entitled, inLegacyGrace, maySend, paidChatEnforced, parseChatPolicy, razorpayMode, unlockPaymentVerdict, unlockReceipt } from "../src/lib/chatAccess";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const order = { orderId: "order_Chat123456", amountPaise: 4900, currency: "INR" };
const captured = { id: "pay_Chat123456", order_id: "order_Chat123456", status: "captured", amount: 4900, currency: "INR", amount_refunded: 0, refund_status: null };

describe("Unlimited Chat product", () => {
  it("is ₹49 (4,900 paise, INR), priced on the server and clearly labelled as Paire", () => {
    expect(CHAT_UNLOCK).toMatchObject({ amountPaise: 4900, currency: "INR", product: "paire_unlimited_chat" });
    expect(CHAT_UNLOCK.label).toMatch(/^Paire Unlimited Chat/);
  });

  it("receipts fit Razorpay's 40 characters and don't reveal the account", () => {
    const receipt = unlockReceipt("a".repeat(64), NOW);
    expect(receipt.length).toBeLessThanOrEqual(40);
    expect(receipt).toMatch(/^chat_a{12}_/);
  });
});

describe("chat policy", () => {
  it("is off unless explicitly enforced; malformed values are ignored", () => {
    expect(parseChatPolicy(undefined)).toEqual({ enforcePaidChat: false, enforceFrom: 0, legacyGraceUntil: 0, unlockSales: false });
    expect(parseChatPolicy({ enforcePaidChat: "true", unlockSales: 1, enforceFrom: "soon" })).toEqual({ enforcePaidChat: false, enforceFrom: 0, legacyGraceUntil: 0, unlockSales: false });
  });

  it("starts the gate on its announced date", () => {
    const policy = parseChatPolicy({ enforcePaidChat: true, enforceFrom: NOW + HOUR });
    expect(paidChatEnforced(policy, NOW)).toBe(false);
    expect(paidChatEnforced(policy, NOW + HOUR)).toBe(true);
  });
});

describe("who may send", () => {
  const on = parseChatPolicy({ enforcePaidChat: true });

  it("needs the sender's own Unlimited Chat or a running Plus pass once enforced", () => {
    expect(maySend(on, undefined, NOW, NOW)).toBe(false);
    expect(maySend(on, { unlimited: false, premiumUntil: 0 }, NOW, NOW)).toBe(false);
    expect(maySend(on, { unlimited: true, premiumUntil: 0 }, NOW, NOW)).toBe(true);
    expect(maySend(on, { unlimited: false, premiumUntil: NOW + 1 }, NOW, NOW)).toBe(true);
  });

  it("expired Plus locks sending unless Unlimited Chat is also owned (and Plus expiring never removes it)", () => {
    expect(entitled({ unlimited: false, premiumUntil: NOW - 1 }, NOW)).toBe(false);
    expect(entitled({ unlimited: true, premiumUntil: NOW - 1 }, NOW)).toBe(true);
  });

  it("anyone may send while the gate is off", () => {
    expect(maySend(parseChatPolicy({}), undefined, NOW, NOW)).toBe(true);
  });

  it("older chats keep sending free only inside a configured grace period", () => {
    const policy = parseChatPolicy({ enforcePaidChat: true, enforceFrom: NOW - HOUR, legacyGraceUntil: NOW + HOUR });
    expect(inLegacyGrace(policy, NOW - 2 * HOUR, NOW)).toBe(true);
    expect(inLegacyGrace(policy, NOW - 30 * 60_000, NOW)).toBe(false);
    expect(inLegacyGrace(policy, NOW - 2 * HOUR, NOW + 2 * HOUR)).toBe(false);
    expect(inLegacyGrace(parseChatPolicy({ enforcePaidChat: true, legacyGraceUntil: NOW + HOUR }), NOW - HOUR, NOW)).toBe(false);
  });
});

describe("payment verification", () => {
  it("grants only for a captured ₹49 INR payment of this exact order", () => {
    expect(unlockPaymentVerdict(captured, order)).toBe("captured");
  });

  it("refuses wrong amounts, currencies, orders and refunded payments", () => {
    expect(unlockPaymentVerdict({ ...captured, amount: 4999 }, order)).toBe("mismatch");
    expect(unlockPaymentVerdict({ ...captured, amount: 500000 }, order)).toBe("mismatch");
    expect(unlockPaymentVerdict({ ...captured, currency: "USD" }, order)).toBe("mismatch");
    expect(unlockPaymentVerdict({ ...captured, order_id: "order_Other12345" }, order)).toBe("mismatch");
    expect(unlockPaymentVerdict({ ...captured, amount_refunded: 4900 }, order)).toBe("mismatch");
    expect(unlockPaymentVerdict({ ...captured, refund_status: "partial" }, order)).toBe("mismatch");
    expect(unlockPaymentVerdict(captured, { ...order, amountPaise: 2000 })).toBe("mismatch");
    expect(unlockPaymentVerdict(captured, { ...order, currency: "USD" })).toBe("mismatch");
    expect(unlockPaymentVerdict(null, order)).toBe("mismatch");
  });

  it("waits on authorised payments and refuses failed ones", () => {
    expect(unlockPaymentVerdict({ ...captured, status: "authorized" }, order)).toBe("pending");
    expect(unlockPaymentVerdict({ ...captured, status: "failed" }, order)).toBe("mismatch");
  });

  it("knows a test key from a live one, and nothing else", () => {
    expect(razorpayMode("rzp_test_Abc123")).toBe("test");
    expect(razorpayMode("rzp_live_Abc123")).toBe("live");
    expect(razorpayMode("rzp_prod_Abc123")).toBeNull();
    expect(razorpayMode(undefined)).toBeNull();
  });
});
