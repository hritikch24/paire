import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";

export const isSupportSession = (request: CallableRequest<unknown>) => request.auth?.token.supportSession !== undefined;

export function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Please sign in again.");
  }
  if (isSupportSession(request) || uid.startsWith("support_")) {
    throw new HttpsError("permission-denied", "Support sessions are read-only. Return to your admin account to make changes.");
  }
  return uid;
}

/** Only explicitly reviewed read endpoints opt into support access. */
export async function requireReadAuth(request: CallableRequest<unknown>): Promise<string> {
  if (!isSupportSession(request)) return requireAuth(request);
  const token = request.auth!.token;
  const id = token.supportSession;
  if (typeof id !== "string" || !/^[a-zA-Z0-9]{20}$/.test(id)) throw new HttpsError("permission-denied", "Invalid support session.");
  const session = await db.doc(`supportSessions/${id}`).get();
  const operator = typeof session.get("actorUid") === "string" ? await db.doc(`supportOperators/${session.get("actorUid")}`).get() : null;
  if (!session.exists || session.get("supportUid") !== request.auth!.uid || session.get("targetUid") !== token.supportTarget
    || session.get("expiresAt") !== token.supportExpiresAt || session.get("expiresAt") <= Date.now()
    || session.get("endedAt") !== null || operator?.get("enabled") !== true) {
    throw new HttpsError("permission-denied", "This support session has ended. Open a new session from Member admin.");
  }
  return session.get("targetUid") as string;
}
