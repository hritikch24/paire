import { createHash } from "node:crypto";
import { DocumentReference, DocumentSnapshot, FieldValue, Query } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { bucket, db } from "./admin";
import { REGION } from "./config";
import { hiddenIncognito, loadExclusions } from "./discovery";
import { requireAuth } from "./lib/auth";
import { buildDiscoveryEntry } from "./lib/discovery";
import { isValidLatLng } from "./lib/geo";
import { pairId } from "./lib/ids";
import { buildMatchDoc } from "./lib/matchDoc";
import { isCandidateForViewer, isVisibleCandidate } from "./lib/prefs";
import { REPORT_REASONS } from "./lib/reports";
import {
  ageBandOf,
  closesAtOf,
  generateNickname,
  newCardId,
  nodId,
  orderKey,
  parseJoinInput,
  reporterHash,
  sameCouple,
  weddingBucket,
  weddingKeyHash,
  WEDDING,
  type WeddingSide
} from "./lib/wedding";
import { snippetOf } from "./profiles";
import { sendPushToUser } from "./push";
import { dailyLimitRef, consumeDailyQuota } from "./quota";
import { blockMember } from "./safety";
import { requireVerifiedUsers, verifiedUsers } from "./trust";
import { WEB_PUSH_SECRETS } from "./webPush";
import { DiscoveryEntry, LatLng, ModerationRecord, PublicProfile, UserSettings } from "./types";

/**
 * Wedding Nods (docs/wedding-nods.md). Everything is written here, by the server:
 * weddings, guests and nods are never readable or writable by a client. Guests meet
 * each other only as anonymous cards, and a nod is revealed only when it is mutual.
 */

const WEDDING_ID = /^[A-Za-z0-9]{20}$/;
const CARD_ID = /^[A-Za-z0-9_-]{16}$/;
const isPositive = (type: unknown) => type === "like" || type === "super";

type Guest = {
  uid: string;
  nickname: string;
  side: WeddingSide;
  ageBand: string;
  clue: string;
  cardId: string;
  active: boolean;
  hidden: boolean;
  reporters: string[];
  nodsUsed: number;
  invitePath: string | null;
};

export type WeddingSpot = {
  weddingId: string;
  label: string;
  date: string;
  closesAt: number;
  nickname: string;
  side: WeddingSide;
  ageBand: string;
  clue: string;
  active: boolean;
  nodsUsed: number;
  nodsTotal: number;
  joinedAt: number;
};

const spotRef = (uid: string, weddingId: string) => db.doc(`users/${uid}/weddingSpots/${weddingId}`);

function weddingIdOf(data: unknown): string {
  const id = (data as { weddingId?: unknown } | null)?.weddingId;
  if (typeof id !== "string" || !WEDDING_ID.test(id)) throw new HttpsError("invalid-argument", "That wedding isn't valid.");
  return id;
}

function cardIdOf(data: unknown): string {
  const id = (data as { cardId?: unknown } | null)?.cardId;
  if (typeof id !== "string" || !CARD_ID.test(id)) throw new HttpsError("invalid-argument", "That guest isn't valid.");
  return id;
}

type Member = { entry: DiscoveryEntry; profile: Partial<PublicProfile> | undefined; settings: UserSettings | undefined };

const memberFrom = (uid: string, profile: DocumentSnapshot, settings: DocumentSnapshot, moderation: DocumentSnapshot): Member => ({
  entry: buildDiscoveryEntry(uid, profile.data() as Partial<PublicProfile> | undefined, settings.data() as UserSettings | undefined, moderation.data() as ModerationRecord | undefined),
  profile: profile.data() as Partial<PublicProfile> | undefined,
  settings: settings.data() as UserSettings | undefined
});

/** The same eligibility getDiscoverFeed uses, from fresh data: 18+, a visible, finished profile. */
function assertMemberReady(member: Member): asserts member is Member & { entry: DiscoveryEntry & { age: number } } {
  const { entry } = member;
  if (!entry.visible || !entry.gender || entry.age === null || entry.age < 18) {
    throw new HttpsError("failed-precondition", "Finish your profile (and keep it visible) to use Wedding Nods.", { reason: "profile-not-ready" });
  }
}

async function loadMember(uid: string): Promise<Member> {
  const [profile, settings, moderation] = await db.getAll(db.doc(`users/${uid}`), db.doc(`users/${uid}/private/settings`), db.doc(`moderation/${uid}`));
  return memberFrom(uid, profile, settings, moderation);
}

async function checkInvite(path: string, uid: string): Promise<void> {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("invalid-argument", "We couldn't find that invitation photo. Please try again.");
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  if (!String(metadata.contentType ?? "").startsWith("image/") || size > WEDDING.maxInviteBytes) {
    await file.delete({ ignoreNotFound: true });
    throw new HttpsError("invalid-argument", "The invitation photo must be an image under 8 MB.");
  }
  logger.info("Wedding invitation stored", { uid });
}

/** Adds you to a wedding you typed yourself, creating it when you are the first. */
export const joinWedding = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  await consumeDailyQuota(uid, "weddingJoinCalls", WEDDING.joinCallsPerDay);
  await requireVerifiedUsers([uid]);
  const member = await loadMember(uid);
  assertMemberReady(member);
  const now = Date.now();
  const input = parseJoinInput(request.data, uid, member.profile?.displayName ?? "", now);
  if (input.invitePath) await checkInvite(input.invitePath, uid);

  const bucketKey = weddingBucket(input.date, input.pin);
  const keyHash = weddingKeyHash(input.names, input.date, input.pin);

  const outcome = await db.runTransaction(async (tx) => {
    const joinsRef = db.doc(`limits/${uid}/wedding/joins`);
    const [joinsSnap, candidates] = await Promise.all([tx.get(joinsRef), tx.get(db.collection("weddings").where("bucket", "==", bucketKey).limit(50))]);
    const found =
      candidates.docs.find((doc) => doc.get("keyHash") === keyHash) ??
      candidates.docs.find((doc) => {
        const names = doc.get("names") as unknown;
        return Array.isArray(names) && names.length === 2 && sameCouple([names[0], names[1]], input.names);
      });
    if (found && (found.get("status") === "hidden" || Number(found.get("closesAt")) <= now)) {
      throw new HttpsError("failed-precondition", "We couldn't add you to that wedding.", { reason: "wedding-unavailable" });
    }
    const weddingRef = found?.ref ?? db.collection("weddings").doc();
    const guestRef = weddingRef.collection("guests").doc(uid);
    const [guestSnap, nicknames] = found
      ? await Promise.all([tx.get(guestRef), tx.get(weddingRef.collection("guests").select("nickname").limit(WEDDING.maxGuestsScanned))])
      : [null, null];

    const recent = ((joinsSnap.get("at") as number[] | undefined) ?? []).filter((at) => now - at < WEDDING.weekMs);
    const isNew = !guestSnap?.exists;
    if (isNew) {
      if (recent.length >= WEDDING.joinsPerWeek) {
        throw new HttpsError("resource-exhausted", `You can add up to ${WEDDING.joinsPerWeek} weddings a week. Try again in a few days.`, { reason: "wedding-join-limit" });
      }
      if ((nicknames?.size ?? 0) >= WEDDING.maxGuestsScanned) throw new HttpsError("resource-exhausted", "This wedding is full.");
    }

    const label = `${input.labels[0] || input.names[0]} & ${input.labels[1] || input.names[1]}`;
    if (!found) {
      tx.set(weddingRef, {
        bucket: bucketKey,
        keyHash,
        names: input.names,
        date: input.date,
        pin: input.pin,
        status: "open",
        closesAt: closesAtOf(input.date),
        createdAt: FieldValue.serverTimestamp()
      });
    }

    let spot: WeddingSpot;
    if (isNew) {
      const taken = new Set((nicknames?.docs ?? []).map((doc) => String(doc.get("nickname"))));
      const nickname = generateNickname(taken);
      const guest: Guest & { joinedAt: number; updatedAt: number } = {
        uid, nickname, side: input.side, ageBand: ageBandOf(member.entry.age), clue: input.clue, cardId: newCardId(),
        active: true, hidden: false, reporters: [], nodsUsed: 0, invitePath: input.invitePath, joinedAt: now, updatedAt: now
      };
      tx.set(guestRef, guest);
      tx.set(joinsRef, { at: [...recent, now], updatedAt: FieldValue.serverTimestamp() });
      spot = { weddingId: weddingRef.id, label, date: input.date, closesAt: closesAtOf(input.date), nickname, side: input.side, ageBand: guest.ageBand, clue: input.clue, active: true, nodsUsed: 0, nodsTotal: WEDDING.nodsPerWedding, joinedAt: now };
    } else {
      const existing = guestSnap!.data() as Guest;
      tx.update(guestRef, { side: input.side, clue: input.clue, active: true, ageBand: ageBandOf(member.entry.age), updatedAt: now, ...(input.invitePath ? { invitePath: input.invitePath } : {}) });
      spot = { weddingId: weddingRef.id, label, date: input.date, closesAt: closesAtOf(input.date), nickname: existing.nickname, side: input.side, ageBand: ageBandOf(member.entry.age), clue: input.clue, active: true, nodsUsed: existing.nodsUsed ?? 0, nodsTotal: WEDDING.nodsPerWedding, joinedAt: Number(guestSnap!.get("joinedAt")) || now };
    }
    tx.set(spotRef(uid, weddingRef.id), spot);
    return spot;
  });
  return { spot: outcome };
});

type Card = { cardId: string; nickname: string; side: WeddingSide; ageBand: string; clue: string; nodded: boolean };
export type GuestList =
  | { status: "joining"; nodsLeft: number }
  | { status: "ready"; guests: Card[]; nodsLeft: number }
  | { status: "closed" | "unavailable" };

/** The anonymous cards you may nod at, or "Guests are still joining" under 10 guests. */
export const getWeddingGuests = onCall({ region: REGION, memory: "512MiB", timeoutSeconds: 30 }, async (request): Promise<GuestList> => {
  const uid = requireAuth(request);
  const weddingId = weddingIdOf(request.data);
  await consumeDailyQuota(uid, "weddingGuestCalls", WEDDING.guestCallsPerDay);
  await requireVerifiedUsers([uid]);
  const weddingRef = db.doc(`weddings/${weddingId}`);
  const [weddingSnap, mineSnap] = await db.getAll(weddingRef, weddingRef.collection("guests").doc(uid));
  if (!weddingSnap.exists || !mineSnap.exists || mineSnap.get("active") !== true) return { status: "unavailable" };
  if (weddingSnap.get("status") === "hidden") return { status: "unavailable" };
  if (Number(weddingSnap.get("closesAt")) <= Date.now()) return { status: "closed" };
  const nodsLeft = Math.max(0, WEDDING.nodsPerWedding - (Number(mineSnap.get("nodsUsed")) || 0));
  if (mineSnap.get("hidden") === true) return { status: "joining", nodsLeft };

  const guestDocs = (await weddingRef.collection("guests").limit(WEDDING.maxGuestsScanned).get()).docs.filter((doc) => doc.get("active") === true && doc.get("hidden") !== true);
  if (guestDocs.length < WEDDING.minGuests) return { status: "joining", nodsLeft };

  const others = guestDocs.filter((doc) => doc.id !== uid);
  const refs = others.flatMap((doc) => [db.doc(`users/${doc.id}`), db.doc(`users/${doc.id}/private/settings`), db.doc(`moderation/${doc.id}`)]);
  const [viewerSnaps, snaps, nodSnap] = await Promise.all([
    db.getAll(db.doc(`users/${uid}`), db.doc(`users/${uid}/private/settings`), db.doc(`moderation/${uid}`)),
    refs.length ? db.getAll(...refs) : Promise.resolve([]),
    weddingRef.collection("nods").where("from", "==", uid).get()
  ]);
  const viewer = memberFrom(uid, viewerSnaps[0], viewerSnaps[1], viewerSnaps[2]);
  assertMemberReady(viewer);
  const viewerLocation: LatLng | null = viewer.settings?.locationEnabled && isValidLatLng(viewer.settings.location) ? { lat: viewer.settings.location.lat, lng: viewer.settings.location.lng } : null;
  const options = { viewerLocation, sharedVibesOnly: viewer.settings?.sharedVibesOnly === true };
  const entries = others.map((doc, index) => ({ doc, entry: memberFrom(doc.id, snaps[index * 3], snaps[index * 3 + 1], snaps[index * 3 + 2]).entry }));
  const compatible = entries.filter(({ entry }) => isCandidateForViewer(viewer.entry, entry, options));
  const ids = compatible.map(({ entry }) => entry.uid);
  const [excluded, verified, incognito] = await Promise.all([loadExclusions(uid, ids), verifiedUsers(ids), hiddenIncognito(uid, compatible.map(({ entry }) => entry))]);
  const nodded = new Set(nodSnap.docs.map((doc) => String(doc.get("to"))));
  const guests = compatible
    .filter(({ entry }) => !excluded.has(entry.uid) && verified.has(entry.uid) && !incognito.has(entry.uid))
    .map(({ doc }) => ({ ...(doc.data() as Guest), nodded: nodded.has(doc.id) }))
    .sort((a, b) => orderKey(uid, a.cardId).localeCompare(orderKey(uid, b.cardId)))
    .map((guest): Card => ({ cardId: guest.cardId, nickname: guest.nickname, side: guest.side, ageBand: guest.ageBand, clue: guest.clue, nodded: guest.nodded }));
  return { status: "ready", guests, nodsLeft };
});

async function guestByCard(weddingRef: DocumentReference, cardId: string) {
  const snap = await weddingRef.collection("guests").where("cardId", "==", cardId).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

/** A secret nod. The other person is told only if they had already nodded you: then it is a normal match. */
export const sendNod = onCall({ region: REGION, secrets: WEB_PUSH_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const weddingId = weddingIdOf(request.data);
  const cardId = cardIdOf(request.data);
  await consumeDailyQuota(uid, "weddingNodCalls", WEDDING.nodCallsPerDay);
  const weddingRef = db.doc(`weddings/${weddingId}`);
  const targetGuest = await guestByCard(weddingRef, cardId);
  if (!targetGuest) throw new HttpsError("not-found", "That guest is no longer available.");
  const targetUid = targetGuest.id;
  if (targetUid === uid) throw new HttpsError("invalid-argument", "You can't nod at yourself.");

  const matchId = pairId(uid, targetUid);
  const outcome = await db.runTransaction(async (tx) => {
    const now = Date.now();
    await requireVerifiedUsers([uid, targetUid], tx, uid);
    const myGuestRef = weddingRef.collection("guests").doc(uid);
    const nodRef = weddingRef.collection("nods").doc(nodId(uid, targetUid));
    const reverseRef = weddingRef.collection("nods").doc(nodId(targetUid, uid));
    const mySwipeRef = db.doc(`swipes/${uid}/outgoing/${targetUid}`);
    const theirSwipeRef = db.doc(`swipes/${targetUid}/outgoing/${uid}`);
    const matchRef = db.doc(`matches/${matchId}`);
    const [wedding, myGuest, theirGuest, nod, reverse, mySwipe, theirSwipe, match, blocked, blockedBy, meSnap, mySettings, myModeration, targetSnap, theirSettings, theirModeration] = await tx.getAll(
      weddingRef, myGuestRef, targetGuest.ref, nodRef, reverseRef, mySwipeRef, theirSwipeRef, matchRef,
      db.doc(`blocks/${uid}/blocked/${targetUid}`), db.doc(`blocks/${targetUid}/blocked/${uid}`),
      db.doc(`users/${uid}`), db.doc(`users/${uid}/private/settings`), db.doc(`moderation/${uid}`),
      db.doc(`users/${targetUid}`), db.doc(`users/${targetUid}/private/settings`), db.doc(`moderation/${targetUid}`)
    );
    const gone = new HttpsError("not-found", "That guest is no longer available.");
    const matchActive = match.exists && match.get("active") !== false;
    if (!wedding.exists || wedding.get("status") === "hidden" || Number(wedding.get("closesAt")) <= now) throw new HttpsError("failed-precondition", "This wedding isn't open for nods.", { reason: "wedding-closed" });
    if (!myGuest.exists || myGuest.get("active") !== true || myGuest.get("hidden") === true) throw new HttpsError("permission-denied", "Join this wedding first.");
    // A repeated nod costs nothing and says nothing new (even after the match it led to).
    if (nod.exists) return { matched: matchActive, matchId: matchActive ? matchId : null, nodsLeft: Math.max(0, WEDDING.nodsPerWedding - (Number(myGuest.get("nodsUsed")) || 0)), me: undefined as Partial<PublicProfile> | undefined, created: false };
    if (!theirGuest.exists || theirGuest.get("active") !== true || theirGuest.get("hidden") === true) throw gone;
    if (blocked.exists || blockedBy.exists || mySwipe.exists) throw gone;

    const mine = buildDiscoveryEntry(uid, meSnap.data() as Partial<PublicProfile> | undefined, mySettings.data() as UserSettings | undefined, myModeration.data() as ModerationRecord | undefined);
    const theirs = buildDiscoveryEntry(targetUid, targetSnap.data() as Partial<PublicProfile> | undefined, theirSettings.data() as UserSettings | undefined, theirModeration.data() as ModerationRecord | undefined);
    const settings = mySettings.data() as UserSettings | undefined;
    const viewerLocation: LatLng | null = settings?.locationEnabled && isValidLatLng(settings.location) ? { lat: settings.location.lat, lng: settings.location.lng } : null;
    const theyLikedMe = isPositive(theirSwipe.get("type"));
    // Your own preferences decide whom you may nod at; an incognito guest is out of sight unless they liked you.
    if (!mine.visible || !isCandidateForViewer(mine, theirs, { viewerLocation, sharedVibesOnly: settings?.sharedVibesOnly === true }) || (theirs.incognito && !theyLikedMe)) throw gone;

    const used = Number(myGuest.get("nodsUsed")) || 0;
    if (used >= WEDDING.nodsPerWedding) throw new HttpsError("resource-exhausted", `You've used your ${WEDDING.nodsPerWedding} nods for this wedding.`, { reason: "nods-used" });

    tx.set(nodRef, { from: uid, to: targetUid, createdAt: FieldValue.serverTimestamp() });
    tx.update(myGuestRef, { nodsUsed: used + 1, updatedAt: now });
    tx.update(spotRef(uid, weddingId), { nodsUsed: used + 1 });

    let created = false;
    if (reverse.exists && !match.exists && isVisibleCandidate(theirs, mine)) {
      created = true;
      const me = meSnap.data() as Partial<PublicProfile> | undefined;
      tx.set(
        matchRef,
        buildMatchDoc({
          uid, targetUid, me, target: targetSnap.data() as Partial<PublicProfile> | undefined, superLikedBy: [], notes: {},
          firstMove: { [uid]: mySettings.get("firstMove") === true, [targetUid]: theirSettings.get("firstMove") === true },
          source: "wedding"
        }).data
      );
      // As with any match, both people leave each other's Discover feed.
      tx.set(mySwipeRef, { fromUid: uid, toUid: targetUid, type: "like", source: "wedding", createdAt: FieldValue.serverTimestamp() });
      if (!isPositive(theirSwipe.get("type"))) tx.set(theirSwipeRef, { fromUid: targetUid, toUid: uid, type: "like", source: "wedding", createdAt: FieldValue.serverTimestamp() });
    }
    return { matched: created || matchActive, matchId: created || matchActive ? matchId : null, nodsLeft: WEDDING.nodsPerWedding - used - 1, me: meSnap.data() as Partial<PublicProfile> | undefined, created };
  });

  if (outcome.created) {
    await sendPushToUser(targetUid, {
      kind: "matches",
      title: "It's a match! ✨",
      body: `You and ${snippetOf(outcome.me).displayName} liked each other. Say hi!`,
      data: { type: "match", matchId },
      tag: `match-${matchId}`
    });
  }
  return { matched: outcome.matched, matchId: outcome.matchId, nodsLeft: outcome.nodsLeft };
});

/** Leaves the wedding: your card goes and your clue is erased. Nods already sent stay counted. */
export const leaveWedding = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const weddingId = weddingIdOf(request.data);
  const guestRef = db.doc(`weddings/${weddingId}/guests/${uid}`);
  const guest = await guestRef.get();
  if (!guest.exists) return { ok: true };
  const invitePath = guest.get("invitePath") as string | null;
  await db.runTransaction(async (tx) => {
    tx.update(guestRef, { active: false, clue: "", invitePath: null, updatedAt: Date.now() });
    tx.update(spotRef(uid, weddingId), { active: false, clue: "" });
  });
  if (invitePath) await bucket().file(invitePath).delete({ ignoreNotFound: true }).catch(() => undefined);
  return { ok: true };
});

/** Report and/or block someone from their card. The card has no uid: the server resolves it. */
export const weddingGuestSafety = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const weddingId = weddingIdOf(request.data);
  const cardId = cardIdOf(request.data);
  const body = request.data as { action?: unknown; reason?: unknown; details?: unknown };
  if (body.action !== "report" && body.action !== "block") throw new HttpsError("invalid-argument", "Choose report or block.");
  await consumeDailyQuota(uid, "weddingSafetyCalls", WEDDING.safetyCallsPerDay);
  const weddingRef = db.doc(`weddings/${weddingId}`);
  const [mine, target] = await Promise.all([weddingRef.collection("guests").doc(uid).get(), guestByCard(weddingRef, cardId)]);
  if (!mine.exists || !target || target.id === uid) throw new HttpsError("not-found", "That guest is no longer available.");
  const targetUid = target.id;

  if (body.action === "report") {
    if (!(REPORT_REASONS as readonly unknown[]).includes(body.reason)) throw new HttpsError("invalid-argument", "Choose a report reason.");
    const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";
    if (body.reason === "other" && details.length < 5) throw new HttpsError("invalid-argument", "Please add a few details.");
    const reportId = createHash("sha256").update(`wedding-report|${weddingId}|${uid}|${targetUid}`).digest("hex").slice(0, 20);
    const quota = dailyLimitRef(uid);
    await db.runTransaction(async (tx) => {
      const [reportSnap, targetGuest, targetProfile, quotaSnap] = await tx.getAll(db.doc(`reports/${reportId}`), target.ref, db.doc(`users/${targetUid}`), quota);
      if (reportSnap.exists) return;
      const used = Number(quotaSnap.get("reports")) || 0;
      if (used >= 30) throw new HttpsError("resource-exhausted", "You've sent 30 reports today. Use Contact support in Settings for further concerns.");
      tx.set(quota, { reports: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(reportSnap.ref, {
        reporterId: uid, targetId: targetUid, reason: body.reason, details, source: "wedding", weddingId,
        targetSnapshot: { displayName: String(targetProfile.get("displayName") ?? "Paire member").slice(0, 40), photoUrls: [] },
        evidence: { nickname: targetGuest.get("nickname"), clue: targetGuest.get("clue"), side: targetGuest.get("side") },
        status: "received", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      const reporters = new Set<string>((targetGuest.get("reporters") as string[] | undefined) ?? []);
      reporters.add(reporterHash(weddingId, uid));
      tx.update(target.ref, { reporters: [...reporters], ...(reporters.size >= WEDDING.hideAfterReporters ? { hidden: true } : {}), updatedAt: Date.now() });
    });
  }
  // Reporting also blocks, as everywhere else in Paire.
  await blockMember(uid, targetUid);
  return { ok: true };
});

async function deleteInvite(path: unknown): Promise<void> {
  if (typeof path === "string" && path.startsWith("wedding-invites/")) await bucket().file(path).delete({ ignoreNotFound: true }).catch(() => undefined);
}

async function deleteQuery(query: Query): Promise<void> {
  for (;;) {
    const snap = await query.limit(300).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

/** Erases everything a member has in any wedding. Part of deleteAccount; safe to run twice. */
export async function purgeWeddingData(uid: string): Promise<void> {
  const spots = await db.collection(`users/${uid}/weddingSpots`).get();
  for (const spot of spots.docs) {
    const weddingRef = db.doc(`weddings/${spot.id}`);
    const guest = await weddingRef.collection("guests").doc(uid).get();
    await deleteInvite(guest.get("invitePath"));
    await guest.ref.delete();
    await deleteQuery(weddingRef.collection("nods").where("from", "==", uid));
    await deleteQuery(weddingRef.collection("nods").where("to", "==", uid));
  }
  try {
    await bucket().deleteFiles({ prefix: `wedding-invites/${uid}/` });
  } catch (error) {
    logger.warn("Wedding invitation cleanup failed", { uid, error: String(error) });
  }
}

/** Deletes a closed wedding: guests, nicknames, nods, members' mirrors and invitation photos. Matches stay. */
async function eraseWedding(ref: DocumentReference): Promise<void> {
  const guests = await ref.collection("guests").get();
  for (let i = 0; i < guests.size; i += 400) {
    const batch = db.batch();
    guests.docs.slice(i, i + 400).forEach((guest) => batch.delete(spotRef(guest.id, ref.id)));
    await batch.commit();
  }
  for (const guest of guests.docs) await deleteInvite(guest.get("invitePath"));
  await db.recursiveDelete(ref);
}

export async function runWeddingCleanup(now = Date.now()): Promise<{ closed: number; invitesDeleted: number }> {
  let closed = 0;
  for (;;) {
    const snap = await db.collection("weddings").where("closesAt", "<=", now).limit(20).get();
    if (snap.empty) break;
    for (const wedding of snap.docs) {
      await eraseWedding(wedding.ref);
      closed += 1;
    }
  }
  let invitesDeleted = 0;
  const [files] = await bucket().getFiles({ prefix: "wedding-invites/" });
  for (const file of files) {
    const created = Date.parse(String(file.metadata.timeCreated ?? ""));
    if (Number.isFinite(created) && now - created > WEDDING.inviteRetentionMs) {
      await file.delete({ ignoreNotFound: true });
      invitesDeleted += 1;
    }
  }
  return { closed, invitesDeleted };
}

/** Daily: closes weddings 7 days after their date and deletes invitation photos after 30 days. */
export const cleanupWeddings = onSchedule({ region: REGION, schedule: "30 3 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540, memory: "512MiB", maxInstances: 1, retryCount: 0 }, async () => {
  const result = await runWeddingCleanup();
  logger.info("Wedding cleanup", result);
});
