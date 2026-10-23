jest.mock("../src/admin", () => ({ db: {} }));
import { limitsFor } from "../src/premium";

it("keeps the free allowance and enables extras only for a recent unexpired server snapshot", () => {
  const old = process.env.MUSE_BILLING_ENABLED;
  const now = Date.now(); const approved = { checkedAt: now, expiresAt: now + 60000 };
  try {
    process.env.MUSE_BILLING_ENABLED = "false";
    expect(limitsFor(approved)).toEqual({ likesPerDay: 10, supersPerDay: 1, priority: false });
    process.env.MUSE_BILLING_ENABLED = "true";
    expect(limitsFor(approved)).toEqual({ likesPerDay: 100, supersPerDay: 5, priority: true });
    expect(limitsFor({ ...approved, expiresAt: now - 1 })).toEqual({ likesPerDay: 10, supersPerDay: 1, priority: false });
    expect(limitsFor({ ...approved, checkedAt: now - 601000 })).toEqual({ likesPerDay: 10, supersPerDay: 1, priority: false });
    expect(limitsFor(undefined)).toEqual({ likesPerDay: 10, supersPerDay: 1, priority: false });
  } finally {
    if (old === undefined) delete process.env.MUSE_BILLING_ENABLED;
    else process.env.MUSE_BILLING_ENABLED = old;
  }
});

it("unlimited monthly/lifetime likes require fresh server access, while Super Likes keep their allowance", () => {
  const old = process.env.MUSE_BILLING_ENABLED, now = Date.now();
  try {
    process.env.MUSE_BILLING_ENABLED = "true";
    expect(limitsFor({ checkedAt: now, expiresAt: now + 60000, unlimitedLikesUntil: now + 60000 })).toEqual({ likesPerDay: null, supersPerDay: 5, priority: true });
    expect(limitsFor({ checkedAt: now, expiresAt: 0, lifetime: true })).toEqual({ likesPerDay: null, supersPerDay: 5, priority: true });
    expect(limitsFor({ checkedAt: now, expiresAt: now + 60000, unlimitedLikesUntil: now - 1 }).likesPerDay).toBe(100);
    expect(limitsFor({ checkedAt: now - 601000, lifetime: true }).likesPerDay).toBe(10);
    process.env.MUSE_BILLING_ENABLED = "false";
    expect(limitsFor({ checkedAt: now, lifetime: true }).likesPerDay).toBe(10);
  } finally { if (old === undefined) delete process.env.MUSE_BILLING_ENABLED; else process.env.MUSE_BILLING_ENABLED = old; }
});
