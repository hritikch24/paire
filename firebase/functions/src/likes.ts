import { onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { loadExclusions } from "./discovery";
import { requireVerifiedUsers, verifiedUsers } from "./trust";
import { requireReadAuth, isSupportSession } from "./lib/auth";
import { buildDiscoveryEntry, toDiscoverProfile, viewerTraits } from "./lib/discovery";
import { isValidLatLng } from "./lib/geo";
import { isVisibleCandidate } from "./lib/prefs";
import { compareLikes, IncomingLike } from "./lib/sparks";
import { limitsFor } from "./premium";
import { chatPolicy } from "./chatEntitlement";
import { billingEnabled, syncPremium } from "./billing";
import { validBillingSnapshot } from "./lib/billing";
import { consumeDailyQuota } from "./quota";
import { DiscoverProfile, LatLng, ModerationRecord, PublicProfile, UserSettings } from "./types";

const SCAN_LIMIT = 300;
export type LikesYouResult = { profiles: DiscoverProfile[]; count: number; locked: boolean; hasMore: boolean; expiresAt: number | null; acceptable: boolean };

/** Pending likes ignore search filters. Identity is revealed only by the server, for active Plus or, once acceptFlow is on, to a woman (who can then accept). */
export const getLikesYou = onCall({ region: REGION, timeoutSeconds: 30, secrets: ["REVENUECAT_SECRET_KEY", "RAZORPAY_KEY_SECRET"] }, async (request): Promise<LikesYouResult> => {
  const uid = await requireReadAuth(request);
  await requireVerifiedUsers([uid], undefined, uid, isSupportSession(request));
  await consumeDailyQuota(isSupportSession(request) ? request.auth!.uid : uid, "likesChecks", 300);
  const [likesSnap, myProfile, mySettings, myMod, billing] = await Promise.all([
    db.collectionGroup("outgoing").where("toUid", "==", uid).where("type", "in", ["like", "super"])
      .orderBy("createdAt", "desc").limit(SCAN_LIMIT).get(),
    db.doc(`users/${uid}`).get(), db.doc(`users/${uid}/private/settings`).get(),
    db.doc(`moderation/${uid}`).get(), db.doc(`billing/${uid}`).get()
  ]);
  let billed = billing.data();
  if (billingEnabled() && (billed?.lifetime === true || Number(billed?.expiresAt) > Date.now()) && !validBillingSnapshot(billed)) {
    await syncPremium(uid);
    billed = (await db.doc(`billing/${uid}`).get()).data();
  }
  const plus = limitsFor(billed).priority;
  // A woman sees her whole list free once acceptFlow is on; a man still needs Plus.
  const freeForHer = !plus && myProfile.get("gender") === "woman" && (await chatPolicy()).acceptFlow;
  const reveal = plus || freeForHer;
  const result: LikesYouResult = { profiles: [], count: 0, locked: !reveal, hasMore: likesSnap.size === SCAN_LIMIT, expiresAt: plus && billed?.lifetime !== true ? Number(billed?.expiresAt) : null, acceptable: freeForHer };
  if (!myProfile.exists) return result;
  const settings = mySettings.data() as UserSettings | undefined;
  const viewer = buildDiscoveryEntry(uid, myProfile.data() as PublicProfile, settings, myMod.data() as ModerationRecord | undefined);
  const likes = likesSnap.docs.map((doc) => doc.data() as IncomingLike)
    .filter((like) => typeof like.fromUid === "string" && like.fromUid !== uid).sort(compareLikes);
  const likers = [...new Set(likes.map((like) => like.fromUid as string))];
  if (!likers.length) return result;
  const excluded = await loadExclusions(uid, likers);
  const remaining = likers.filter((liker) => !excluded.has(liker));
  if (!remaining.length) return result;
  const [snaps, verified] = await Promise.all([
    db.getAll(...remaining.flatMap((id) => [db.doc(`users/${id}`), db.doc(`users/${id}/private/settings`), db.doc(`moderation/${id}`)])),
    verifiedUsers(remaining)
  ]);
  const location: LatLng | null = settings?.locationEnabled && isValidLatLng(settings.location) ? settings.location! : null;
  const traits = viewerTraits(viewer, myProfile.data() as PublicProfile);
  const superLikers = new Set(likes.filter((like) => like.type === "super").map((like) => like.fromUid));
  const notes = new Map(likes.filter((like) => typeof like.note === "string" && like.note).map((like) => [like.fromUid, like.note as string]));
  remaining.forEach((id, index) => {
    const [profile, prefs, mod] = snaps.slice(index * 3, index * 3 + 3);
    if (!profile.exists || !verified.has(id)) return;
    const entry = buildDiscoveryEntry(id, profile.data() as PublicProfile, prefs.data() as UserSettings | undefined, mod.data() as ModerationRecord | undefined);
    if (!isVisibleCandidate(viewer, entry)) return;
    result.count++;
    // No uid, name, note, photo, profile field or identifying thumbnail is sent to members who may not see them.
    if (!reveal) return;
    const card = toDiscoverProfile(profile.data() as PublicProfile, entry, location, superLikers.has(id), traits, Date.now());
    if (card) result.profiles.push(notes.has(id) ? { ...card, note: notes.get(id) } : card);
  });
  return result;
});
