import {
  firstName,
  giftAcceptedPushCopy,
  giftClaimVerdict,
  giftReversal,
  giftSweepVerdict,
  giftWindow,
  REFUND_CLAIM_MS,
  shouldRevokeGift
} from "../src/lib/giftLifecycle";

const DAY = 86_400_000;
const now = 1_761_000_000_000;

describe("giftWindow", () => {
  test("no pass: the gift starts now and runs its days", () => {
    expect(giftWindow({ now, billingExpiresAt: 0, complimentaryExpiresAt: 0, days: 7 })).toEqual({ startsAt: now, endsAt: now + 7 * DAY });
  });

  test("a 20-day paid pass running: the gift starts when it ends, so the pass stays whole", () => {
    const paidUntil = now + 20 * DAY;
    expect(giftWindow({ now, billingExpiresAt: paidUntil, complimentaryExpiresAt: 0, days: 60 })).toEqual({ startsAt: paidUntil, endsAt: paidUntil + 60 * DAY });
  });

  test("a complimentary expiry later than billing: the gift starts after that", () => {
    const comp = now + 40 * DAY;
    expect(giftWindow({ now, billingExpiresAt: now + 10 * DAY, complimentaryExpiresAt: comp, days: 1 })).toEqual({ startsAt: comp, endsAt: comp + DAY });
  });

  test("expiries in the past and junk values never start the gift early or late", () => {
    expect(giftWindow({ now, billingExpiresAt: now - 5 * DAY, complimentaryExpiresAt: Number.NaN, days: 1 })).toEqual({ startsAt: now, endsAt: now + DAY });
    expect(giftWindow({ now, billingExpiresAt: Number.POSITIVE_INFINITY, complimentaryExpiresAt: 0, days: 1 })).toEqual({ startsAt: now, endsAt: now + DAY });
  });
});

describe("the revoke condition", () => {
  const claimed = { status: "claimed", endsAt: now + 7 * DAY, previousCompExpiry: now + 2 * DAY, previousCompStatus: "active" };

  test("revoke only while the complimentary expiry is still exactly what this gift set", () => {
    expect(shouldRevokeGift(claimed, { expiresAt: claimed.endsAt })).toBe(true);
    expect(shouldRevokeGift(claimed, { expiresAt: claimed.endsAt + DAY })).toBe(false);
    expect(shouldRevokeGift(claimed, { expiresAt: claimed.endsAt - 1 })).toBe(false);
    expect(shouldRevokeGift(claimed, undefined)).toBe(false);
  });

  test("a gift without a recorded end never matches (not even a missing expiry)", () => {
    expect(shouldRevokeGift({ status: "claimed" }, {})).toBe(false);
    expect(shouldRevokeGift({ status: "claimed" }, undefined)).toBe(false);
    expect(shouldRevokeGift({ status: "pending", endsAt: 5 }, { expiresAt: 5 })).toBe(false);
  });

  test("claimed and unchanged: restore the previous expiry and status", () => {
    expect(giftReversal(claimed, { expiresAt: claimed.endsAt })).toEqual({ action: "restore", expiresAt: now + 2 * DAY, status: "active" });
  });

  test("restoring is clamped: it never extends the grant", () => {
    const odd = { ...claimed, previousCompExpiry: claimed.endsAt + 9 * DAY };
    expect(giftReversal(odd, { expiresAt: claimed.endsAt })).toEqual({ action: "restore", expiresAt: claimed.endsAt, status: "active" });
  });

  test("no complimentary record before the gift: restore to nothing", () => {
    const fresh = { status: "claimed", endsAt: claimed.endsAt, previousCompExpiry: 0, previousCompStatus: null };
    expect(giftReversal(fresh, { expiresAt: claimed.endsAt })).toEqual({ action: "restore", expiresAt: 0, status: "ended" });
  });

  test("changed since (owner grant, another gift): flag for review and leave the grant", () => {
    expect(giftReversal(claimed, { expiresAt: claimed.endsAt + 30 * DAY })).toEqual({ action: "review" });
    expect(giftReversal({ status: "claimed" }, undefined)).toEqual({ action: "review" });
  });

  test("never claimed: refunded; our own refunds close quietly; repeats change nothing", () => {
    expect(giftReversal({ status: "pending" }, undefined)).toEqual({ action: "refund-pending" });
    for (const status of ["declined", "expired", "void"]) expect(giftReversal({ status }, undefined)).toEqual({ action: "close" });
    expect(giftReversal({ status: "refunded" }, undefined)).toEqual({ action: "none" });
    expect(giftReversal({ ...claimed, needsReview: true }, { expiresAt: claimed.endsAt + DAY })).toEqual({ action: "none" });
    expect(giftReversal({ status: "something-else" }, undefined)).toEqual({ action: "review" });
  });
});

describe("giftClaimVerdict", () => {
  const ok = {
    exists: true,
    callerUid: "jules",
    gift: { fromUid: "alexa", toUid: "jules", status: "pending", expiresAt: now + DAY },
    match: { active: true, participants: ["alexa", "jules"] },
    recipientBanned: false,
    lifetime: false,
    now
  };

  test("the recipient claims a pending, live gift", () => {
    expect(giftClaimVerdict(ok)).toBe("ok");
  });

  test("each refusal in order", () => {
    expect(giftClaimVerdict({ ...ok, exists: false })).toBe("not-found");
    expect(giftClaimVerdict({ ...ok, callerUid: "alexa" })).toBe("not-recipient");
    expect(giftClaimVerdict({ ...ok, callerUid: "stranger" })).toBe("not-recipient");
    expect(giftClaimVerdict({ ...ok, gift: { ...ok.gift, status: "claimed" } })).toBe("already-claimed");
    expect(giftClaimVerdict({ ...ok, gift: { ...ok.gift, status: "declined" } })).toBe("closed");
    expect(giftClaimVerdict({ ...ok, gift: { ...ok.gift, expiresAt: now } })).toBe("expired");
    expect(giftClaimVerdict({ ...ok, match: undefined })).toBe("no-match");
    expect(giftClaimVerdict({ ...ok, match: { active: false, participants: ["alexa", "jules"] } })).toBe("no-match");
    expect(giftClaimVerdict({ ...ok, match: { active: true, participants: ["alexa", "other"] } })).toBe("no-match");
    expect(giftClaimVerdict({ ...ok, recipientBanned: true })).toBe("unavailable");
    expect(giftClaimVerdict({ ...ok, lifetime: true })).toBe("lifetime");
  });
});

describe("giftSweepVerdict", () => {
  const live = { status: "pending", expiresAt: now + DAY, now, matchActive: true, recipientExists: true, recipientBanned: false };

  test("a live pending gift stays", () => {
    expect(giftSweepVerdict(live)).toBe("keep");
  });

  test("past its deadline it expires", () => {
    expect(giftSweepVerdict({ ...live, expiresAt: now })).toBe("expire");
    expect(giftSweepVerdict({ ...live, expiresAt: now - 1, matchActive: false })).toBe("expire");
  });

  test("an ended match, a missing or banned recipient voids it", () => {
    expect(giftSweepVerdict({ ...live, matchActive: false })).toBe("void");
    expect(giftSweepVerdict({ ...live, recipientExists: false })).toBe("void");
    expect(giftSweepVerdict({ ...live, recipientBanned: true })).toBe("void");
  });

  test("anything not pending is left alone", () => {
    for (const status of ["claimed", "declined", "expired", "void", "refunded"]) {
      expect(giftSweepVerdict({ ...live, status, expiresAt: now - DAY, matchActive: false })).toBe("keep");
    }
  });
});

describe("the gifter's push", () => {
  test("names only the first name, and only with previews on", () => {
    expect(firstName("  Jules  Verne ")).toBe("Jules");
    expect(firstName("")).toBeNull();
    expect(firstName(42)).toBeNull();
    expect(giftAcceptedPushCopy(true, "Jules Verne")).toEqual({ title: "Gift accepted 🎁", body: "Jules accepted your gift." });
    expect(giftAcceptedPushCopy(false, "Jules Verne")).toEqual({ title: "Paire", body: "Your gift was accepted." });
    expect(giftAcceptedPushCopy(undefined, "Jules")).toEqual({ title: "Paire", body: "Your gift was accepted." });
    expect(giftAcceptedPushCopy(true, null)).toEqual({ title: "Paire", body: "Your gift was accepted." });
  });

  test("a refund claim lasts two minutes", () => {
    expect(REFUND_CLAIM_MS).toBe(120_000);
  });
});
