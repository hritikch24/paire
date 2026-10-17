import { onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { loadExclusions } from "./discovery";
import { requireVerifiedUsers, verifiedUsers } from "./trust";
import { requireReadAuth, isSupportSession } from "./lib/auth";
import { toDiscoverProfile, viewerTraits } from "./lib/discovery";
import { isValidLatLng } from "./lib/geo";
import { isMutualCandidate } from "./lib/prefs";
import { compareLikes, IncomingLike } from "./lib/sparks";
import { DiscoverProfile, DiscoveryEntry, LatLng, PublicProfile, UserSettings } from "./types";

const MAX_LIKERS = 60;

/**
 * People who liked you and are waiting for your answer. Free, unlike most apps:
 * knowing someone is interested is what keeps people coming back.
 * Excludes anyone you already swiped on, blocked or matched, anyone who is
 * hidden, and anyone who no longer fits both people's preferences.
 */
export const getLikesYou = onCall({ region: REGION }, async (request): Promise<{ profiles: DiscoverProfile[] }> => {
  const uid = await requireReadAuth(request);
  await requireVerifiedUsers([uid], undefined, uid, isSupportSession(request));

  const [likesSnap, viewerEntrySnap, viewerProfileSnap, settingsSnap] = await Promise.all([
    // Newest likes first, so the cap never hides recent likes (or their notes) from popular members.
    db.collectionGroup("outgoing")
      .where("toUid", "==", uid)
      .where("type", "in", ["like", "super"])
      .orderBy("createdAt", "desc")
      .limit(300)
      .get(),
    db.doc(`discovery/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${uid}/private/settings`).get()
  ]);
  if (!viewerEntrySnap.exists) return { profiles: [] };
  const viewer = viewerEntrySnap.data() as DiscoveryEntry;

  const likes = likesSnap.docs
    .map((doc) => doc.data() as IncomingLike)
    .filter((like) => (like.type === "like" || like.type === "super") && typeof like.fromUid === "string" && like.fromUid !== uid)
    .sort(compareLikes);
  const superLikers = new Set(likes.filter((like) => like.type === "super").map((like) => like.fromUid as string));
  const notes = new Map(
    likes.filter((like) => typeof like.note === "string" && like.note).map((like) => [like.fromUid as string, like.note as string])
  );
  const likers = Array.from(new Set(likes.map((like) => like.fromUid as string))).slice(0, MAX_LIKERS);
  if (!likers.length) return { profiles: [] };

  const excluded = await loadExclusions(uid, likers);
  const remaining = likers.filter((liker) => !excluded.has(liker));
  if (!remaining.length) return { profiles: [] };

  const snaps = await db.getAll(
    ...remaining.flatMap((liker) => [db.doc(`discovery/${liker}`), db.doc(`users/${liker}`)])
  );
  const settings = settingsSnap.data() as UserSettings | undefined;
  const viewerLocation: LatLng | null =
    settings?.locationEnabled && isValidLatLng(settings.location)
      ? { lat: settings.location.lat, lng: settings.location.lng }
      : null;
  const traits = viewerTraits(viewer, viewerProfileSnap.data() as Partial<PublicProfile> | undefined);
  const now = Date.now();

  const verified = await verifiedUsers(remaining);
  const profiles: DiscoverProfile[] = [];
  remaining.forEach((liker, index) => {
    const entrySnap = snaps[index * 2];
    const profileSnap = snaps[index * 2 + 1];
    if (!verified.has(liker)) return;
    if (!entrySnap.exists || !profileSnap.exists) return;
    const entry = entrySnap.data() as DiscoveryEntry;
    // Same checks as the feed (visibility, cohort, both people's preferences), but not distance:
    // they already chose you.
    if (!isMutualCandidate(viewer, entry, { viewerLocation: null, sharedVibesOnly: false })) return;
    const profile = toDiscoverProfile(
      profileSnap.data() as Partial<PublicProfile>,
      entry,
      viewerLocation,
      superLikers.has(liker),
      traits,
      now
    );
    if (profile) profiles.push(notes.has(liker) ? { ...profile, note: notes.get(liker) } : profile);
  });
  return { profiles };
});
