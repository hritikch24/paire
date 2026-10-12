import { callFunction } from "./firebase";

export type VerificationState = "unverified" | "pending" | "verified" | "rejected" | "needs_recheck";
export type VerificationStatus = { state: VerificationState; captureAvailable: boolean; required: boolean };

export function fetchVerificationStatus(): Promise<VerificationStatus> {
  return callFunction<VerificationStatus>("getVerificationStatus");
}

export function beginPhotoVerification(): Promise<{ url: string }> {
  return callFunction<{ url: string }>("beginPhotoVerification", { consent: true, consentVersion: "photo-check-v1" }, 90_000);
}
