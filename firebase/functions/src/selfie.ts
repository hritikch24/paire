import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { bucket, db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { diditCaptureAvailable, ownedPhotoPath } from "./lib/didit";
import { decodeImage, detectFaces, faceFingerprint, similarity } from "./lib/faces";
import { askAiForJson, geminiEnabled } from "./lib/llm";
import {
  parseSelfieAiReply, PhotoMatch, poseById, randomPose, SELFIE_AI_SYSTEM, SELFIE_CHECK_TTL_MS, SELFIE_CHECKS_PER_DAY,
  SELFIE_CONSENT_VERSION, SELFIE_STARTS_PER_DAY, SELFIE_TRIES_PER_ATTEMPT, selfieAiPrompt, selfieDecision, VERIFIED_FOR_MS
} from "./lib/selfieCheck";
import { consumeDailyQuota } from "./quota";

/**
 * Paire's free photo check, when Didit isn't configured. It needs Gemini (the
 * consent text names Google) for the pose and live-photo checks.
 */
export const selfieCheckAvailable = () => process.env.MUSE_VERIFICATION_ENABLED === "true" && geminiEnabled() && !diditCaptureAvailable();

const MAX_SELFIE_BYTES = 6 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const samePhotos = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);

function currentPhotoPaths(photos: unknown, uid: string): string[] {
  if (!Array.isArray(photos) || !photos.length || photos.length > 6 || !photos.every((photo) => typeof photo === "string")) {
    throw new HttpsError("failed-precondition", "Add a clear photo of you first.", { reason: "photos-required" });
  }
  const paths = photos.map((photo) => ownedPhotoPath(photo, uid, bucket().name));
  if (paths.some((path) => !path)) throw new HttpsError("failed-precondition", "Upload your photos to Paire before starting a check.");
  return paths as string[];
}

/**
 * Step 1: agree, get a random pose. The pose must show in a selfie taken within
 * 10 minutes, and asking again during that time returns the same pose: it can't be
 * re-rolled until it matches an old photo.
 */
export const startSelfieCheck = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  if (request.data?.consent !== true || request.data?.consentVersion !== SELFIE_CONSENT_VERSION) throw new HttpsError("invalid-argument", "Please agree to the photo check first.");
  if (!selfieCheckAvailable()) throw new HttpsError("unavailable", "Photo checks aren’t available right now.");
  const photos = (await db.doc(`users/${uid}`).get()).get("photoUrls");
  currentPhotoPaths(photos, uid);
  const lockRef = db.doc(`verificationLocks/${uid}`);
  const current = await lockRef.get();
  const active = current.get("expiresAt") > Date.now();
  const currentPose = poseById(current.get("pose"));
  if (active && current.get("method") === "selfie" && currentPose && samePhotos(current.get("originalPhotos"), photos)) {
    return { attempt: current.get("attempt") as string, pose: currentPose, expiresAt: current.get("expiresAt") as number };
  }
  if (active && current.get("method") !== "selfie") throw new HttpsError("failed-precondition", "A check is already in progress. Finish it or try again after 30 minutes.");
  await consumeDailyQuota(uid, "selfieStarts", SELFIE_STARTS_PER_DAY);
  const attempt = randomUUID();
  const pose = randomPose();
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const latest = await tx.get(lockRef);
    if (latest.get("expiresAt") > now && latest.get("attempt") !== current.get("attempt")) throw new HttpsError("failed-precondition", "A check is already in progress. Try again in a moment.");
    tx.set(lockRef, { attempt, method: "selfie", pose: pose.id, tries: 0, originalPhotos: photos, consentVersion: SELFIE_CONSENT_VERSION, consentAt: now, expiresAt: now + SELFIE_CHECK_TTL_MS });
  });
  return { attempt, pose, expiresAt: now + SELFIE_CHECK_TTL_MS };
});

async function matchPhotos(selfie: Buffer, photos: Buffer[]): Promise<{ selfieFaces: number; matches: PhotoMatch[] }> {
  const selfieImage = await decodeImage(selfie);
  // The member is the biggest face. Small faces in the background are fine; a second
  // face nearly as big means two people are in the shot.
  const area = (face: { width: number; height: number }) => face.width * face.height;
  const selfieFaces = (await detectFaces(selfieImage)).sort((a, b) => area(b) - area(a));
  const prominent = selfieFaces.filter((face) => area(face) >= 0.4 * area(selfieFaces[0]));
  if (prominent.length !== 1) return { selfieFaces: prominent.length, matches: [] };
  const mine = await faceFingerprint(selfieImage, prominent[0]);
  const matches: PhotoMatch[] = [];
  for (const photo of photos) {
    const image = await decodeImage(photo);
    const faces = (await detectFaces(image)).slice(0, 8);
    let best: number | null = null;
    for (const face of faces) best = Math.max(best ?? -1, similarity(mine, await faceFingerprint(image, face)));
    matches.push({ faces: faces.length, best });
  }
  return { selfieFaces: 1, matches };
}

/** Smaller copies for the AI: enough detail to judge a pose, far fewer tokens. */
async function forAi(bytes: Buffer): Promise<{ mimeType: string; data: Buffer }> {
  const sharp = (await import("sharp")).default;
  return { mimeType: "image/jpeg", data: await sharp(bytes).rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer() };
}

/**
 * Step 2: the selfie. Approval freezes exact copies of the checked photos (like the
 * Didit flow), so changing a photo later needs a fresh check. The selfie itself is
 * never stored: it exists only in memory for this request.
 */
// One check at a time per instance: the face models aren't shared across requests, and each check holds several decoded photos in memory.
export const submitSelfieCheck = onCall({ region: REGION, memory: "1GiB", cpu: 1, concurrency: 1, maxInstances: 20, timeoutSeconds: 120 }, async (request) => {
  const uid = requireAuth(request);
  const { attempt, image } = (request.data ?? {}) as { attempt?: unknown; image?: unknown };
  if (typeof attempt !== "string" || !/^[a-f0-9-]{36}$/.test(attempt) || typeof image !== "string" || image.length > Math.ceil(MAX_SELFIE_BYTES * 4 / 3)) {
    throw new HttpsError("invalid-argument", "Take your selfie again.");
  }
  if (!selfieCheckAvailable()) throw new HttpsError("unavailable", "Photo checks aren’t available right now.");
  const lockRef = db.doc(`verificationLocks/${uid}`);
  const selfie = Buffer.from(image.replace(/^data:image\/[a-z]+;base64,/, ""), "base64");
  if (!selfie.length || selfie.length > MAX_SELFIE_BYTES) throw new HttpsError("invalid-argument", "Take your selfie again.");
  // Each pose allows a few tries (a blurry shot can be retaken), then a new check is needed.
  const lock = await db.runTransaction(async (tx) => {
    const current = await tx.get(lockRef);
    if (current.get("attempt") !== attempt || current.get("method") !== "selfie" || !poseById(current.get("pose")) || !(current.get("expiresAt") > Date.now())) {
      throw new HttpsError("failed-precondition", "This check has expired. Start a new one.");
    }
    const tries = (current.get("tries") as number | undefined) ?? 0;
    if (tries >= SELFIE_TRIES_PER_ATTEMPT) throw new HttpsError("failed-precondition", "Too many tries for this pose. Start a new check.");
    tx.update(lockRef, { tries: tries + 1 });
    return current;
  });
  const pose = poseById(lock.get("pose"))!;
  /** Ends this attempt, unless a newer one has replaced it. */
  const endAttempt = () => db.runTransaction(async (tx) => {
    if ((await tx.get(lockRef)).get("attempt") === attempt) tx.delete(lockRef);
  });

  const photos = (await db.doc(`users/${uid}`).get()).get("photoUrls") as unknown;
  if (!samePhotos(photos, lock.get("originalPhotos"))) throw new HttpsError("failed-precondition", "Your photos changed. Start a new check.");
  const storage = bucket();
  const files = currentPhotoPaths(photos, uid).map((path) => storage.file(path));
  const sources = await Promise.all(files.map(async (file) => {
    const [metadata] = await file.getMetadata();
    if (!metadata.generation || Number(metadata.size) <= 0 || Number(metadata.size) > MAX_PHOTO_BYTES || !PHOTO_TYPES.includes(metadata.contentType ?? "")) {
      throw new HttpsError("failed-precondition", "Use JPG, PNG or WebP photos under 10 MB.");
    }
    const exact = storage.file(file.name, { generation: metadata.generation });
    const [bytes] = await exact.download();
    return { exact, bytes, contentType: metadata.contentType as string };
  }));

  let verdict;
  try {
    const [faces, aiImages] = await Promise.all([
      matchPhotos(selfie, sources.map((source) => source.bytes)),
      Promise.all([selfie, ...sources.map((source) => source.bytes)].map(forAi))
    ]);
    let ai = null;
    if (faces.selfieFaces === 1) {
      ai = parseSelfieAiReply(await askAiForJson(SELFIE_AI_SYSTEM, selfieAiPrompt(pose, sources.length), 400, { images: aiImages, timeoutMs: 45_000, provider: "gemini" }), sources.length);
      // An AI outage isn't the member's fault: keep the attempt and their daily tries.
      if (!ai) throw new HttpsError("unavailable", "Our checker is busy right now. Please try again in a minute.");
    }
    verdict = { decision: selfieDecision({ pose, selfieFaces: faces.selfieFaces, photos: faces.matches, ai }), faces };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn("Selfie check failed", { uid, error: String(error) });
    throw new HttpsError("unavailable", "We couldn't check your selfie. Please take it again.");
  }
  // Only a real decision counts towards the daily limit.
  await consumeDailyQuota(uid, "selfieChecks", SELFIE_CHECKS_PER_DAY);

  const scores = verdict.faces.matches.map((match) => (match.best === null ? null : Math.round(match.best * 100) / 100));
  const audit = db.collection("verificationAudit").doc();
  if (!verdict.decision.approved) {
    await endAttempt();
    await audit.set({ uid, attempt, method: "selfie", approve: false, code: verdict.decision.code, scores, createdAt: FieldValue.serverTimestamp() });
    return { approved: false, reason: verdict.decision.reason, code: verdict.decision.code };
  }

  // Frozen copies of exactly the bytes that were checked.
  const frozen: string[] = [];
  try {
    for (let index = 0; index < sources.length; index++) {
      const destination = storage.file(`verified-photos/${uid}/${attempt}/${index}`);
      const token = randomUUID();
      await sources[index].exact.copy(destination, { preconditionOpts: { ifGenerationMatch: 0 }, metadata: { firebaseStorageDownloadTokens: token }, contentType: sources[index].contentType });
      frozen.push(`https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodeURIComponent(destination.name)}?alt=media&token=${token}`);
    }
    await db.runTransaction(async (tx) => {
      const [profile, current] = await tx.getAll(db.doc(`users/${uid}`), lockRef);
      if (current.get("attempt") !== attempt || !samePhotos(profile.get("photoUrls"), photos)) throw new HttpsError("failed-precondition", "Your photos changed. Start a new check.");
      const now = Date.now();
      tx.set(db.doc(`moderation/${uid}`), { verification: { schemaVersion: 2, storageBound: true, status: "verified", method: "selfie", sessionId: attempt, photoUrls: frozen, verifiedAt: now, expiresAt: now + VERIFIED_FOR_MS } }, { merge: true });
      tx.update(db.doc(`users/${uid}`), { photoUrls: frozen, updatedAt: now });
      tx.delete(lockRef);
      tx.set(audit, { uid, attempt, method: "selfie", approve: true, scores, createdAt: FieldValue.serverTimestamp() });
    });
  } catch (error) {
    await storage.deleteFiles({ prefix: `verified-photos/${uid}/${attempt}/` }).catch(() => undefined);
    if (error instanceof HttpsError) throw error;
    logger.error("Selfie approval failed", { uid, error: String(error) });
    throw new HttpsError("unavailable", "We couldn't save your check. Please try again.");
  }
  return { approved: true };
});
