import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { requireAuth, requireReadAuth, isSupportSession } from "./lib/auth";
import { consumeDailyQuota } from "./quota";

const SESSION_MS = 15 * 60_000;
const RETENTION_MS = 365 * 24 * 60 * 60_000;
const validUid = (uid: unknown): uid is string => typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid);

async function requireSupportOperator(request: CallableRequest<unknown>): Promise<string> {
  const uid = requireAuth(request);
  if (request.auth?.token.moderator !== true || request.auth.token.supportAccess !== true) throw new HttpsError("permission-denied", "Owner support access is required.");
  const [account, operator] = await Promise.all([adminAuth().getUser(uid), db.doc(`supportOperators/${uid}`).get()]);
  if (account.disabled || account.customClaims?.moderator !== true || account.customClaims.supportAccess !== true || operator.get("enabled") !== true) throw new HttpsError("permission-denied", "Owner support access is required.");
  return uid;
}

export const adminStartSupportSession = onCall({ region: REGION }, async (request) => {
  const actorUid = await requireSupportOperator(request);
  const authTime = Number(request.auth?.token.auth_time) * 1000;
  if (!Number.isFinite(authTime) || Date.now() - authTime > SESSION_MS || authTime > Date.now() + 60_000) throw new HttpsError("failed-precondition", "Sign out and sign back in to your admin account before opening support access.");
  const { uid, reason } = (request.data ?? {}) as { uid?: unknown; reason?: unknown };
  if (!validUid(uid) || uid === actorUid) throw new HttpsError("invalid-argument", "Choose another member.");
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 500) throw new HttpsError("invalid-argument", "Enter a support reason or ticket reference (10–500 characters).");
  const [target, profile] = await Promise.all([adminAuth().getUser(uid), db.doc(`users/${uid}`).get()]);
  if (target.disabled) throw new HttpsError("failed-precondition", "That member's account is unavailable.");
  if (target.customClaims?.moderator === true || target.customClaims?.supportAccess === true || target.customClaims?.supportSession !== undefined) throw new HttpsError("permission-denied", "Staff and support accounts cannot be opened as members.");
  await consumeDailyQuota(actorUid, "supportStarts", 30);
  const ref = db.collection("supportSessions").doc();
  const supportUid = `support_${ref.id}`;
  const expiresAt = Date.now() + SESSION_MS;
  // Audit must exist before any usable credential is returned. Never mint the member's identity.
  await ref.create({ actorUid, targetUid: uid, supportUid, reason: reason.trim(), startedAt: Date.now(), expiresAt, endedAt: null, identityDeleted: false });
  try {
    const claims = { supportIdentity: true, supportSession: ref.id, supportTarget: uid, supportExpiresAt: expiresAt, moderator: false, supportAccess: false };
    await adminAuth().createUser({ uid: supportUid, displayName: "Paire support session" });
    // Persist the restriction even if someone adds a sign-in provider to this disposable identity.
    await adminAuth().setCustomUserClaims(supportUid, claims);
    const token = await adminAuth().createCustomToken(supportUid, claims);
    return { token, sessionId: ref.id, uid, name: String(profile.get("displayName") ?? target.displayName ?? "Member"), email: target.email ?? null, metadata: { creationTime: target.metadata.creationTime, lastSignInTime: target.metadata.lastSignInTime ?? null }, emailVerified: target.emailVerified, expiresAt };
  } catch (error) {
    await ref.update({ endedAt: Date.now(), endReason: "token-failed" });
    throw error;
  }
});

export const getSupportSessionState = onCall({ region: REGION }, async (request) => {
  if (!isSupportSession(request)) throw new HttpsError("permission-denied", "A support session is required.");
  await requireReadAuth(request);
  return { expiresAt: request.auth!.token.supportExpiresAt };
});

export const adminEndSupportSession = onCall({ region: REGION }, async (request) => {
  let id: unknown;
  if (isSupportSession(request)) {
    await requireReadAuth(request);
    id = request.auth!.token.supportSession;
  } else {
    await requireSupportOperator(request);
    id = (request.data as { sessionId?: unknown } | null)?.sessionId;
  }
  if (typeof id !== "string" || !/^[a-zA-Z0-9]{20}$/.test(id)) throw new HttpsError("invalid-argument", "Invalid support session.");
  const ref = db.doc(`supportSessions/${id}`);
  const session = await ref.get();
  if (!session.exists) throw new HttpsError("not-found", "Session not found.");
  if (!session.get("endedAt")) await ref.update({ endedAt: Date.now(), endReason: "closed" });
  await deleteSupportIdentity(session.get("supportUid") as string);
  await ref.update({ identityDeleted: true });
  return { ended: true };
});

export const adminGetSupportHistory = onCall({ region: REGION }, async (request) => {
  await requireSupportOperator(request);
  const uid = (request.data as { uid?: unknown } | null)?.uid;
  if (!validUid(uid)) throw new HttpsError("invalid-argument", "Invalid member.");
  const sessions = await db.collection("supportSessions").where("targetUid", "==", uid).orderBy("startedAt", "desc").limit(20).get();
  return { sessions: sessions.docs.map((doc) => ({ id: doc.id, actorUid: doc.get("actorUid"), reason: doc.get("reason"), startedAt: doc.get("startedAt"), expiresAt: doc.get("expiresAt"), endedAt: doc.get("endedAt") })) };
});

async function deleteSupportIdentity(uid: string) {
  try { await adminAuth().deleteUser(uid); }
  catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; }
}

/** Expired credentials stay unusable via live rules even before this daily cleanup. */
export const cleanupSupportSessions = onSchedule({ region: REGION, schedule: "every 24 hours" }, async () => {
  const expired = await db.collection("supportSessions").where("identityDeleted", "==", false).where("expiresAt", "<=", Date.now()).limit(200).get();
  for (const session of expired.docs) {
    await deleteSupportIdentity(session.get("supportUid") as string);
    await session.ref.update({ identityDeleted: true });
  }
  const old = await db.collection("supportSessions").where("startedAt", "<", Date.now() - RETENTION_MS).limit(200).get();
  for (const session of old.docs) {
    await deleteSupportIdentity(session.get("supportUid") as string);
    await session.ref.delete();
  }
});
