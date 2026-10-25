import {
  GIFT_CHECKOUT_REUSE_MS,
  GIFT_PRODUCT,
  giftCaptureVerdict,
  giftCheckoutKey,
  giftDayStart,
  giftOrderBody,
  giftPushCopy,
  isMatchId,
  refundRetryAllowed
} from "../src/lib/giftPayments";
import { dayKey } from "../src/lib/ids";

describe("gift order body", () => {
  test("the server prices each gift from the existing pass table", () => {
    expect(giftOrderBody("day", 1).amount).toBe(3500);
    expect(giftOrderBody("week", 1).amount).toBe(9900);
    expect(giftOrderBody("month", 1).amount).toBe(39900);
  });

  test("exact body: INR, gift_plan receipt and notes with only plan and product", () => {
    expect(giftOrderBody("week", 1_761_000_000_000)).toEqual({
      amount: 9900,
      currency: "INR",
      receipt: "gift_plan_week_1761000000000",
      notes: { plan: "week", product: "gift_plan" }
    });
    expect(GIFT_PRODUCT).toBe("gift_plan");
  });

  test("notes never carry a uid, a match id or a name", () => {
    const body = giftOrderBody("month", Date.now());
    expect(Object.keys(body.notes).sort()).toEqual(["plan", "product"]);
    expect(body.receipt.startsWith("gift_plan_month_")).toBe(true);
    // Razorpay receipts are at most 40 characters.
    expect(body.receipt.length).toBeLessThanOrEqual(40);
  });
});

describe("gift capture verdict", () => {
  const ok = {
    fromUid: "alexa",
    toUid: "jules",
    match: { active: true, participants: ["alexa", "jules"] },
    blocked: false,
    recipientExists: true,
    recipientBanned: false,
    senderExists: true,
    senderBanned: false,
    mode: "live" as const,
    emulator: false,
    senderCohort: undefined as unknown,
    recipientCohort: undefined as unknown
  };

  test("a live payment for an active, unblocked match is granted", () => {
    expect(giftCaptureVerdict(ok)).toBe("grant");
  });

  test("a deleted, banned, unmatched or blocked recipient orphans the payment", () => {
    expect(giftCaptureVerdict({ ...ok, recipientExists: false })).toBe("orphaned");
    expect(giftCaptureVerdict({ ...ok, recipientBanned: true })).toBe("orphaned");
    expect(giftCaptureVerdict({ ...ok, match: undefined })).toBe("orphaned");
    expect(giftCaptureVerdict({ ...ok, match: { active: false, participants: ["alexa", "jules"] } })).toBe("orphaned");
    expect(giftCaptureVerdict({ ...ok, match: { active: true, participants: ["alexa", "sam"] } })).toBe("orphaned");
    expect(giftCaptureVerdict({ ...ok, blocked: true })).toBe("orphaned");
    expect(giftCaptureVerdict({ ...ok, senderExists: false })).toBe("orphaned");
    expect(giftCaptureVerdict({ ...ok, senderBanned: true })).toBe("orphaned");
  });

  test("test-mode money only moves between test-cohort accounts outside the emulator", () => {
    const test = { ...ok, mode: "test" as const };
    expect(giftCaptureVerdict(test)).toBe("rejected");
    expect(giftCaptureVerdict({ ...test, senderCohort: "test" })).toBe("rejected");
    expect(giftCaptureVerdict({ ...test, recipientCohort: "test" })).toBe("rejected");
    expect(giftCaptureVerdict({ ...test, senderCohort: "test", recipientCohort: "test" })).toBe("grant");
    expect(giftCaptureVerdict({ ...test, emulator: true })).toBe("grant");
    // An unknown key environment is never treated as live.
    expect(giftCaptureVerdict({ ...ok, mode: null })).toBe("rejected");
  });

  test("an ineligible recipient is orphaned before the mode is considered", () => {
    expect(giftCaptureVerdict({ ...ok, mode: "test", blocked: true })).toBe("orphaned");
  });
});

describe("gift checkout helpers", () => {
  test("one checkout key per sender, match and plan", () => {
    expect(giftCheckoutKey("alexa", "alexa_jules", "week")).toBe(giftCheckoutKey("alexa", "alexa_jules", "week"));
    expect(giftCheckoutKey("alexa", "alexa_jules", "week")).not.toBe(giftCheckoutKey("alexa", "alexa_jules", "day"));
    expect(giftCheckoutKey("alexa", "alexa_jules", "week")).not.toBe(giftCheckoutKey("jules", "alexa_jules", "week"));
    expect(giftCheckoutKey("a", "b_c", "day")).not.toContain("/");
    expect(GIFT_CHECKOUT_REUSE_MS).toBe(6 * 3600_000);
  });

  test("match ids are document-id safe", () => {
    expect(isMatchId("alexa_jules")).toBe(true);
    expect(isMatchId("a/b")).toBe(false);
    expect(isMatchId("")).toBe(false);
    expect(isMatchId(42)).toBe(false);
    expect(isMatchId("x".repeat(300))).toBe(false);
  });

  test("the gift day starts at the same UTC midnight as the daily quotas", () => {
    const now = Date.UTC(2026, 9, 25, 17, 30);
    expect(giftDayStart(now)).toBe(Date.UTC(2026, 9, 25));
    expect(dayKey(new Date(giftDayStart(now)))).toBe(dayKey(new Date(now)));
  });

  test("the push names nobody unless the recipient turned previews on", () => {
    expect(giftPushCopy(undefined, "Alexa")).toEqual({ title: "Paire", body: "Someone sent you a gift." });
    expect(giftPushCopy(false, "Alexa")).toEqual({ title: "Paire", body: "Someone sent you a gift." });
    const shown = giftPushCopy(true, "Alexa");
    expect(shown.body).toContain("Alexa");
    expect(giftPushCopy(true, undefined).body).toBe("Someone sent you a gift.");
  });
});

describe("refund retry after a crash", () => {
  const now = 1_761_000_000_000;
  const orphaned = { status: "orphaned", paymentId: "pay_A1b2C3d4" };

  test("an orphaned or rejected payment with no refund on record is retried", () => {
    expect(refundRetryAllowed(orphaned, "pay_A1b2C3d4", now)).toBe(true);
    expect(refundRetryAllowed({ ...orphaned, status: "rejected" }, "pay_A1b2C3d4", now)).toBe(true);
  });

  test("never while another delivery's attempt is under two minutes old; again after that", () => {
    expect(refundRetryAllowed({ ...orphaned, refundAttemptAt: now - 1_000 }, "pay_A1b2C3d4", now)).toBe(false);
    expect(refundRetryAllowed({ ...orphaned, refundAttemptAt: now - 119_999 }, "pay_A1b2C3d4", now)).toBe(false);
    expect(refundRetryAllowed({ ...orphaned, refundAttemptAt: now - 120_000 }, "pay_A1b2C3d4", now)).toBe(true);
  });

  test("never once a refund, a refund error or a refund event is recorded, or for a refunded order", () => {
    expect(refundRetryAllowed({ ...orphaned, refundId: "rfnd_1" }, "pay_A1b2C3d4", now)).toBe(false);
    expect(refundRetryAllowed({ ...orphaned, refundError: "boom" }, "pay_A1b2C3d4", now)).toBe(false);
    expect(refundRetryAllowed({ ...orphaned, refundedPaymentIds: ["pay_A1b2C3d4"] }, "pay_A1b2C3d4", now)).toBe(false);
    expect(refundRetryAllowed({ ...orphaned, status: "refunded" }, "pay_A1b2C3d4", now)).toBe(false);
    expect(refundRetryAllowed({ ...orphaned, status: "paid" }, "pay_A1b2C3d4", now)).toBe(false);
  });

  test("only for the order's own payment", () => {
    expect(refundRetryAllowed(orphaned, "pay_Other123", now)).toBe(false);
  });
});
