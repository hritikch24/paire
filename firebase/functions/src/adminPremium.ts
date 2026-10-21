import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminAuth, db } from "./admin";
import { billingEnabled, webPassExpiry } from "./billing";
import { REGION } from "./config";
import { requireSupportOperator } from "./supportAdmin";

const DAYS = 30;
const DAY_MS = 86_400_000;
const future = (value: unknown, now: number) => typeof value === "number" && Number.isFinite(value) && value > now ? value : 0;

async function recipient(value: unknown) {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new HttpsError("invalid-argument", "Enter the member's login email.");
  const account = await adminAuth().getUserByEmail(value.trim().toLowerCase()).catch((error) => {
    if ((error as { code?: string }).code === "auth/user-not-found") throw new HttpsError("not-found", "No member has that email.");
    throw error;
  });
  if (account.disabled || account.uid.startsWith("support_") || account.customClaims?.supportSession !== undefined) throw new HttpsError("failed-precondition", "That account is unavailable.");
  return account;
}

export const adminPreviewPlusGrant = onCall({ region: REGION }, async (request) => {
  await requireSupportOperator(request);
  const account = await recipient(request.data?.email);
  const [profile, billing, mod, web] = await Promise.all([db.doc(`users/${account.uid}`).get(), db.doc(`billing/${account.uid}`).get(), db.doc(`moderation/${account.uid}`).get(), webPassExpiry(account.uid)]);
  if (!profile.exists || mod.get("status") === "banned") throw new HttpsError("failed-precondition", "That member is unavailable.");
  const now = Date.now(), startsAt = Math.max(now, future(billing.get("expiresAt"), now), web);
  return { uid: account.uid, email: account.email, name: String(profile.get("displayName") || account.displayName || "Member"), addedDays: DAYS, startsAt, expiresAt: startsAt + DAYS * DAY_MS };
});

/** Complimentary access is separate from payment recoveries and is never money received. */
export const adminGrantPlusMonth = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const actorUid = await requireSupportOperator(request);
  if (!billingEnabled()) throw new HttpsError("failed-precondition", "Plus access is currently switched off.");
  const { email, requestId, reason } = request.data ?? {};
  if (typeof requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId)) throw new HttpsError("invalid-argument", "A valid grant reference is required. Reopen the form and try again.");
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) throw new HttpsError("invalid-argument", "The note must be at most 500 characters.");
  const account = await recipient(email);
  const uid = account.uid;
  const auditRef = db.doc(`billingSupportAudit/complimentary-${actorUid}-${requestId}`);
  return db.runTransaction(async (tx) => {
    const [audit, operator, user, billing, ledger, moderation, unlock] = await tx.getAll(auditRef, db.doc(`supportOperators/${actorUid}`), db.doc(`users/${uid}`), db.doc(`billing/${uid}`), db.doc(`webPassLedger/${uid}`), db.doc(`moderation/${uid}`), db.doc(`chatUnlocks/${uid}`));
    if (operator.get("enabled") !== true) throw new HttpsError("permission-denied", "Owner access is required.");
    if (audit.exists) {
      if (audit.get("uid") !== uid) throw new HttpsError("already-exists", "This grant reference was already used for another member.");
      return { uid, email: account.email, addedDays: DAYS, startsAt: audit.get("startsAt") as number, expiresAt: audit.get("expiresAt") as number, alreadyGranted: true };
    }
    if (!user.exists || moderation.get("status") === "banned") throw new HttpsError("failed-precondition", "That member is unavailable.");
    const now = Date.now();
    const startsAt = Math.max(now, future(billing.get("expiresAt"), now), future(ledger.get("until"), now), await webPassExpiry(uid, now, tx));
    const expiresAt = startsAt + DAYS * DAY_MS;
    tx.create(auditRef, { uid, action: "goodwill-grant", status: "active", amountReportedPaise: 0, currency: "INR", days: DAYS, startsAt, expiresAt, createdAt: now, actorUid, reason: typeof reason === "string" && reason.trim() ? reason.trim() : "Owner complimentary month", requestId });
    tx.set(db.doc(`complimentaryPlusGrants/${uid}`), { status: "active", expiresAt, updatedAt: now, grantedBy: actorUid, lastAuditId: auditRef.id }, { merge: true });
    tx.set(billing.ref, { expiresAt, checkedAt: now }, { merge: true });
    tx.set(ledger.ref, { until: expiresAt, updatedAt: now }, { merge: true });
    tx.set(moderation.ref, { chatAccess: { unlimited: unlock.get("status") === "active", premiumUntil: expiresAt, updatedAt: now } }, { merge: true });
    return { uid, email: account.email, addedDays: DAYS, startsAt, expiresAt, alreadyGranted: false };
  });
});
