import {
  canGift,
  giftAmountPaise,
  giftDays,
  GIFT_PENDING_MS,
  GIFT_PLAN_IDS,
  GIFTS_PER_DAY,
  giftState,
  isGiftPlan
} from "../src/lib/gifts";
import { PLUS_PASSES } from "../src/lib/razorpay";

const ok = {
  fromUid: "alexa",
  toUid: "jules",
  match: { active: true, participants: ["alexa", "jules"] },
  blocked: false,
  recipientBanned: false,
  recipientVerified: true,
  recipientExists: true,
  sentToday: 0,
  recipientLifetime: false
};

describe("gift plans", () => {
  test("only day, week and month are giftable", () => {
    expect([...GIFT_PLAN_IDS]).toEqual(["day", "week", "month"]);
    expect(isGiftPlan("day")).toBe(true);
    expect(isGiftPlan("week")).toBe(true);
    expect(isGiftPlan("month")).toBe(true);
    expect(isGiftPlan("halfyear")).toBe(false);
    expect(isGiftPlan("lifetime")).toBe(false);
    expect(isGiftPlan(undefined)).toBe(false);
    expect(isGiftPlan(7)).toBe(false);
    expect(isGiftPlan("toString")).toBe(false);
  });

  test("prices come from the existing pass table", () => {
    expect(giftAmountPaise("day")).toBe(PLUS_PASSES.day.amountPaise);
    expect(giftAmountPaise("week")).toBe(PLUS_PASSES.week.amountPaise);
    expect(giftAmountPaise("month")).toBe(PLUS_PASSES.month.amountPaise);
    expect(giftAmountPaise("day")).toBe(3500);
    expect(giftAmountPaise("week")).toBe(9900);
    expect(giftAmountPaise("month")).toBe(39900);
  });

  test("days match what the pass buys; the month is 60 days", () => {
    expect(giftDays("day")).toBe(1);
    expect(giftDays("week")).toBe(7);
    expect(giftDays("month")).toBe(60);
  });

  test("constants", () => {
    expect(GIFT_PENDING_MS).toBe(7 * 86_400_000);
    expect(GIFTS_PER_DAY).toBe(3);
  });
});

describe("canGift", () => {
  test("ok for an active match", () => {
    expect(canGift(ok)).toEqual({ ok: true });
  });
  test("no match, inactive match or participant mismatch", () => {
    expect(canGift({ ...ok, match: undefined })).toEqual({ ok: false, reason: "no-match" });
    expect(canGift({ ...ok, match: { active: false, participants: ["alexa", "jules"] } })).toEqual({ ok: false, reason: "no-match" });
    expect(canGift({ ...ok, match: { active: true, participants: ["alexa", "sam"] } })).toEqual({ ok: false, reason: "no-match" });
    expect(canGift({ ...ok, match: { active: true, participants: ["sam", "jules"] } })).toEqual({ ok: false, reason: "no-match" });
  });
  test("blocked", () => {
    expect(canGift({ ...ok, blocked: true })).toEqual({ ok: false, reason: "blocked" });
  });
  test("unavailable recipient: banned, unverified or missing", () => {
    expect(canGift({ ...ok, recipientBanned: true })).toEqual({ ok: false, reason: "unavailable" });
    expect(canGift({ ...ok, recipientVerified: false })).toEqual({ ok: false, reason: "unavailable" });
    expect(canGift({ ...ok, recipientExists: false })).toEqual({ ok: false, reason: "unavailable" });
  });
  test("daily limit", () => {
    expect(canGift({ ...ok, sentToday: 2 })).toEqual({ ok: true });
    expect(canGift({ ...ok, sentToday: 3 })).toEqual({ ok: false, reason: "limit" });
    expect(canGift({ ...ok, sentToday: 9 })).toEqual({ ok: false, reason: "limit" });
  });
  test("recipient already has lifetime", () => {
    expect(canGift({ ...ok, recipientLifetime: true })).toEqual({ ok: false, reason: "already-lifetime" });
  });
  test("gifting yourself is not a match", () => {
    expect(canGift({ ...ok, toUid: "alexa", match: { active: true, participants: ["alexa", "alexa"] } })).toEqual({ ok: false, reason: "no-match" });
  });
});

describe("giftState", () => {
  const now = 1_000_000;
  test("settled statuses pass through", () => {
    for (const status of ["claimed", "declined", "expired", "refunded"] as const) {
      expect(giftState({ status, expiresAt: now - 1 }, now)).toBe(status);
      expect(giftState({ status, expiresAt: now + 1 }, now)).toBe(status);
    }
  });
  test("pending before the deadline", () => {
    expect(giftState({ status: "pending", expiresAt: now + 1 }, now)).toBe("pending");
  });
  test("pending at or past the deadline is expired", () => {
    expect(giftState({ status: "pending", expiresAt: now }, now)).toBe("expired");
    expect(giftState({ status: "pending", expiresAt: now - 1 }, now)).toBe("expired");
  });
  test("unknown status is void", () => {
    expect(giftState({ status: "weird", expiresAt: now + 1 }, now)).toBe("void");
    expect(giftState({ status: "created", expiresAt: now + 1 }, now)).toBe("void");
  });
});
