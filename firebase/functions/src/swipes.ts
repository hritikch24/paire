import { WEB_PUSH_SECRETS } from "./webPush";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { LIMITS, REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { pairId } from "./lib/ids";
import { firstMoveOf, sparksOf } from "./lib/sparks";
import { buildDiscoveryEntry } from "./lib/discovery";
import { candidateLatLng, isCandidateForViewer } from "./lib/prefs";
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
  remaining: { likes: number; supers: number };
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
      likes: Math.max(0, limits.likesPerDay - used.likes),
      supers: Math.max(0, limits.supersPerDay - used.supers)
    });

    // Retries of the same swipe are idempotent. Paire Plus members can swipe again on
    // someone they passed on (they see them again once everyone new is seen); likes stay final.
    const secondLook = existingSnap.get("type") === "nope" && type !== "nope" && limits.priority;
    if (existingSnap.exists && !secondLook) {
      const active = matchSnap.exists && matchSnap.get("active") !== false;
      return { matched: false, matchId: active ? matchId : null, remaining: remaining(), me: null };
    }

    const reciprocalType = reciprocalSnap.get("type");
    const theyLikedMe = isPositive(reciprocalType);

    // A stale card or a hand-crafted API request must not bypass current preferences or hiding.
    if (isPositive(type)) {
      const mine = buildDiscoveryEntry(uid, meSnap.data() as Partial<PublicProfile>, mySettings.data() as UserSettings | undefined, myModeration.data() as ModerationRecord | undefined);
      const theirs = buildDiscoveryEntry(targetUid, targetSnap.data() as Partial<PublicProfile>, theirSettings.data() as UserSettings | undefined, theirModeration.data() as ModerationRecord | undefined);
      if (!mine.visible || !isCandidateForViewer(mine, theirs, { viewerLocation: candidateLatLng(mine), sharedVibesOnly: mySettings.get("sharedVibesOnly") === true })) {
        throw new HttpsError("not-found", "That profile is no longer available for matching.");
      }
      // Incognito members can only be liked back, never discovered.
      if (theirs.incognito && !theyLikedMe) {
        throw new HttpsError("not-found", "That profile is no longer available for matching.");
      }
      // "Notes only": a like needs a note, unless it answers their like.
      if (theirs.requireNote && !note && !theyLikedMe) {
        throw new HttpsError("failed-precondition", "They only accept likes with a note. Add one to say why you'd click.");
      }
    }

    const counter = COUNTER_FIELD[type];
    if (used[counter] >= limitFor[type]) {
      throw new HttpsError(
        "resource-exhausted",
        type === "super"
          ? "You're out of Super Likes for today."
          : "You've reached today's like limit. Come back tomorrow!"
      );
    }
    used[counter] += 1;

    tx.set(swipeRef, {
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
      const participants = [uid, targetUid].sort();
      const superLikedBy = [
        ...(type === "super" ? [uid] : []),
        ...(reciprocalType === "super" ? [targetUid] : [])
      ];
      tx.set(matchRef, {
        id: matchId,
        participants,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        lastActivityAt: FieldValue.serverTimestamp(),
        profiles: { [uid]: snippetOf(me), [targetUid]: snippetOf(target) },
        lastMessage: null,
        unread: { [participants[0]]: 0, [participants[1]]: 0 },
        lastReadAt: {},
        superLikedBy,
        // The notes sent with each like open the chat, so it never starts empty.
        sparks: sparksOf({ [uid]: note, [targetUid]: reciprocalSnap.get("note") }),
        // "I'll message first": set when exactly one of them chose it.
        firstMoveBy: firstMoveOf({
          [uid]: mySettings.get("firstMove") === true,
          [targetUid]: theirSettings.get("firstMove") === true
        })
      });
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

  return { matched: outcome.matched, matchId: outcome.matchId, remaining: outcome.remaining };
});

/** Brings back the last profile you passed on. Likes can't be undone once sent. */
export const undoSwipe = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { targetUid } = parseTargetInput(request.data);
  const swipeRef = db.doc(`swipes/${uid}/outgoing/${targetUid}`);
  const snap = await swipeRef.get();
  if (!snap.exists) return { ok: true };
  if (snap.get("type") !== "nope") {
    throw new HttpsError("failed-precondition", "Only passes can be undone.");
  }
  await swipeRef.delete();
  return { ok: true };
});
