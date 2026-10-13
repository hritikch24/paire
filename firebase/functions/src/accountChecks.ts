import { onCall } from "firebase-functions/v2/https";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { isDisposableEmail } from "./lib/disposableEmail";

/**
 * A member may date only once their email is confirmed (Google sign-in confirms it
 * already). The result is kept in moderation/{uid}.emailVerified, which members
 * can't write; discovery and every dating action read it (trust.ts).
 */
export async function refreshEmailVerification(uid: string): Promise<boolean> {
  const user = await adminAuth().getUser(uid).catch(() => null);
  const confirmed = Boolean(user?.email && user.emailVerified && !isDisposableEmail(user.email));
  const ref = db.doc(`moderation/${uid}`);
  if ((await ref.get()).get("emailVerified") !== confirmed) await ref.set({ emailVerified: confirmed }, { merge: true });
  return confirmed;
}

/** Called by the app once the member opens their confirmation link. */
export const syncAccountChecks = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const emailVerified = await refreshEmailVerification(uid);
  const user = await adminAuth().getUser(uid).catch(() => null);
  return { emailVerified, disposableEmail: isDisposableEmail(user?.email) };
});
