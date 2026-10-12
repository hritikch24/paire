import { CallableRequest, HttpsError } from "firebase-functions/v2/https";

export function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Please sign in again.");
  }
  return uid;
}
