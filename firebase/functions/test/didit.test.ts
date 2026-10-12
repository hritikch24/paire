import { createHmac } from "crypto";
import { ignoreDiditEvent, ownedPhotoPath, passedLiveCheck, validDiditSignature } from "../src/lib/didit";
const now = 1_800_000_000_000;
it("gives revocation precedence over equal-time or replayed approvals", () => {
  expect(ignoreDiditEvent({ eventAt: 100, eventId: "approved", providerPassed: true }, 100, "revoked", false)).toBe(false);
  expect(ignoreDiditEvent({ eventAt: 100, eventId: "revoked", providerPassed: false }, 100, "approved", true)).toBe(true);
  expect(ignoreDiditEvent({ eventAt: 101 }, 100, "older", false)).toBe(true);
  expect(ignoreDiditEvent({ providerErased: true }, 102, "later", true)).toBe(true);
});
it("authenticates the complete Unicode decision and signed timestamp", () => {
  const value = { status: "Approved", timestamp: now / 1000, user: "José" };
  const signature = createHmac("sha256", "secret").update(JSON.stringify(value)).digest("hex");
  expect(validDiditSignature(value, signature, String(now / 1000), "secret", now)).toBe(true);
  expect(validDiditSignature({ ...value, status: "Declined" }, signature, String(now / 1000), "secret", now)).toBe(false);
  expect(validDiditSignature(value, signature, String(now / 1000), "secret", now + 301000)).toBe(false);
  expect(validDiditSignature(value, signature, String(now / 1000 + 1), "secret", now)).toBe(false);
  expect(validDiditSignature(value, "bad", String(now / 1000), "secret", now)).toBe(false);
});
it("requires liveness, face matching and warning-free approvals rather than just a top-level status", () => {
  const check = { status: "Approved", warnings: [] };
  const valid = { status: "Approved", liveness_checks: [check], face_matches: [check] };
  expect(passedLiveCheck(valid)).toBe(true);
  for (const edits of [{ face_matches: [] }, { liveness_checks: undefined }, { status: "In Review" }, { face_matches: [{ ...check, warnings: ["AI_IMAGE"] }] }]) expect(passedLiveCheck({ ...valid, ...edits })).toBe(false);
});
it("accepts only owned Firebase photo objects, never arbitrary URLs, paths or another member", () => {
  const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/muse.appspot.com/o/${encodeURIComponent(path)}?alt=media`;
  expect(ownedPhotoPath(url("user-uploads/me/photos/one.jpg"), "me", "muse.appspot.com")).toBe("user-uploads/me/photos/one.jpg");
  for (const path of ["user-uploads/other/photos/one.jpg", "user-uploads/me/photos/../one.jpg", "user-uploads/me/photos/folder/one.jpg", "private/me/one.jpg"]) expect(ownedPhotoPath(url(path), "me", "muse.appspot.com")).toBeNull();
  expect(ownedPhotoPath("https://evil.example/a.jpg", "me", "muse.appspot.com")).toBeNull();
  expect(ownedPhotoPath(url("user-uploads/me/photos/one.jpg"), "me", "other-bucket")).toBeNull();
});
