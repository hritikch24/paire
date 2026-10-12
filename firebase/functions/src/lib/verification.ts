/** Provider approvals live in moderation/{uid}, which clients cannot write. */
export type VerificationState = "unverified" | "pending" | "verified" | "rejected" | "needs_recheck";

export type VerificationApproval = {
  schemaVersion?: unknown;
  storageBound?: unknown;
  status?: unknown;
  photoUrls?: unknown;
  verifiedAt?: unknown;
  expiresAt?: unknown;
};

/** Fail closed: an old approval never verifies newly added/reordered photos. */
export function verificationState(
  approval: VerificationApproval | undefined,
  currentPhotos: unknown,
  now = Date.now()
): VerificationState {
  if (!approval || typeof approval !== "object") return "unverified";
  if (approval.status === "pending" || approval.status === "rejected") return approval.status;
  if (approval.status !== "verified") return "unverified";
  if (
    approval.schemaVersion !== 2 || approval.storageBound !== true ||
    !Array.isArray(currentPhotos) || !currentPhotos.length || currentPhotos.length > 6 ||
    !currentPhotos.every((photo) => typeof photo === "string" && photo.length > 0) ||
    !Array.isArray(approval.photoUrls) ||
    currentPhotos.length !== approval.photoUrls.length ||
    !currentPhotos.every((photo, index) => photo === (approval.photoUrls as unknown[])[index]) ||
    typeof approval.verifiedAt !== "number" || !Number.isFinite(approval.verifiedAt) ||
    approval.verifiedAt <= 0 || approval.verifiedAt > now ||
    typeof approval.expiresAt !== "number" || !Number.isFinite(approval.expiresAt) ||
    approval.expiresAt <= now || approval.expiresAt <= approval.verifiedAt
  ) return "needs_recheck";
  return "verified";
}
