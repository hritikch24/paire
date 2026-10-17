import { DocumentSnapshot, FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { DUOS, LIMITS, REGION } from "./config";
import { syncDiscoveryIndex } from "./discovery";
import { requireVerifiedUsers, verifiedUsers } from "./trust";
import { requireAuth, requireReadAuth, isSupportSession } from "./lib/auth";
import { toDiscoverProfile, viewerTraits } from "./lib/discovery";
import { publicSnippet } from "./duoSnippets";
import { Traits } from "./lib/insights";
import { duoInsight, duoMatchIdOf, duosFit, newInviteCode, normaliseInviteCode } from "./lib/duos";
import { candidateLatLng } from "./lib/prefs";
import { parseDuoSwipeInput, parseMatchInput } from "./lib/validate";
import { snippetOf } from "./profiles";
import { sendPushToUser } from "./push";
import { consumeDailyQuota } from "./quota";
import { DiscoverProfile, DiscoveryEntry, Duo, DuoCard, MatchProfileSnippet, PublicProfile } from "./types";

/**
 * Duos: two friends team up, match with another pair, and get a four-person
 * chat. Invites, the Duo deck, likes and the group chat's membership all go
 * through these callables; clients can only read (see firestore.rules).
 *
 * Nobody becomes a Duo without both people agreeing: a friend enters your
 * code, and you confirm it's them.
 */

const HOUR_MS = 60 * 60 * 1000;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const namesOf = (profiles: MatchProfileSnippet[]) => profiles.map((p) => firstName(p.displayName)).join(" & ");
const NO_TRAITS: Traits = { interests: [], vibes: [], intentions: [], quickAnswers: [], casual: false };

function activeDuoQuery(uid: string) {
  return db.collection("duos").where("members", "array-contains", uid).where("status", "==", "active").limit(1);
}

/** The caller's active duo, if any. */
export async function activeDuoOf(uid: string, tx?: Transaction): Promise<DocumentSnapshot | null> {
  const snap = tx ? await tx.get(activeDuoQuery(uid)) : await activeDuoQuery(uid).get();
  return snap.empty ? null : snap.docs[0];
}

async function requireActiveDuo(uid: string): Promise<{ id: string; duo: Duo }> {
  const snap = await activeDuoOf(uid);
  if (!snap) throw new HttpsError("failed-precondition", "Team up with a friend first.");
  return { id: snap.id, duo: snap.data() as Duo };
}

/** Discovery entries by uid. Missing ones are rebuilt only for `rebuild` (the caller's own pair). */
async function discoveryEntries(uids: string[], rebuild: string[] = []): Promise<Map<string, DiscoveryEntry>> {
  const unique = Array.from(new Set(uids));
  const entries = new Map<string, DiscoveryEntry>();
  for (let i = 0; i < unique.length; i += 300) {
    const snaps = await db.getAll(...unique.slice(i, i + 300).map((uid) => db.doc(`discovery/${uid}`)));
    snaps.forEach((snap) => snap.exists && entries.set(snap.id, snap.data() as DiscoveryEntry));
  }
  for (const uid of rebuild) {
    if (!entries.has(uid)) {
      const entry = await syncDiscoveryIndex(uid);
      if (entry) entries.set(uid, entry);
    }
  }
  return entries;
}

/** Everyone the given people blocked, and everyone who blocked any of them. */
async function blockedAround(members: string[]): Promise<Set<string>> {
  const [mine, theirs] = await Promise.all([
    Promise.all(members.map((uid) => db.collection(`blocks/${uid}/blocked`).select().get())),
    db.collectionGroup("blocked").where("targetUid", "in", members).select().get()
  ]);
  const blocked = new Set<string>();
  mine.forEach((snap) => snap.docs.forEach((doc) => blocked.add(doc.id)));
  theirs.docs.forEach((doc) => doc.ref.parent.parent && blocked.add(doc.ref.parent.parent.id));
  return blocked;
}

/** Someone's traits for the matchmaker, never with the casual flag. */
function traitsOf(entry: DiscoveryEntry | undefined, profile: Partial<PublicProfile> | undefined): Traits {
  return entry ? { ...viewerTraits(entry, profile), casual: false } : NO_TRAITS;
}

function forDuoCard(profile: DiscoverProfile): DiscoverProfile {
  // Duos never carry the one-night-stand signal.
  return {
    ...profile,
    superLikedYou: false,
    casualMatch: false,
    reasons: profile.reasons.filter((reason) => reason.kind !== "casual")
  };
}

// ------------------------------------------------------------------ invites

type InviteRequest = { uid: string; displayName: string; photoUrl: string | null; age: number | null };

/** Deletes your code, and withdraws anyone's pending request to join with it. */
async function clearInvite(uid: string): Promise<void> {
  const ref = db.doc(`users/${uid}/private/duoInvite`);
  const snap = await ref.get();
  const code = snap.get("code") as string | undefined;
  const request = snap.get("request") as InviteRequest | undefined;
  await ref.delete();
  if (code) await db.doc(`duoInvites/${code}`).delete();
  if (request?.uid) await db.doc(`users/${request.uid}/private/duoRequest`).delete();
}

/** A 6-character code for a friend. They enter it, then you confirm it's them. */
export const createDuoInvite = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  await requireVerifiedUsers([uid]);
  if (await activeDuoOf(uid)) {
    throw new HttpsError("failed-precondition", "You're already in a Duo. Leave it first to team up with someone else.");
  }
  const me = await db.doc(`users/${uid}`).get();
  if (!me.exists || me.get("onboardingComplete") !== true) {
    throw new HttpsError("failed-precondition", "Finish your profile first.");
  }
  await clearInvite(uid);

  const expiresAt = Date.now() + DUOS.inviteHours * HOUR_MS;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newInviteCode();
    try {
      await db.doc(`duoInvites/${code}`).create({
        fromUid: uid,
        createdAt: FieldValue.serverTimestamp(),
        // Deleted by the TTL policy in firestore.indexes.json once expired.
        expiresAt: Timestamp.fromMillis(expiresAt)
      });
    } catch (error) {
      if ((error as { code?: number }).code === 6) continue; // Code taken: try another.
      throw error;
    }
    await db.doc(`users/${uid}/private/duoInvite`).set({ code, expiresAt });
    return { code, expiresAt };
  }
  throw new HttpsError("unavailable", "Couldn't make a code. Please try again.");
});

export const cancelDuoInvite = onCall({ region: REGION }, async (request) => {
  await clearInvite(requireAuth(request));
  return { ok: true };
});

const NO_SUCH_CODE = "That code has expired or doesn't exist. Ask your friend for a new one.";

/**
 * A friend enters your code: this sends you a request to confirm. Tries are
 * limited per day, so codes can't be found by guessing.
 */
export const acceptDuoInvite = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  await requireVerifiedUsers([uid]);
  const code = normaliseInviteCode((request.data as { code?: unknown } | null)?.code);
  if (!code) {
    throw new HttpsError("invalid-argument", "Codes are 6 letters and numbers, and never use 0, O, 1, I or L.");
  }
  await consumeDailyQuota(uid, "duoCodeTries", LIMITS.duoCodeTriesPerDay);

  const result = await db.runTransaction(async (tx) => {
    const inviteRef = db.doc(`duoInvites/${code}`);
    const inviteSnap = await tx.get(inviteRef);
    const expiresAt = (inviteSnap.get("expiresAt") as Timestamp | undefined)?.toMillis() ?? 0;
    if (!inviteSnap.exists || expiresAt < Date.now()) throw new HttpsError("not-found", NO_SUCH_CODE);
    const friendUid = inviteSnap.get("fromUid") as string;
    if (friendUid === uid) {
      throw new HttpsError("invalid-argument", "That's your own code. Send it to a friend to team up.");
    }
    const requestedBy = inviteSnap.get("requestedBy") as string | undefined;
    if (requestedBy && requestedBy !== uid) {
      throw new HttpsError("failed-precondition", "Someone else already used that code. Ask your friend for a new one.");
    }
    const [meSnap, friendSnap, blockedSnap, blockedBySnap] = await tx.getAll(
      db.doc(`users/${uid}`),
      db.doc(`users/${friendUid}`),
      db.doc(`blocks/${uid}/blocked/${friendUid}`),
      db.doc(`blocks/${friendUid}/blocked/${uid}`)
    );
    if (!friendSnap.exists || blockedSnap.exists || blockedBySnap.exists) throw new HttpsError("not-found", NO_SUCH_CODE);
    if (!meSnap.exists || meSnap.get("onboardingComplete") !== true) {
      throw new HttpsError("failed-precondition", "Finish your profile first.");
    }
    if ((await activeDuoOf(uid, tx)) || (await activeDuoOf(friendUid, tx))) {
      throw new HttpsError("failed-precondition", "One of you is already in a Duo.");
    }

    await requireVerifiedUsers([uid, friendUid], tx);
    const me = meSnap.data() as Partial<PublicProfile>;
    const friend = snippetOf(friendSnap.data() as Partial<PublicProfile>);
    const asking: InviteRequest = { uid, ...snippetOf(me), age: typeof me.age === "number" ? me.age : null };
    tx.update(inviteRef, { requestedBy: uid, requestedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc(`users/${friendUid}/private/duoInvite`), { request: asking }, { merge: true });
    tx.set(db.doc(`users/${uid}/private/duoRequest`), {
      code,
      toUid: friendUid,
      toName: friend.displayName,
      toPhotoUrl: friend.photoUrl,
      expiresAt
    });
    return { friendUid, friendName: friend.displayName, myName: asking.displayName };
  });

  await sendPushToUser(result.friendUid, {
    kind: "matches",
    title: `${firstName(result.myName)} wants to be your Duo`,
    body: "Open Paire to confirm it's your friend.",
    data: { type: "duo" },
    tag: "duo-request"
  });
  return { pending: true, friendName: result.friendName };
});

/** The inviter confirms (or declines) the friend who entered their code. */
export const answerDuoRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const accept = (request.data as { accept?: unknown } | null)?.accept === true;
  const myInviteRef = db.doc(`users/${uid}/private/duoInvite`);

  const result = await db.runTransaction(async (tx) => {
    const myInvite = await tx.get(myInviteRef);
    const code = myInvite.get("code") as string | undefined;
    const asking = myInvite.get("request") as InviteRequest | undefined;
    if (!code || !asking?.uid) throw new HttpsError("failed-precondition", "There's no request to answer.");
    const inviteRef = db.doc(`duoInvites/${code}`);
    const friendRequestRef = db.doc(`users/${asking.uid}/private/duoRequest`);
    const [inviteSnap, friendRequest, friendInvite, meSnap, friendSnap, blockedSnap, blockedBySnap] = await tx.getAll(
      inviteRef,
      friendRequestRef,
      db.doc(`users/${asking.uid}/private/duoInvite`),
      db.doc(`users/${uid}`),
      db.doc(`users/${asking.uid}`),
      db.doc(`blocks/${uid}/blocked/${asking.uid}`),
      db.doc(`blocks/${asking.uid}/blocked/${uid}`)
    );
    const alreadyInDuo = (await activeDuoOf(uid, tx)) || (await activeDuoOf(asking.uid, tx));

    if (accept) await requireVerifiedUsers([uid, asking.uid], tx);

    // Either way the code is used up.
    tx.delete(inviteRef);
    tx.delete(myInviteRef);
    tx.delete(friendRequestRef);
    if (!accept) return { duoId: null, friendUid: asking.uid, myName: null };

    if (
      inviteSnap.get("requestedBy") !== asking.uid ||
      !friendRequest.exists ||
      !friendSnap.exists ||
      blockedSnap.exists ||
      blockedBySnap.exists
    ) {
      throw new HttpsError("not-found", "That request is no longer available.");
    }
    if (alreadyInDuo) throw new HttpsError("failed-precondition", "One of you is already in a Duo.");

    const me = meSnap.data() as Partial<PublicProfile>;
    const friend = friendSnap.data() as Partial<PublicProfile>;
    // A fresh id every time: a pair that teams up again starts with a clean slate.
    const duoRef = db.collection("duos").doc();
    tx.set(duoRef, {
      id: duoRef.id,
      members: [uid, asking.uid].sort(),
      status: "active",
      profiles: { [uid]: snippetOf(me), [asking.uid]: snippetOf(friend) },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastActiveAt: Date.now()
    });
    // The friend's own code, if they'd made one, is no longer needed.
    const theirCode = friendInvite.get("code") as string | undefined;
    if (theirCode) {
      tx.delete(friendInvite.ref);
      tx.delete(db.doc(`duoInvites/${theirCode}`));
    }
    return { duoId: duoRef.id, friendUid: asking.uid, myName: snippetOf(me).displayName };
  });

  if (result.duoId) {
    await sendPushToUser(result.friendUid, {
      kind: "matches",
      title: "Your Duo is ready 🎉",
      body: `${firstName(result.myName ?? "Your friend")} confirmed. Start finding another pair!`,
      data: { type: "duo" },
      tag: "duo-request"
    });
  }
  return { duoId: result.duoId };
});

/** The friend takes back a request they sent. */
export const cancelDuoRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const ref = db.doc(`users/${uid}/private/duoRequest`);
  const snap = await ref.get();
  const code = snap.get("code") as string | undefined;
  const toUid = snap.get("toUid") as string | undefined;
  await ref.delete();
  if (code && toUid) {
    await db.runTransaction(async (tx) => {
      const invite = await tx.get(db.doc(`duoInvites/${code}`));
      if (invite.exists && invite.get("requestedBy") === uid) {
        tx.update(invite.ref, { requestedBy: FieldValue.delete(), requestedAt: FieldValue.delete() });
        tx.set(db.doc(`users/${toUid}/private/duoInvite`), { request: FieldValue.delete() }, { merge: true });
      }
    });
  }
  return { ok: true };
});

// ------------------------------------------------------------------ group chat membership

/**
 * Takes someone out of a Duo chat: they lose access, the others see a note,
 * and the chat closes once either pair has nobody left in it. With `erase`
 * (account deletion) everything they wrote there goes too, even in chats they
 * had already left.
 */
export async function removeFromDuoChat(matchId: string, uid: string, erase = false): Promise<void> {
  const matchRef = db.doc(`matches/${matchId}`);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists || snap.get("kind") !== "duo") return null;
    const participants = (snap.get("participants") as string[] | undefined) ?? [];
    const history = (snap.get("memberHistory") as string[] | undefined) ?? participants;
    const present = participants.includes(uid);
    if (!present && !(erase && history.includes(uid))) return null;

    const active = snap.get("active") !== false;
    const sides = (snap.get("sides") as Record<string, string[]> | undefined) ?? {};
    const sidesAfter = Object.fromEntries(
      Object.entries(sides).map(([duoId, members]) => [duoId, members.filter((member) => member !== uid)])
    );
    const closes = present && Object.values(sidesAfter).some((members) => members.length === 0);
    tx.update(matchRef, {
      participants: participants.filter((member) => member !== uid),
      sides: sidesAfter,
      [`unread.${uid}`]: FieldValue.delete(),
      [`lastReadAt.${uid}`]: FieldValue.delete(),
      ...(closes && active ? { active: false, endedAt: FieldValue.serverTimestamp(), endReason: "left" } : {}),
      ...(erase
        ? {
            [`profiles.${uid}`]: FieldValue.delete(),
            memberHistory: FieldValue.arrayRemove(uid),
            ...(snap.get("lastMessage.senderId") === uid ? { lastMessage: null } : {})
          }
        : {})
    });
    const name = firstName((snap.get(`profiles.${uid}.displayName`) as string | undefined) ?? "Someone");
    return { note: present && active, closes, name };
  });
  if (!outcome) return;

  if (erase) {
    const theirs = await matchRef.collection("messages").where("senderId", "==", uid).get();
    for (let i = 0; i < theirs.docs.length; i += 200) {
      const batch = db.batch();
      theirs.docs.slice(i, i + 200).forEach((doc) => {
        batch.delete(doc.ref);
        batch.delete(matchRef.collection("safety").doc(doc.id));
      });
      await batch.commit();
    }
  }
  if (outcome.note) {
    // A deleted account's name isn't kept, even here.
    const who = erase ? "Someone" : outcome.name;
    await matchRef.collection("messages").add({
      senderId: "system",
      text: outcome.closes ? `${who} left, so this chat has ended.` : `${who} left the chat.`,
      createdAt: FieldValue.serverTimestamp()
    });
  }
}

/** Duo chats `uid` is in, optionally only those that also include `other`. */
export async function duoChatsOf(uid: string, other?: string): Promise<string[]> {
  const snap = await db.collection("matches").where("participants", "array-contains", uid).get();
  return snap.docs
    .filter((doc) => doc.get("kind") === "duo")
    .filter((doc) => !other || ((doc.get("participants") as string[]) ?? []).includes(other))
    .map((doc) => doc.id);
}

/** Ends a duo and takes the person ending it out of its chats. */
async function endDuo(duoId: string, endedBy: string, reason: "left" | "block"): Promise<string[]> {
  const ref = db.doc(`duos/${duoId}`);
  const snap = await ref.get();
  if (!snap.exists) return [];
  const members = (snap.get("members") as string[]) ?? [];
  await ref.update({ status: "ended", endedAt: FieldValue.serverTimestamp(), endedBy, endReason: reason });
  const chats = await db.collection("matches").where("participants", "array-contains", endedBy).get();
  for (const chat of chats.docs) {
    if (chat.get("kind") === "duo" && ((chat.get("duoIds") as string[]) ?? []).includes(duoId)) {
      await removeFromDuoChat(chat.id, endedBy);
    }
  }
  return members.filter((member) => member !== endedBy);
}

export const leaveDuo = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { id, duo } = await requireActiveDuo(uid);
  const [partner] = await endDuo(id, uid, "left");
  if (partner) {
    await sendPushToUser(partner, {
      kind: "matches",
      title: "Your Duo ended",
      body: `${firstName(duo.profiles[uid]?.displayName ?? "Your friend")} left your Duo. Invite someone new anytime.`,
      data: { type: "duo" },
      tag: `duo-${id}`
    });
  }
  return { ok: true };
});

export const leaveChat = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { matchId } = parseMatchInput(request.data);
  const snap = await db.doc(`matches/${matchId}`).get();
  if (!snap.exists || !((snap.get("participants") as string[]) ?? []).includes(uid) || snap.get("kind") !== "duo") {
    throw new HttpsError("permission-denied", "This chat isn't available.");
  }
  await removeFromDuoChat(matchId, uid);
  return { ok: true };
});

/**
 * After a block: any Duo chat with both people closes (without saying who
 * blocked whom), and if they were each other's Duo partner, the Duo ends.
 */
export async function applyBlockToDuos(uid: string, targetUid: string): Promise<void> {
  for (const matchId of await duoChatsOf(uid, targetUid)) {
    await db.doc(`matches/${matchId}`).update({
      active: false,
      endedAt: FieldValue.serverTimestamp(),
      endReason: "closed"
    });
  }
  const duo = await activeDuoOf(uid);
  if (duo && ((duo.get("members") as string[]) ?? []).includes(targetUid)) {
    await endDuo(duo.id, uid, "block");
  }
}

/** Account deletion: ends the member's duos and erases them from every Duo chat they were ever in. */
export async function purgeDuoData(uid: string): Promise<void> {
  const [current, past] = await Promise.all([
    db.collection("matches").where("participants", "array-contains", uid).get(),
    db.collection("matches").where("memberHistory", "array-contains", uid).get()
  ]);
  const chats = new Set([...current.docs, ...past.docs].filter((doc) => doc.get("kind") === "duo").map((doc) => doc.id));
  for (const matchId of chats) {
    await removeFromDuoChat(matchId, uid, true);
  }
  const duos = await db.collection("duos").where("members", "array-contains", uid).get();
  for (const duo of duos.docs) {
    await db.recursiveDelete(db.doc(`duoSwipes/${duo.id}`));
    await duo.ref.delete();
  }
  await clearInvite(uid);
  const pending = await db.doc(`users/${uid}/private/duoRequest`).get();
  if (pending.exists) {
    const code = pending.get("code") as string | undefined;
    const toUid = pending.get("toUid") as string | undefined;
    if (code) await db.doc(`duoInvites/${code}`).delete();
    if (toUid) await db.doc(`users/${toUid}/private/duoInvite`).set({ request: FieldValue.delete() }, { merge: true });
  }
}

// ------------------------------------------------------------------ deck

export const getDuoFeed = onCall(
  { region: REGION, memory: "512MiB", timeoutSeconds: 30 },
  async (request): Promise<{ duos: DuoCard[] }> => {
    const uid = await requireReadAuth(request);
    await requireVerifiedUsers([uid], undefined, uid, isSupportSession(request));
    await consumeDailyQuota(isSupportSession(request) ? request.auth!.uid : uid, "duoFeedCalls", LIMITS.duoFeedCallsPerDay);
    const { id: myDuoId, duo: myDuo } = await requireActiveDuo(uid);
    await requireVerifiedUsers(myDuo.members, undefined, uid, isSupportSession(request));
    // Keeps active pairs near the top of everyone else's deck, without a write per call.
    if (!isSupportSession(request) && Date.now() - (myDuo.lastActiveAt ?? 0) > DUOS.activityRefreshMinutes * 60 * 1000) {
      await db.doc(`duos/${myDuoId}`).update({ lastActiveAt: Date.now() });
    }

    const candidatesSnap = await db
      .collection("duos")
      .where("status", "==", "active")
      .orderBy("lastActiveAt", "desc")
      .limit(DUOS.feedScan)
      .get();
    const candidates = candidatesSnap.docs.filter((doc) => doc.id !== myDuoId).map((doc) => doc.data() as Duo);
    const entries = await discoveryEntries(
      [...myDuo.members, ...candidates.flatMap((duo) => duo.members)],
      isSupportSession(request) ? [] : myDuo.members
    );
    const mine = myDuo.members.map((member) => entries.get(member));
    if (mine.some((entry) => !entry)) return { duos: [] };
    const myEntries = mine as DiscoveryEntry[];

    const blocked = await blockedAround(myDuo.members);
    const verified = await verifiedUsers(candidates.flatMap((duo) => duo.members));
    const fitting = candidates.filter((duo) => {
      const theirs = duo.members.map((member) => entries.get(member));
      return (
        duo.members.every((member) => verified.has(member)) &&
        theirs.every(Boolean) &&
        !duo.members.some((member) => blocked.has(member)) &&
        duosFit(myEntries, theirs as DiscoveryEntry[])
      );
    });

    // Leave out pairs we already answered; note the ones who already liked us.
    const [answered, reciprocal] = fitting.length
      ? await Promise.all([
          db.getAll(...fitting.map((duo) => db.doc(`duoSwipes/${myDuoId}/outgoing/${duo.id}`))),
          db.getAll(...fitting.map((duo) => db.doc(`duoSwipes/${duo.id}/outgoing/${myDuoId}`)))
        ])
      : [[], []];
    const open = fitting
      .map((duo, index) => ({ duo, likedYou: reciprocal[index].get("type") === "like" }))
      .filter((_, index) => !answered[index].exists)
      // Incognito hides a pair too, until that pair likes yours.
      .filter(({ duo, likedYou }) => likedYou || !duo.members.some((member) => entries.get(member)?.incognito === true))
      .slice(0, DUOS.pageSize * 2);

    const profileUids = Array.from(new Set([...myDuo.members, ...open.flatMap(({ duo }) => duo.members)]));
    const profileSnaps = await db.getAll(...profileUids.map((member) => db.doc(`users/${member}`)));
    const profiles = new Map(profileSnaps.map((snap) => [snap.id, snap.data() as Partial<PublicProfile> | undefined]));

    // Scores and distances are the caller's own, never their friend's.
    const me = entries.get(uid);
    const myLocation = me ? candidateLatLng(me) : null;
    const traits = traitsOf(me, profiles.get(uid));
    const myPairTraits = myEntries.map((entry) => traitsOf(entry, profiles.get(entry.uid)));
    const now = Date.now();
    const cards: DuoCard[] = [];
    for (const { duo, likedYou } of open) {
      const members = duo.members
        .map((member) => {
          const profile = profiles.get(member);
          const entry = entries.get(member);
          return profile && entry ? toDiscoverProfile(profile, entry, myLocation, false, traits, now) : null;
        })
        .filter((profile): profile is DiscoverProfile => profile !== null)
        .map(forDuoCard);
      if (members.length !== 2) continue;
      const theirTraits = duo.members.map((member) => traitsOf(entries.get(member), profiles.get(member)));
      const insight = duoInsight(myPairTraits, theirTraits, duo.lastActiveAt, now);
      cards.push({ duoId: duo.id, members, compatibility: insight.compatibility, reasons: insight.reasons, likedYou });
    }
    cards.sort((a, b) => Number(b.likedYou) - Number(a.likedYou) || b.compatibility - a.compatibility);
    return { duos: cards.slice(0, DUOS.pageSize) };
  }
);

/**
 * Either friend's like counts for the pair. When the other pair already liked
 * yours, the four-person chat is created in the same transaction.
 */
export const duoSwipe = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { targetDuoId, type } = parseDuoSwipeInput(request.data);
  const { id: myDuoId, duo: myDuo } = await requireActiveDuo(uid);
  if (targetDuoId === myDuoId) throw new HttpsError("invalid-argument", "That's your own Duo.");

  const targetSnap = await db.doc(`duos/${targetDuoId}`).get();
  const target = targetSnap.data() as Duo | undefined;
  if (!target || target.status !== "active") {
    throw new HttpsError("not-found", "That pair is no longer available.");
  }
  const entries = await discoveryEntries([...myDuo.members, ...target.members], myDuo.members);
  const mine = myDuo.members.map((member) => entries.get(member));
  const theirs = target.members.map((member) => entries.get(member));
  const blocked = await blockedAround(myDuo.members);
  if (
    mine.some((entry) => !entry) ||
    theirs.some((entry) => !entry) ||
    target.members.some((member) => blocked.has(member)) ||
    !duosFit(mine as DiscoveryEntry[], theirs as DiscoveryEntry[])
  ) {
    throw new HttpsError("not-found", "That pair is no longer available.");
  }
  const targetPrivate = new Set(target.members.filter((member) => entries.get(member)?.privatePhotos === true));
  const targetIncognito = target.members.some((member) => entries.get(member)?.incognito === true);
  if (type === "like") await consumeDailyQuota(uid, "duoLikes", LIMITS.duoLikesPerDay);

  const swipeRef = db.doc(`duoSwipes/${myDuoId}/outgoing/${targetDuoId}`);
  const reciprocalRef = db.doc(`duoSwipes/${targetDuoId}/outgoing/${myDuoId}`);
  const matchId = duoMatchIdOf(myDuoId, targetDuoId);
  const matchRef = db.doc(`matches/${matchId}`);

  const matched = await db.runTransaction(async (tx) => {
    await requireVerifiedUsers([...myDuo.members, ...target.members], tx, uid);
    const [existing, reciprocal, match, myDuoNow, targetNow] = await tx.getAll(
      swipeRef,
      reciprocalRef,
      matchRef,
      db.doc(`duos/${myDuoId}`),
      db.doc(`duos/${targetDuoId}`)
    );
    // Either pair may have split up a moment ago.
    if (myDuoNow.get("status") !== "active" || targetNow.get("status") !== "active") {
      throw new HttpsError("not-found", "That pair is no longer available.");
    }
    if (existing.exists) return false;
    // Incognito pairs can only be liked back, never discovered (as in solo).
    if (targetIncognito && reciprocal.get("type") !== "like") {
      throw new HttpsError("not-found", "That pair is no longer available.");
    }
    tx.set(swipeRef, {
      type,
      byUid: uid,
      toDuoId: targetDuoId,
      targetUids: target.members,
      // Readable by the liking pair before any match: no photos of private-photo members.
      target: target.members.map((member) => ({ uid: member, ...publicSnippet(target.profiles[member], targetPrivate.has(member)) })),
      createdAt: FieldValue.serverTimestamp()
    });
    if (type !== "like" || reciprocal.get("type") !== "like" || match.exists) return false;

    const participants = [...myDuo.members, ...target.members].sort();
    tx.set(matchRef, {
      id: matchId,
      kind: "duo",
      duoIds: [myDuoId, targetDuoId].sort(),
      sides: { [myDuoId]: myDuo.members, [targetDuoId]: target.members },
      participants,
      // Everyone ever in the chat, so account deletion finds it even after someone leaves.
      memberHistory: participants,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
      profiles: { ...myDuo.profiles, ...target.profiles },
      lastMessage: null,
      unread: Object.fromEntries(participants.map((member) => [member, 0])),
      lastReadAt: {},
      superLikedBy: []
    });
    return true;
  });

  if (matched) {
    const mineNames = namesOf(myDuo.members.map((member) => myDuo.profiles[member]));
    const theirNames = namesOf(target.members.map((member) => target.profiles[member]));
    await Promise.all(
      [...myDuo.members, ...target.members]
        .filter((member) => member !== uid)
        .map((member) =>
          sendPushToUser(member, {
            kind: "matches",
            title: "It's a Duo match! 🎉",
            body: `${target.members.includes(member) ? mineNames : theirNames} liked you back. Say hi to everyone!`,
            data: { type: "match", matchId },
            tag: `match-${matchId}`
          })
        )
    );
  }
  return { matched, matchId: matched ? matchId : null };
});

/** Takes back a like or pass from your pair within a few minutes, if it hasn't matched. */
export const undoDuoSwipe = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { targetDuoId } = parseDuoSwipeInput({ ...(request.data as object), type: "nope" });
  const { id: myDuoId } = await requireActiveDuo(uid);
  const swipeRef = db.doc(`duoSwipes/${myDuoId}/outgoing/${targetDuoId}`);
  await db.runTransaction(async (tx) => {
    const [swipeSnap, matchSnap] = await tx.getAll(swipeRef, db.doc(`matches/${duoMatchIdOf(myDuoId, targetDuoId)}`));
    if (!swipeSnap.exists) return;
    const createdAt = (swipeSnap.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0;
    if (matchSnap.exists) throw new HttpsError("failed-precondition", "You've already matched with that pair.");
    if (Date.now() - createdAt > DUOS.undoMinutes * 60 * 1000) {
      throw new HttpsError("failed-precondition", `Likes can only be undone within ${DUOS.undoMinutes} minutes.`);
    }
    tx.delete(swipeRef);
  });
  return { ok: true };
});

/**
 * Profiles of the others in an open Duo chat, for "People in this chat".
 * No distances: everyone here has already matched.
 */
export const getChatProfiles = onCall({ region: REGION }, async (request): Promise<{ profiles: DiscoverProfile[] }> => {
  const uid = await requireReadAuth(request);
  const { matchId } = parseMatchInput(request.data);
  const snap = await db.doc(`matches/${matchId}`).get();
  const participants = (snap.get("participants") as string[] | undefined) ?? [];
  if (!snap.exists || !participants.includes(uid) || snap.get("kind") !== "duo" || snap.get("active") === false) {
    throw new HttpsError("permission-denied", "This chat isn't available.");
  }
  await consumeDailyQuota(isSupportSession(request) ? request.auth!.uid : uid, "chatProfiles", LIMITS.chatProfilesPerDay);
  const blocked = await blockedAround([uid]);
  const others = participants.filter((member) => member !== uid && !blocked.has(member));
  const entries = await discoveryEntries([uid, ...others], isSupportSession(request) ? [] : [uid]);
  const snaps = await db.getAll(...[uid, ...others].map((member) => db.doc(`users/${member}`)));
  const byUid = new Map(snaps.map((doc) => [doc.id, doc.data() as Partial<PublicProfile> | undefined]));
  const traits = traitsOf(entries.get(uid), byUid.get(uid));
  const profiles = others
    .map((member) => {
      const profile = byUid.get(member);
      const entry = entries.get(member);
      // Everyone here already shares a chat, so private photos are revealed.
      return profile && entry ? toDiscoverProfile(profile, entry, null, false, traits, Date.now(), true) : null;
    })
    .filter((profile): profile is DiscoverProfile => profile !== null)
    .map(forDuoCard);
  return { profiles };
});
