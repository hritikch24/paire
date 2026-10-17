import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { requireReadAuth, isSupportSession } from "./lib/auth";
import { consumeDailyQuota } from "./quota";
import { buildDiscoveryEntry, toDiscoverProfile, viewerTraits } from "./lib/discovery";
import { hiddenIncognito, loadExclusions } from "./discovery";
import { isMutualCandidate } from "./lib/prefs";
import { requireVerifiedUsers } from "./trust";
import { isValidLatLng } from "./lib/geo";
import type { PublicProfile, UserSettings, ModerationRecord } from "./types";

/** A share link identifies a profile; it never grants permission to see it. */
export const getSharedProfile = onCall({ region: REGION }, async (request) => {
  const uid = await requireReadAuth(request);
  const target = request.data?.uid;
  if (typeof target !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(target)) throw new HttpsError("invalid-argument", "That profile link isn't valid.");
  await consumeDailyQuota(isSupportSession(request) ? request.auth!.uid : uid, "sharedProfiles", 100);
  await requireVerifiedUsers([uid], undefined, uid, isSupportSession(request));
  const refs = [uid, target].flatMap((id) => [db.doc(`users/${id}`), db.doc(`users/${id}/private/settings`), db.doc(`moderation/${id}`)]);
  const [myProfile, mySettings, myMod, profile, settings, mod] = await db.getAll(...refs);
  if (!myProfile.exists || !profile.exists) return { profile: null };
  const me = myProfile.data() as PublicProfile;
  const them = profile.data() as PublicProfile;
  const mine = mySettings.data() as UserSettings | undefined;
  const theirs = settings.data() as UserSettings | undefined;
  const viewer = buildDiscoveryEntry(uid, me, mine, myMod.data() as ModerationRecord | undefined);
  const candidate = buildDiscoveryEntry(target, them, theirs, mod.data() as ModerationRecord | undefined);
  const location = mine?.locationEnabled && isValidLatLng(mine.location) ? mine.location! : null;
  // Keep all discovery privacy/eligibility rules, including previously passed profiles.
  if (!isMutualCandidate(viewer, candidate, { viewerLocation: location, sharedVibesOnly: Boolean(mine?.sharedVibesOnly) })) return { profile: null };
  if ((await loadExclusions(uid, [target])).has(target) || (await hiddenIncognito(uid, [candidate])).has(target)) return { profile: null };
  await requireVerifiedUsers([target], undefined, uid, isSupportSession(request));
  return { profile: toDiscoverProfile(them, candidate, location, false, viewerTraits(viewer, me), Date.now()) };
});
