import { WEB_PUSH_SECRETS } from "./webPush";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { LIMITS, REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { pairId } from "./lib/ids";
import { isCandidateForViewer, candidateLatLng } from "./lib/prefs";
import { buildDiscoveryEntry, viewerTraits, toDiscoverProfile } from "./lib/discovery";
import { assertLikeEligible, buildMatchDoc } from "./lib/matchDoc";
import { parseSwipeInput, parseTargetInput } from "./lib/validate";
import { snippetOf } from "./profiles";
import { sendPushToUser } from "./push";
import { requireVerifiedUsers } from "./trust";
import { limitsFor } from "./premium";
import { dailyLimitRef } from "./quota";
import { ModerationRecord, PublicProfile, SwipeType, UserSettings } from "./types";

type SwipeResult = {
  matched: boolean;
  matchId: string | null;
  remaining: { likes: number | null; supers: number };
};

const COUNTER_FIELD: Record<SwipeType, "likes" | "supers" | "passes"> = {
  like: "likes",
  super: "supers",
  nope: "passes"
};

const isPositive = (type: unknown) => type === "like" || type === "super";

/**
 * Records a swipe and, when the other person already liked back, creates the
 * match in the same transaction. This is the only way swipes and matches are
 * written, so a "match" always means a real mutual like.
 */
export const swipe = onCall({ region: REGION, secrets: WEB_PUSH_SECRETS }, async (request): Promise<SwipeResult> => {
  const uid = requireAuth(request);
  const { targetUid, type, note } = parseSwipeInput(request.data);
  if (targetUid === uid) {
    throw new HttpsError("invalid-argument", "You can't swipe on yourself.");
  }

  const matchId = pairId(uid, targetUid);
  const limitRef = dailyLimitRef(uid);
  const swipeRef = db.doc(`swipes/${uid}/outgoing/${targetUid}`);
  const reciprocalRef = db.doc(`swipes/${targetUid}/outgoing/${uid}`);
  const matchRef = db.doc(`matches/${matchId}`);

  const outcome = await db.runTransaction(async (tx) => {
    await requireVerifiedUsers([uid, targetUid], tx);
    const [limitSnap, existingSnap, reciprocalSnap, matchSnap, blockedSnap, blockedBySnap, meSnap, targetSnap, billingSnap, mySettings, theirSettings, myModeration, theirModeration] =
      await tx.getAll(
        limitRef,
        swipeRef,
        reciprocalRef,
        matchRef,
        db.doc(`blocks/${uid}/blocked/${targetUid}`),
        db.doc(`blocks/${targetUid}/blocked/${uid}`),
        db.doc(`users/${uid}`),
        db.doc(`users/${targetUid}`),
        db.doc(`billing/${uid}`),
        db.doc(`users/${uid}/private/settings`),
        db.doc(`users/${targetUid}/private/settings`),
        db.doc(`moderation/${uid}`),
        db.doc(`moderation/${targetUid}`)
      );

    const restored = existingSnap.get("type") === "rewound";
    const eventId = existingSnap.get("eventId") ?? request.data?.eventId;
    if (eventId !== undefined) {
      if (typeof eventId !== "string" || !/^[A-Za-z0-9]{20}$/.test(eventId)) throw new HttpsError("invalid-argument","Invalid room.");
      const room = db.collection("eventRooms").doc(eventId);
      const [listing, mine, theirs] = await tx.getAll(room,room.collection("eventParticipants").doc(uid),room.collection("eventParticipants").doc(targetUid));
      if (!mine.exists || !theirs.exists || listing.get("status") !== "published" || Date.now() >= listing.get("closesAt")) throw new HttpsError("failed-precondition","This event action is no longer available.");
    }
    if (!targetSnap.exists || blockedSnap.exists || blockedBySnap.exists) {
      throw new HttpsError("not-found", "That profile is no longer available.");
    }

    const limits = limitsFor(billingSnap.data());
    const limitFor = { like: limits.likesPerDay, super: limits.supersPerDay, nope: LIMITS.passesPerDay };
    const used = {
      likes: (limitSnap.get("likes") as number | undefined) ?? 0,
      supers: (limitSnap.get("supers") as number | undefined) ?? 0,
      passes: (limitSnap.get("passes") as number | undefined) ?? 0
    };
    const remaining = () => ({
      likes: limits.likesPerDay === null ? null : Math.max(0, limits.likesPerDay - used.likes),
      supers: Math.max(0, limits.supersPerDay - used.supers)
    });

    // Retries of the same swipe are idempotent. Paire Plus members can swipe again on
    // someone they passed on (they see them again once everyone new is seen); likes stay final.
    const secondLook = existingSnap.get("type") === "nope" && type !== "nope" && limits.priority;
    if (existingSnap.exists && !secondLook && !restored) {
      const active = matchSnap.exists && matchSnap.get("active") !== false;
      return { matched: false, matchId: active ? matchId : null, remaining: remaining(), me: null };
    }

    const reciprocalType = reciprocalSnap.get("type");
    const theyLikedMe = isPositive(reciprocalType);

    // A stale card or a hand-crafted API request must not bypass current preferences or hiding.
    if (isPositive(type) || eventId || restored) {
      const mine = buildDiscoveryEntry(uid, meSnap.data() as Partial<PublicProfile>, mySettings.data() as UserSettings | undefined, myModeration.data() as ModerationRecord | undefined);
      const theirs = buildDiscoveryEntry(targetUid, targetSnap.data() as Partial<PublicProfile>, theirSettings.data() as UserSettings | undefined, theirModeration.data() as ModerationRecord | undefined);
      assertLikeEligible({ mine, theirs, theyLikedMe, mySettings: mySettings.data() as UserSettings | undefined, note, passing: type === "nope" });
    }

    const historyRef = db.doc(`swipes/${uid}`);
    if (type === "nope") {
      const history = await tx.get(historyRef);
      const recent: string[] = history.get("recentPasses") ?? [];
      tx.set(historyRef, { recentPasses: [targetUid, ...recent.filter(id => id !== targetUid)].slice(0, 3) }, { merge: true });
    }
    const counter = COUNTER_FIELD[type];
    const cap = limitFor[type];
    if (cap !== null && used[counter] >= cap) {
      throw new HttpsError(
        "resource-exhausted",
        type === "super"
          ? "You're out of Super Likes for today."
          : type === "nope" ? "You've reached today's pass limit. Come back tomorrow." : limits.priority ? "You've used today's Plus likes. Your allowance resets tomorrow." : "You've used today's free likes. Get Paire Plus for 100 likes a day.",
        { reason: "daily-swipe-limit", kind: type, upgradeAvailable: type !== "nope" && !limits.priority }
      );
    }
    used[counter] += 1;

    tx.set(swipeRef, {
      ...(eventId ? { eventId } : {}),
      fromUid: uid,
      toUid: targetUid,
      type,
      ...(note ? { note } : {}),
      // Paire Plus likes are listed first in the other person's "Likes you".
      ...(isPositive(type) && limits.priority ? { priority: true } : {}),
      createdAt: FieldValue.serverTimestamp()
    });
    tx.set(
      limitRef,
      { [counter]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    if (type === "super") {
      tx.set(db.doc(`superLikes/${targetUid}/from/${uid}`), {
        fromUid: uid,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    const matched = isPositive(type) && theyLikedMe && !matchSnap.exists;
    const me = meSnap.data() as Partial<PublicProfile> | undefined;
    if (matched) {
      const target = targetSnap.data() as Partial<PublicProfile> | undefined;
      const superLikedBy = [
        ...(type === "super" ? [uid] : []),
        ...(reciprocalType === "super" ? [targetUid] : [])
      ];
      tx.set(
        matchRef,
        buildMatchDoc({
          uid,
          targetUid,
          me,
          target,
          ...(eventId ? {source:"event"} : {}),
          superLikedBy,
          notes: { [uid]: note ?? undefined, [targetUid]: reciprocalSnap.get("note") },
          firstMove: {
            [uid]: mySettings.get("firstMove") === true,
            [targetUid]: theirSettings.get("firstMove") === true
          }
        }).data
      );
    }

    return { matched, matchId: matched ? matchId : null, remaining: remaining(), me };
  });

  if (outcome.matched && outcome.matchId) {
    await sendPushToUser(targetUid, {
      kind: "matches",
      title: "It's a match! ✨",
      body: `You and ${snippetOf(outcome.me ?? undefined).displayName} liked each other. Say hi!`,
      data: { type: "match", matchId: outcome.matchId },
      tag: `match-${outcome.matchId}`
    });
  }

  // A first-time like that didn't match yet: tell them, without saying who (only Plus reveals that).
  if (!outcome.matched && outcome.me && isPositive(type)) {
    await sendPushToUser(targetUid, {
      kind: "likes",
      title: type === "super" ? "Someone Super Liked you ⭐" : "Someone likes you 💛",
      body: "Open Paire to see your likes.",
      data: { type: "like" },
      tag: `likes-${targetUid}`
    });
  }

  return { matched: outcome.matched, matchId: outcome.matchId, remaining: outcome.remaining };
});

/** Brings back the last profile you passed on. Likes can't be undone once sent. */
export const undoSwipe = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { targetUid } = parseTargetInput(request.data);
  const swipeRef = db.doc(`swipes/${uid}/outgoing/${targetUid}`);
  const historyRef = db.doc(`swipes/${uid}`);
  return db.runTransaction(async tx => {
    await requireVerifiedUsers([uid, targetUid], tx);
    const [history, swipe, block, blockedBy, match, me, them, mySettings, theirSettings, myMod, theirMod] = await tx.getAll(
      historyRef, swipeRef, db.doc(`blocks/${uid}/blocked/${targetUid}`), db.doc(`blocks/${targetUid}/blocked/${uid}`),
      db.doc(`matches/${pairId(uid,targetUid)}`), db.doc(`users/${uid}`), db.doc(`users/${targetUid}`),
      db.doc(`users/${uid}/private/settings`), db.doc(`users/${targetUid}/private/settings`),
      db.doc(`moderation/${uid}`), db.doc(`moderation/${targetUid}`)
    );
    const eventId = swipe.get("eventId");
    if (eventId) {
      const room = db.collection("eventRooms").doc(eventId);
      const [listing, mine, theirs] = await tx.getAll(room,room.collection("eventParticipants").doc(uid),room.collection("eventParticipants").doc(targetUid));
      if (!mine.exists || !theirs.exists || listing.get("status") !== "published" || Date.now() >= listing.get("closesAt")) throw new HttpsError("failed-precondition","Room unavailable.");
    }
    const recent: string[] = history.get("recentPasses") ?? [];
    const mine = buildDiscoveryEntry(uid, me.data(), mySettings.data(), myMod.data());
    const theirs = buildDiscoveryEntry(targetUid, them.data(), theirSettings.data(), theirMod.data());
    const location = candidateLatLng(mine);
    if (!recent.includes(targetUid) || swipe.get("type") !== "nope" || block.exists || blockedBy.exists || match.exists ||
      !mine.visible || theirs.incognito || !isCandidateForViewer(mine, theirs, { viewerLocation: location, sharedVibesOnly: mySettings.get("sharedVibesOnly") === true })) {
      throw new HttpsError("failed-precondition", "This profile is no longer available to rewind.");
    }
    const profile = toDiscoverProfile(them.data()!, theirs, location, false, viewerTraits(mine, me.data()));
    if (!profile) throw new HttpsError("not-found", "Profile unavailable.");
    tx.update(swipeRef, {type:"rewound"});
    tx.update(historyRef, { recentPasses: recent.filter(id => id !== targetUid) });
    return { ok: true, profile };
  });
});
