jest.mock("../src/admin", () => ({ db: {} }));
import { limitsFor } from "../src/premium";

it("keeps the free allowance and enables extras only for a recent unexpired server snapshot", () => {
  const old = process.env.MUSE_BILLING_ENABLED;
  const now = Date.now(); const approved = { checkedAt: now, expiresAt: now + 60000 };
  try {
    process.env.MUSE_BILLING_ENABLED = "false";
    expect(limitsFor(approved)).toEqual({ likesPerDay: 25, supersPerDay: 1, priority: false });
    process.env.MUSE_BILLING_ENABLED = "true";
    expect(limitsFor(approved)).toEqual({ likesPerDay: 100, supersPerDay: 5, priority: true });
    expect(limitsFor({ ...approved, expiresAt: now - 1 })).toEqual({ likesPerDay: 25, supersPerDay: 1, priority: false });
    expect(limitsFor({ ...approved, checkedAt: now - 601000 })).toEqual({ likesPerDay: 25, supersPerDay: 1, priority: false });
    expect(limitsFor(undefined)).toEqual({ likesPerDay: 25, supersPerDay: 1, priority: false });
  } finally {
    if (old === undefined) delete process.env.MUSE_BILLING_ENABLED;
    else process.env.MUSE_BILLING_ENABLED = old;
  }
});
