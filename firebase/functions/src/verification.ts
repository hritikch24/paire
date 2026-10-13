import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { bucket, db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { diditCaptureAvailable, ignoreDiditEvent, ownedPhotoPath, passedLiveCheck, validDiditSignature } from "./lib/didit";
import { VerificationApproval, verificationState } from "./lib/verification";
import { consumeDailyQuota } from "./quota";
import { eraseProviderSession } from "./verificationCleanup";
import { verificationRequired } from "./trust";
import { selfieCheckAvailable } from "./selfie";

const captureAvailable = diditCaptureAvailable;
const samePhotos = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);

/** Only the caller's state; no biometrics, legal identity or rejection evidence. */
export const getVerificationStatus = onCall({ region: REGION, secrets: ["DIDIT_API_KEY"] }, async (request) => {
  const uid = requireAuth(request);
  const [profile, moderation] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`));
  const approval = moderation.get("verification") as VerificationApproval | undefined;
  // Didit when it's configured, otherwise Paire's own selfie check.
  const method = captureAvailable() ? "didit" : selfieCheckAvailable() ? "selfie" : null;
  return { state: verificationState(approval, profile.get("photoUrls")), captureAvailable: method !== null, method, required: moderation.get("cohort") !== "test" && (await verificationRequired()) };
});

/** Freeze exact object generations first, then send the live provider the frozen reference. */
export const beginPhotoVerification = onCall({ region: REGION, secrets: ["DIDIT_API_KEY"], memory: "512MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = requireAuth(request);
  if (request.data?.consent !== true || request.data?.consentVersion !== "photo-check-v1") throw new HttpsError("invalid-argument", "Please agree to the photo check first.");
  if (!captureAvailable()) throw new HttpsError("unavailable", "Live photo checks aren’t available yet.");
  const photos = (await db.doc(`users/${uid}`).get()).get("photoUrls") as unknown;
  if (!Array.isArray(photos) || !photos.length || photos.length > 6 || !photos.every((photo) => typeof photo === "string")) throw new HttpsError("failed-precondition", "Add between one and six real photos first.");
  const storage = bucket();
  const paths = photos.map((photo) => ownedPhotoPath(photo, uid, storage.name));
  if (paths.some((path) => !path)) throw new HttpsError("failed-precondition", "Upload your photos to Paire before starting a check.");
  const attempt = randomUUID(); const now = Date.now(); const lock = db.doc(`verificationLocks/${uid}`);
  const resume = await db.runTransaction(async (tx) => {
    const active = await tx.get(lock);
    if (active.get("expiresAt") > now) {
      if (samePhotos(active.get("originalPhotos"), photos) && typeof active.get("url") === "string") return { url: active.get("url") as string };
      throw new HttpsError("failed-precondition", "A check is already in progress. Finish it or try again after 30 minutes.");
    }
    tx.set(lock, { attempt, expiresAt: now + 30 * 60_000, originalPhotos: photos });
    return null;
  });
  if (resume) return resume;
  const frozen: string[] = [];
  let providerSession: string | undefined;
  try {
    await consumeDailyQuota(uid, "photoChecks", 3);
    let portrait: Buffer | undefined;
    for (let index = 0; index < paths.length; index++) {
      const file = storage.file(paths[index]!); const [metadata] = await file.getMetadata();
      if (!metadata.generation || Number(metadata.size) <= 0 || Number(metadata.size) > (index === 0 ? 2 : 10) * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(metadata.contentType ?? "")) throw new HttpsError("failed-precondition", "Use JPG, PNG or WebP photos. Your first photo must be under 2 MB.");
      const source = storage.file(paths[index]!, { generation: metadata.generation });
      const destination = storage.file(`verified-photos/${uid}/${attempt}/${index}`); const token = randomUUID();
      await source.copy(destination, { preconditionOpts: { ifGenerationMatch: 0 }, metadata: { firebaseStorageDownloadTokens: token }, contentType: metadata.contentType });
      if (index === 0) [portrait] = await destination.download();
      frozen.push(`https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodeURIComponent(destination.name)}?alt=media&token=${token}`);
    }
    const response = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST", headers: { "x-api-key": process.env.DIDIT_API_KEY!, "content-type": "application/json" }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ workflow_id: process.env.DIDIT_WORKFLOW_ID, vendor_data: attempt, portrait_image: portrait!.toString("base64"), metadata: { attempt }, language: "en" })
    });
    if (!response.ok) throw new HttpsError("unavailable", "We couldn’t start your photo check. Please try again.");
    const result = await response.json() as { session_id?: unknown; url?: unknown };
    if (typeof result.session_id === "string" && /^[a-f0-9-]{36}$/.test(result.session_id)) providerSession = result.session_id;
    if (typeof result.session_id !== "string" || !/^[a-f0-9-]{36}$/.test(result.session_id) || typeof result.url !== "string" || new URL(result.url).origin !== "https://verify.didit.me") throw new HttpsError("unavailable", "The photo check couldn’t be opened.");
    await db.runTransaction(async (tx) => {
      const [profile, currentLock] = await tx.getAll(db.doc(`users/${uid}`), lock);
      if (currentLock.get("attempt") !== attempt || !samePhotos(profile.get("photoUrls"), photos)) throw new HttpsError("failed-precondition", "Your photos changed. Start a new check.");
      tx.set(db.doc(`verificationSessions/${result.session_id}`), { uid, attempt, originalPhotos: photos, frozenPhotos: frozen, providerPassed: false, createdAt: now, consentVersion: "photo-check-v1", consentAt: now, expiresAt: now + 24 * 60 * 60_000, providerErasureAt: now + 24 * 60 * 60_000 });
      tx.set(db.doc(`moderation/${uid}`), { verification: { status: "pending", sessionId: result.session_id } }, { merge: true });
      tx.update(lock, { url: result.url });
    });
    return { url: result.url };
  } catch (error) {
    if (providerSession) {
      try { await eraseProviderSession(providerSession); }
      catch { await db.doc(`verificationSessions/${providerSession}`).set({ uid, attempt, approved: false, providerPassed: false, expiresAt: 0, providerErasureAt: Date.now() }); }
    }
    await storage.deleteFiles({ prefix: `verified-photos/${uid}/${attempt}/` }).catch(() => undefined);
    await db.runTransaction(async (tx) => { const current = await tx.get(lock); if (current.get("attempt") === attempt) tx.delete(lock); });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", "We couldn’t start your check. Please try again.");
  }
});

/** Liveness alone never approves every photo: all snapshots also need human review. */
export const diditWebhook = onRequest({ region: REGION, secrets: ["DIDIT_WEBHOOK_SECRET"] }, async (request, response) => {
  if (request.method !== "POST") { response.sendStatus(405); return; }
  if (!validDiditSignature(request.body, request.get("x-signature-v2"), request.get("x-timestamp"), process.env.DIDIT_WEBHOOK_SECRET)) { response.sendStatus(401); return; }
  const event = request.body;
  if (request.get("x-didit-test-webhook") === "true" || event.environment !== "live" || event.application_id !== process.env.DIDIT_APPLICATION_ID || event.workflow_id !== process.env.DIDIT_WORKFLOW_ID) { response.sendStatus(200); return; }
  if (event.webhook_type !== "status.updated" || typeof event.session_id !== "string" || !/^[a-f0-9-]{36}$/.test(event.session_id) || typeof event.event_id !== "string" || event.event_id.length > 100 || !Number.isFinite(event.created_at) || event.created_at <= 0 || event.created_at > Date.now() / 1000 + 300) { response.sendStatus(400); return; }
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`verificationSessions/${event.session_id}`); const session = await tx.get(ref);
      if (!session.exists || event.vendor_data !== session.get("attempt")) return;
      const passed = event.status === "Approved" && event.decision?.session_id === event.session_id && event.decision?.workflow_id === process.env.DIDIT_WORKFLOW_ID && event.decision?.vendor_data === session.get("attempt") && passedLiveCheck(event.decision);
      if (ignoreDiditEvent(session.data()!, event.created_at, event.event_id, passed)) return;
      const moderation = db.doc(`moderation/${session.get("uid")}`); const current = await tx.get(moderation);
      if (current.get("verification.sessionId") !== event.session_id) return;
      tx.update(ref, { providerPassed: passed, providerStatus: String(event.status), eventAt: event.created_at, eventId: event.event_id });
      if (session.get("reviewedAt") && passed) return;
      tx.set(moderation, { verification: { status: ["Declined", "Expired", "Kyc Expired"].includes(event.status) ? "rejected" : "pending", sessionId: event.session_id } }, { merge: true });
    });
    response.sendStatus(200);
  } catch { response.sendStatus(503); }
});

/** Moderator-only adjudication after comparing every frozen photo to the live session. */
export const reviewPhotoVerification = onCall({ region: REGION }, async (request) => {
  const reviewer = requireAuth(request);
  if (request.auth?.token.moderator !== true) throw new HttpsError("permission-denied", "Moderator access is required.");
  const { sessionId, approve, reviewedAllPhotos, authenticPhotos } = request.data ?? {};
  if (typeof sessionId !== "string" || !/^[a-f0-9-]{36}$/.test(sessionId) || typeof approve !== "boolean") throw new HttpsError("invalid-argument", "Choose a valid session and decision.");
  if (approve && (reviewedAllPhotos !== true || authenticPhotos !== true)) throw new HttpsError("failed-precondition", "Review every photo for the same person and generated or face-altered imagery first.");
  await db.runTransaction(async (tx) => {
    const sessionRef = db.doc(`verificationSessions/${sessionId}`); const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError("not-found", "That session is unavailable.");
    const uid = session.get("uid") as string; const profileRef = db.doc(`users/${uid}`); const moderationRef = db.doc(`moderation/${uid}`);
    const [profile, moderation] = await tx.getAll(profileRef, moderationRef);
    if (moderation.get("verification.sessionId") !== sessionId || session.get("expiresAt") <= Date.now() || !profile.exists) throw new HttpsError("failed-precondition", "This session is no longer current.");
    if (approve && (session.get("providerErased") === true || session.get("providerErasing") === true || session.get("providerPassed") !== true || !samePhotos(profile.get("photoUrls"), session.get("originalPhotos")))) throw new HttpsError("failed-precondition", "A successful live check of the current photos is required.");
    const now = Date.now();
    tx.set(moderationRef, { verification: approve ? { schemaVersion: 2, storageBound: true, status: "verified", sessionId, photoUrls: session.get("frozenPhotos"), verifiedAt: now, expiresAt: now + 90 * 86_400_000 } : { status: "rejected", sessionId } }, { merge: true });
    if (approve) tx.update(profileRef, { photoUrls: session.get("frozenPhotos"), updatedAt: now });
    tx.update(sessionRef, { reviewedAt: now, reviewedBy: reviewer, approved: approve, providerErasureAt: now });
    tx.delete(db.doc(`verificationLocks/${uid}`));
    tx.set(db.collection("verificationAudit").doc(), { sessionId, reviewer, approve, createdAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

export const getPhotoReviewQueue = onCall({ region: REGION }, async (request) => {
  requireAuth(request);
  if (request.auth?.token.moderator !== true) throw new HttpsError("permission-denied", "Moderator access is required.");
  const sessions = await db.collection("verificationSessions").where("providerPassed", "==", true).limit(100).get();
  return { sessions: sessions.docs.filter((session) => !session.get("reviewedAt") && !session.get("providerErasing") && !session.get("providerErased") && session.get("expiresAt") > Date.now()).slice(0, 20)
    .map((session) => ({ sessionId: session.id, photos: session.get("frozenPhotos"), providerStatus: session.get("providerStatus") ?? "Approved", expiresAt: session.get("expiresAt") })) };
});
