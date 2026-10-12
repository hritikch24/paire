import { FieldPath } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db } from "./admin";
import { FEED, LIMITS, REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { buildDiscoveryEntry, toDiscoverProfile, viewerTraits } from "./lib/discovery";
import { isValidLatLng } from "./lib/geo";
import { rankCandidate } from "./lib/insights";
import { candidateLatLng, isMutualCandidate, normalizeShowMe } from "./lib/prefs";
import { parseFeedInput } from "./lib/validate";
import { matchesAgeGapFilter } from "./lib/ageGap";
import { activeGarbaSeason, GARBA_RADIUS_KM, sharedGarbaNights, upcomingGarbaNights } from "./lib/garba";
import { distanceKm } from "./lib/geo";
import { limitsFor } from "./premium";
import { requireVerifiedUsers, verifiedUsers, verificationRequired } from "./trust";
import { verificationState } from "./lib/verification";
import { publicSnippet, updateDuoLikeSnippets } from "./duoSnippets";
import { rerankVibes } from "./vibeMatching";
import { consumeDailyQuota } from "./quota";
import {
  DiscoverProfile,
  DiscoveryEntry,
  FeedCursor,
  LatLng,
  ModerationRecord,
  PublicProfile,
  UserSettings
} from "./types";

/** Rebuilds discovery/{uid} from the user's profile, settings and moderation state. */
export async function syncDiscoveryIndex(uid: string): Promise<DiscoveryEntry | null> {
  const [profileSnap, settingsSnap, moderationSnap] = await db.getAll(
    db.doc(`users/${uid}`),
    db.doc(`users/${uid}/private/settings`),
    db.doc(`moderation/${uid}`)
  );
  const indexRef = db.doc(`discovery/${uid}`);
  if (!profileSnap.exists) {
    await indexRef.delete();
    return null;
  }
  const entry = buildDiscoveryEntry(
    uid,
    profileSnap.data() as Partial<PublicProfile>,
    settingsSnap.data() as UserSettings | undefined,
    moderationSnap.exists ? (moderationSnap.data() as ModerationRecord) : undefined
  );
  if (await verificationRequired()) entry.visible = entry.visible && verificationState(moderationSnap.get("verification"), profileSnap.get("photoUrls")) === "verified";
  await indexRef.set(entry);
  return entry;
}

export const onUserSettingsWritten = onDocumentWritten(
  { document: "users/{uid}/private/settings", region: REGION },
  async (event) => {
    const uid = event.params.uid;
    await syncDiscoveryIndex(uid);
    // Turning private photos on or off also updates other pairs' copies of this member's photo.
    const before = event.data?.before.get("privatePhotos") === true;
    const after = event.data?.after.get("privatePhotos") === true;
    if (before !== after) {
      const profile = (await db.doc(`users/${uid}`).get()).data() as Partial<PublicProfile> | undefined;
      if (profile) {
        await updateDuoLikeSnippets(uid, publicSnippet({ displayName: profile.displayName || "Paire member", photoUrl: profile.photoUrls?.[0] ?? null }, after));
      }
    }
  }
);

export const onModerationWritten = onDocumentWritten(
  { document: "moderation/{uid}", region: REGION },
  async (event) => {
    await syncDiscoveryIndex(event.params.uid);
  }
);

/** Uids among `candidates` the viewer already swiped on, blocked, or was blocked by. */
export async function loadExclusions(uid: string, candidates: string[]): Promise<Set<string>> {
  if (!candidates.length) return new Set();
  const refs = candidates.flatMap((candidate) => [
    db.doc(`swipes/${uid}/outgoing/${candidate}`),
    db.doc(`blocks/${uid}/blocked/${candidate}`),
    db.doc(`blocks/${candidate}/blocked/${uid}`)
  ]);
  const snaps = await db.getAll(...refs);
  const excluded = new Set<string>();
  candidates.forEach((candidate, index) => {
    if (snaps.slice(index * 3, index * 3 + 3).some((snap) => snap.exists)) {
      excluded.add(candidate);
    }
  });
  return excluded;
}

/** Incognito members among `candidates` who have NOT liked the viewer: they stay out of sight. */
export async function hiddenIncognito(uid: string, candidates: DiscoveryEntry[]): Promise<Set<string>> {
  const incognito = candidates.filter((entry) => entry.incognito === true);
  if (!incognito.length) return new Set();
  const snaps = await db.getAll(...incognito.map((entry) => db.doc(`swipes/${entry.uid}/outgoing/${uid}`)));
  const hidden = new Set<string>();
  incognito.forEach((entry, index) => {
    const type = snaps[index].get("type");
    if (type !== "like" && type !== "super") hidden.add(entry.uid);
  });
  return hidden;
}

/** Ranking score, counting hidden-until-match photos as photos. */
const scoreOf = (profile: DiscoverProfile) =>
  rankCandidate(profile, profile.superLikedYou, profile.photoUrls.length > 0 || profile.photosPrivate, profile.isNew);

export const getDiscoverFeed = onCall(
  { region: REGION, memory: "512MiB", timeoutSeconds: 30, secrets: ["ANTHROPIC_API_KEY"] },
  async (request): Promise<{ profiles: DiscoverProfile[]; cursor: FeedCursor | null }> => {
    const uid = requireAuth(request);
    await requireVerifiedUsers([uid]);
    const { cursor: startCursor, ageGap, garba } = parseFeedInput(request.data);
    await consumeDailyQuota(uid, "feedCalls", LIMITS.feedCallsPerDay);

    const [indexSnap, settingsSnap, viewerProfileSnap, billingSnap] = await db.getAll(
      db.doc(`discovery/${uid}`),
      db.doc(`users/${uid}/private/settings`),
      db.doc(`users/${uid}`),
      db.doc(`billing/${uid}`)
    );
    // Age-gap filtering, and seeing who holds which side, are Paire Plus features.
    const plus = limitsFor(billingSnap.data()).priority;
    if (ageGap && !plus) throw new HttpsError("permission-denied", "The age-gap filter comes with Paire Plus.");
    const viewer = indexSnap.exists
      ? (indexSnap.data() as DiscoveryEntry)
      : await syncDiscoveryIndex(uid);
    if (!viewer || !viewer.gender || viewer.age === null) {
      throw new HttpsError("failed-precondition", "Finish your profile to start discovering people.");
    }
    // "Into someone older" is for Silver Foxes and Cougars, not for anyone browsing younger members.
    if (ageGap === "intoOlder" && viewer.ageGap !== "older") {
      throw new HttpsError("failed-precondition", "Choose “I'm a Silver Fox” or “I'm a Cougar” in Settings to see people into someone older.");
    }

    const settings = settingsSnap.data() as UserSettings | undefined;
    // Garba Nights: free for everyone while the season is open. Read from settings, not the
    // index, so nights picked a moment ago already count.
    const now = Date.now();
    const garbaSeason = garba ? activeGarbaSeason(now) : null;
    if (garba && !garbaSeason) throw new HttpsError("failed-precondition", "Garba Nights is closed until next Navratri.");
    const myGarbaNights = garba ? upcomingGarbaNights(settings?.garbaNights, now) : [];
    if (garba && !myGarbaNights.length) throw new HttpsError("failed-precondition", "Pick the Garba nights you're going to first.");
    const viewerLocation: LatLng | null =
      settings?.locationEnabled && isValidLatLng(settings.location)
        ? { lat: settings.location.lat, lng: settings.location.lng }
        : null;
    const options = { viewerLocation, sharedVibesOnly: Boolean(settings?.sharedVibesOnly) };
    if (garba && !viewerLocation) {
      throw new HttpsError("failed-precondition", "Garba Nights shows people near you. Turn on location in Settings first.");
    }
    const showMe = normalizeShowMe(viewer.showMe);

    // Garba Nights: at least one shared night, and close enough to meet at the same Garba.
    const isGarbaCandidate = (entry: DiscoveryEntry) => {
      const location = candidateLatLng(entry);
      return (
        sharedGarbaNights(myGarbaNights, entry.garbaNights, now).length > 0 &&
        viewerLocation !== null &&
        location !== null &&
        distanceKm(viewerLocation, location) <= GARBA_RADIUS_KM
      );
    };

    const superLikesSnap = await db.collection(`superLikes/${uid}/from`).select().limit(500).get();
    const superLikers = new Set(superLikesSnap.docs.map((doc) => doc.id));

    const picked: DiscoveryEntry[] = [];
    let cursor: FeedCursor | null = startCursor;
    let scanned = 0;
    let exhausted = false;

    scan: while (picked.length < FEED.pageSize && scanned < FEED.maxScan) {
      let query = db
        .collection("discovery")
        .where("visible", "==", true)
        .where("cohort", "==", viewer.cohort ?? "public")
        .where("gender", "in", showMe);
      if (ageGap) query = query.where("ageGap", "==", ageGap);
      if (garbaSeason) query = query.where("garba", "==", garbaSeason.id);
      query = query
        .orderBy("lastActiveAt", "desc")
        .orderBy(FieldPath.documentId(), "desc")
        .limit(FEED.scanBatch);
      if (cursor) {
        query = query.startAfter(cursor.lastActiveAt, cursor.uid);
      }
      const snap = await query.get();
      scanned += snap.size;
      if (snap.empty) {
        exhausted = true;
        break;
      }

      const entries = snap.docs.map((doc) => doc.data() as DiscoveryEntry);
      const compatible = entries.filter(
        (entry) =>
          isMutualCandidate(viewer, entry, options) &&
          (!ageGap || matchesAgeGapFilter(ageGap, viewer.age as number, entry)) &&
          (!garbaSeason || isGarbaCandidate(entry))
      );
      const excluded = await loadExclusions(
        uid,
        compatible.map((entry) => entry.uid)
      );
      const currentVerified = await verifiedUsers(compatible.map((entry) => entry.uid));
      const incognito = await hiddenIncognito(uid, compatible);
      const eligible = new Set(
        compatible
          .filter((entry) => !excluded.has(entry.uid) && currentVerified.has(entry.uid) && !incognito.has(entry.uid))
          .map((entry) => entry.uid)
      );

      for (const entry of entries) {
        // The cursor tracks the last entry examined, so the next call resumes right after it.
        cursor = { lastActiveAt: entry.lastActiveAt, uid: entry.uid };
        if (eligible.has(entry.uid)) {
          picked.push(entry);
          if (picked.length >= FEED.pageSize) break scan;
        }
      }
      if (snap.size < FEED.scanBatch) {
        exhausted = true;
        break;
      }
    }

    const profileSnaps = picked.length
      ? await db.getAll(...picked.map((entry) => db.doc(`users/${entry.uid}`)))
      : [];
    const approvals = picked.length ? await db.getAll(...picked.map((entry) => db.doc(`moderation/${entry.uid}`))) : [];
    const traits = viewerTraits(viewer, viewerProfileSnap.data() as Partial<PublicProfile> | undefined);
    const verified = await verifiedUsers(picked.map((entry) => entry.uid));
    const profiles = profileSnaps
      .map((snap, index) =>
        snap.exists && verified.has(snap.id)
          ? toDiscoverProfile(
              snap.data() as Partial<PublicProfile>,
              picked[index],
              viewerLocation,
              superLikers.has(picked[index].uid),
              traits,
              now
            )
          : null
      )
      .filter((profile): profile is DiscoverProfile => profile !== null)
      .map((profile) => {
        const index = picked.findIndex((entry) => entry.uid === profile.uid);
        // Checked against the stored photos, which private-photo profiles don't send.
        const photoVerified = verificationState(approvals[index]?.get("verification"), profileSnaps[index]?.get("photoUrls"), now) === "verified";
        const side = plus ? picked[index].ageGap : null;
        // Only how many nights you share (never which), and only inside the Garba edition.
        const garbaShared = garbaSeason ? sharedGarbaNights(myGarbaNights, picked[index].garbaNights, now).length : 0;
        return {
          profile: { ...profile, photoVerified, ...(side ? { ageGap: side } : {}), ...(garbaShared ? { garbaShared } : {}) },
          score: scoreOf(profile)
        };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ profile }) => profile);

    const ranked = await rerankVibes(uid, viewerProfileSnap.data() as Partial<PublicProfile>, settings, profiles);
    ranked.sort((a, b) => scoreOf(b) - scoreOf(a));
    return { profiles: ranked, cursor: exhausted ? null : cursor };
  }
);
