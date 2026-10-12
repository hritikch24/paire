import { verificationState } from "../src/lib/verification";

const now = 1_000_000;
const photos = ["https://example.com/a.jpg", "https://example.com/b.jpg"];
const approved = { schemaVersion: 2, storageBound: true, status: "verified", photoUrls: photos, verifiedAt: now - 100, expiresAt: now + 100 };

describe("verification approval", () => {
  it("accepts only current, unexpired server-approved photos", () => {
    expect(verificationState(approved, photos, now)).toBe("verified");
  });
  it("never carries a badge onto replaced, added, removed or reordered photos", () => {
    for (const changed of [["fake.jpg", photos[1]], [...photos, "extra.jpg"], photos.slice(0, 1), [...photos].reverse(), []]) {
      expect(verificationState(approved, changed, now)).toBe("needs_recheck");
    }
  });
  it("rejects expired, future-dated and malformed approvals", () => {
    for (const change of [
      { expiresAt: now }, { expiresAt: 0 }, { expiresAt: Infinity }, { expiresAt: "forever" },
      { verifiedAt: now + 1 }, { verifiedAt: NaN }, { verifiedAt: 0 }, { verifiedAt: undefined },
      { photoUrls: undefined }, { photoUrls: [null, photos[1]] },
       { schemaVersion: 1 }, { storageBound: false }, { storageBound: undefined }
    ]) expect(verificationState({ ...approved, ...change }, photos, now)).toBe("needs_recheck");
  });
  it("does not infer verification from profile flags or unknown states", () => {
    expect(verificationState(undefined, photos, now)).toBe("unverified");
    expect(verificationState({ status: "approved" }, photos, now)).toBe("unverified");
    expect(verificationState({ status: "pending" }, photos, now)).toBe("pending");
    expect(verificationState({ status: "rejected" }, photos, now)).toBe("rejected");
  });
});
