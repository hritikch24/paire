import { WEB_PUSH_SECRETS } from "./webPush";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { chatPolicy } from "./chatEntitlement";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { buildDiscoveryEntry } from "./lib/discovery";
import { pairId } from "./lib/ids";
import { assertLikeEligible, buildMatchDoc } from "./lib/matchDoc";
import { parseTargetInput } from "./lib/validate";
import { snippetOf } from "./profiles";
import { sendPushToUser } from "./push";
import { consumeDailyQuota } from "./quota";
import { requireVerifiedUsers, verifiedUsers } from "./trust";
import { ModerationRecord, PublicProfile, UserSettings } from "./types";

export type AcceptLikeResult = { matched: true; matchId: string };

const GONE = "That like is no longer available.";

/**
 * A woman accepts a pending like (a like or Super Like) and the match is created
 * right away. Same match document and "It's a match" push as a mutual swipe, but
 * it is not a swipe: it uses no daily like. Off until runtime/trust.acceptFlow.
 *
 * One transaction re-reads everything, so a like left over after a block, an
 * unmatch, a ban, lost verification or a hidden profile never makes a match, and
 * double taps (or two tabs) make exactly one match and one notification.
 */
export const acceptLike = onCall({ region: REGION, secrets: WEB_PUSH_SECRETS }, async (request): Promise<AcceptLikeResult> => {
  const uid = requireAuth(request);
  const { targetUid } = parseTargetInput(request.data);
  if (targetUid === uid) throw new HttpsError("invalid-argument", "You can't accept your own like.");
  if (!(await chatPolicy()).acceptFlow) {
    throw new HttpsError("failed-precondition", "Accepting likes isn't available yet.", { reason: "accept-off" });
  }
  await consumeDailyQuota(uid, "acceptChecks", 300);

  const matchId = pairId(uid, targetUid);
  const matchRef = db.doc(`matches/${matchId}`);
  const hisLikeRef = db.doc(`swipes/${targetUid}/outgoing/${uid}`);
  const herLikeRef = db.doc(`swipes/${uid}/outgoing/${targetUid}`);

  const outcome = await db.runTransaction(async (tx) => {
    // She must be able to date. He just stops being available, whatever the reason.
    await requireVerifiedUsers([uid], tx);
    if (!(await verifiedUsers([targetUid], tx)).has(targetUid)) throw new HttpsError("not-found", GONE);

    const [matchSnap, hisLikeSnap, blockedSnap, blockedBySnap, meSnap, targetSnap, mySettings, theirSettings, myModeration, theirModeration] = await tx.getAll(
      matchRef,
      hisLikeRef,
      db.doc(`blocks/${uid}/blocked/${targetUid}`),
      db.doc(`blocks/${targetUid}/blocked/${uid}`),
      db.doc(`users/${uid}`),
      db.doc(`users/${targetUid}`),
      db.doc(`users/${uid}/private/settings`),
      db.doc(`users/${targetUid}/private/settings`),
      db.doc(`moderation/${uid}`),
      db.doc(`moderation/${targetUid}`)
    );

    if (meSnap.get("gender") !== "woman") {
      throw new HttpsError("permission-denied", "Only women can accept a like.");
    }
    if (!targetSnap.exists || blockedSnap.exists || blockedBySnap.exists) throw new HttpsError("not-found", GONE);

    if (matchSnap.exists) {
      // Already matched: a double tap or a second tab. Same answer, nothing written, no second push.
      // An ended match (unmatch or block) is never brought back.
      if (matchSnap.get("active") === false) throw new HttpsError("not-found", GONE);
      return { created: false, me: undefined as Partial<PublicProfile> | undefined };
    }

    const hisType = hisLikeSnap.get("type");
    if (!hisLikeSnap.exists || (hisType !== "like" && hisType !== "super")) throw new HttpsError("not-found", GONE);

    const me = meSnap.data() as Partial<PublicProfile> | undefined;
    const mine = buildDiscoveryEntry(uid, me, mySettings.data() as UserSettings | undefined, myModeration.data() as ModerationRecord | undefined);
    const theirs = buildDiscoveryEntry(targetUid, targetSnap.data() as Partial<PublicProfile>, theirSettings.data() as UserSettings | undefined, theirModeration.data() as ModerationRecord | undefined);
    assertLikeEligible({ mine, theirs, theyLikedMe: true, mySettings: mySettings.data() as UserSettings | undefined, note: null });

    // Her side of the pair, so the swipe history matches a mutual like. No dailyLimits write.
    tx.set(herLikeRef, { fromUid: uid, toUid: targetUid, type: "like", createdAt: FieldValue.serverTimestamp() });
    tx.set(
      matchRef,
      buildMatchDoc({
        uid,
        targetUid,
        me,
        target: targetSnap.data() as Partial<PublicProfile> | undefined,
        superLikedBy: hisType === "super" ? [targetUid] : [],
        notes: { [targetUid]: hisLikeSnap.get("note") },
        firstMove: { [uid]: mySettings.get("firstMove") === true, [targetUid]: theirSettings.get("firstMove") === true }
      }).data
    );
    return { created: true, me };
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
  return { matched: true, matchId };
});
