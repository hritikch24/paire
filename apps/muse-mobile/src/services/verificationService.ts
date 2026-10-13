import { callFunction } from "./firebase";

export type VerificationState = "unverified" | "pending" | "verified" | "rejected" | "needs_recheck";
/** "selfie": Paire's own live selfie check; "didit": the Didit provider; null: unavailable. */
export type VerificationMethod = "selfie" | "didit" | null;
export type VerificationStatus = { state: VerificationState; captureAvailable: boolean; method?: VerificationMethod; required: boolean };
export type SelfiePose = { id: string; emoji: string; label: string };

export const SELFIE_CONSENT_VERSION = "selfie-check-v1";

export function fetchVerificationStatus(): Promise<VerificationStatus> {
  return callFunction<VerificationStatus>("getVerificationStatus");
}

export function beginPhotoVerification(): Promise<{ url: string }> {
  return callFunction<{ url: string }>("beginPhotoVerification", { consent: true, consentVersion: "photo-check-v1" }, 90_000);
}

export function startSelfieCheck(): Promise<{ attempt: string; pose: SelfiePose; expiresAt: number }> {
  return callFunction("startSelfieCheck", { consent: true, consentVersion: SELFIE_CONSENT_VERSION });
}

export function submitSelfieCheck(attempt: string, image: string): Promise<{ approved: boolean; reason?: string }> {
  return callFunction("submitSelfieCheck", { attempt, image }, 120_000);
}
