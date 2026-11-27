import { FieldPath, Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { db } from "./admin";
import { REGION, LIMITS } from "./config";
import { requireAuth } from "./lib/auth";
import {
  buildDiscoveryEntry,
  toDiscoverProfile,
  viewerTraits,
} from "./lib/discovery";
import { pairId } from "./lib/ids";
import { buildMatchDoc } from "./lib/matchDoc";
import { candidateLatLng, isCandidateForViewer } from "./lib/prefs";
import { consumeDailyQuota } from "./quota";
import { requireVerifiedUsers, verifiedUsers } from "./trust";

const DAY = 86400000;
const CITIES = [
  "Delhi NCR",
  "Mumbai",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Kochi",
  "Jaipur",
  "Lucknow",
  "Ahmedabad",
  "Nagpur",
];
const unavailable = () =>
  new HttpsError(
    "failed-precondition",
    "This introduction is no longer available.",
  );
async function member(tx: Transaction, uid: string) {
  const [person, settings, mod] = await tx.getAll(
    db.doc("users/" + uid),
    db.doc("users/" + uid + "/private/settings"),
    db.doc("moderation/" + uid),
  );
  return {
    uid,
    person: person.data(),
    settings: settings.data(),
    entry: buildDiscoveryEntry(uid, person.data(), settings.data(), mod.data()),
  };
}
type Member = Awaited<ReturnType<typeof member>>;
function available(m: Member) {
  return m.entry.visible && !m.entry.incognito && !m.entry.requireNote;
}
function accepts(m: Member, other: Member) {
  return (
    available(m) &&
    isCandidateForViewer(m.entry, other.entry, {
      viewerLocation: candidateLatLng(m.entry),
      sharedVibesOnly: m.settings?.sharedVibesOnly === true,
    })
  );
}
async function review(
  tx: Transaction,
  me: Member,
  other: Member,
  mode: string,
) {
  const shared = me.entry.vibes.filter((v) => other.entry.vibes.includes(v));
  if (
    !accepts(me, other) ||
    !accepts(other, me) ||
    (mode === "vibes" && !shared.length)
  )
    return null;
  const a = me.uid,
    b = other.uid;
  const conflicts = await tx.getAll(
    db.doc("matches/" + pairId(a, b)),
    db.doc("blocks/" + a + "/blocked/" + b),
    db.doc("blocks/" + b + "/blocked/" + a),
    db.doc("swipes/" + a + "/outgoing/" + b),
    db.doc("swipes/" + b + "/outgoing/" + a),
  );
  if (conflicts.some((s) => s.exists)) return null;
  const profile = toDiscoverProfile(
    other.person!,
    other.entry,
    candidateLatLng(me.entry),
    false,
    viewerTraits(me.entry, me.person),
  );
  return profile ? { profile, shared } : null;
}

export const discoveryIntroduction = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuth(request),
      { mode, action, city, ticket } = request.data ?? {};
    if (
      !["vibes", "metro"].includes(mode) ||
      !["status", "join", "check", "leave", "pass", "continue"].includes(action)
    )
      throw new HttpsError("invalid-argument", "Choose a discovery option.");
    if (mode === "metro" && action === "join" && !CITIES.includes(city))
      throw new HttpsError("invalid-argument", "Choose a metro city.");
    const pool = db.collection(
        mode === "metro" ? "metroCircleMembers" : "vibeIntroMembers",
      ),
      self = pool.doc(uid);
    if (["join", "check"].includes(action))
      await consumeDailyQuota(uid, "feedCalls", LIMITS.feedCallsPerDay);
    return db.runTransaction(async (tx) => {
      const state = await tx.get(self),
        now = Date.now(),
        active = state.exists && state.get("until") > now;
      const peer = state.get("peer") as string | undefined;
      const bucket = mode === "vibes" ? "vibes" : state.get("city");
      const waiting = { state: "waiting", city: state.get("city") ?? null };
      if (action === "leave") {
        tx.delete(self);
        return { state: "off" };
      }
      if (!active && action !== "join") return { state: "off" };
      if (!peer && action === "status") {
        const matchId = state.get("lastMatch");
        if (
          matchId &&
          (await tx.get(db.doc("matches/" + matchId))).get("active") === true
        )
          return { state: "matched", matchId };
        return waiting;
      }
      await requireVerifiedUsers([uid], tx);
      const me = await member(tx, uid);
      if (!available(me))
        throw new HttpsError(
          "failed-precondition",
          "Your current profile visibility or notes-only preference pauses introductions.",
        );
      if (mode === "vibes" && !me.entry.vibes.length)
        throw new HttpsError(
          "failed-precondition",
          "Add a vibe to your profile first.",
        );
      if (!active) {
        tx.set(self, {
          bucket: mode === "metro" ? city : "vibes",
          city: mode === "metro" ? city : null,
          until: now + DAY,
          expireAt: new Date(now + DAY),
        });
        return { state: "waiting", city: mode === "metro" ? city : null };
      }
      if (peer) {
        const otherRef = pool.doc(peer),
          slot = await tx.get(otherRef);
        const linked =
          slot.exists &&
          slot.get("peer") === uid &&
          slot.get("ticket") === state.get("ticket") &&
          slot.get("until") > now;
        if (
          ["pass", "continue"].includes(action) &&
          ticket !== state.get("ticket")
        )
          throw unavailable();
        const other = await member(tx, peer);
        const card =
          linked && (await verifiedUsers([peer], tx)).has(peer)
            ? await review(tx, me, other, mode)
            : null;
        const clear = { peer: null, ticket: null, accepted: false, bucket };
        if (!card || action === "pass") {
          tx.update(self, clear);
          if (linked) tx.update(otherRef, clear);
          return waiting;
        }
        if (action === "continue" && slot.get("accepted") === true) {
          const match = buildMatchDoc({
            uid,
            targetUid: peer,
            me: me.person,
            target: other.person,
            superLikedBy: [],
            notes: {},
            firstMove: {
              [uid]: me.settings?.firstMove === true,
              [peer]: other.settings?.firstMove === true,
            },
            source: mode === "metro" ? "metro" : "vibes",
          });
          tx.create(db.doc("matches/" + match.id), match.data);
          const completed = { ...clear, bucket: null, lastMatch: match.id };
          tx.update(self, completed);
          tx.update(otherRef, completed);
          return { state: "matched", matchId: match.id };
        }
        if (action === "continue") tx.update(self, { accepted: true });
        return {
          state: "intro",
          ...card,
          ticket: state.get("ticket"),
          accepted: action === "continue" || state.get("accepted") === true,
          city: state.get("city") ?? null,
        };
      }
      if (action !== "check" && action !== "join") return waiting;
      let query = pool
        .where("bucket", "==", bucket)
        .orderBy(FieldPath.documentId())
        .limit(12);
      if (state.get("cursor")) query = query.startAfter(state.get("cursor"));
      const batch = await tx.get(query),
        verified = await verifiedUsers(
          batch.docs.map((x) => x.id),
          tx,
        );
      for (const candidate of batch.docs) {
        if (
          candidate.id === uid ||
          candidate.get("until") <= now ||
          !verified.has(candidate.id)
        )
          continue;
        const seen = db.doc(
          "introHistory/" + mode + "_" + pairId(uid, candidate.id),
        );
        if ((await tx.get(seen)).get("until") > now) continue;
        const card = await review(tx, me, await member(tx, candidate.id), mode);
        if (!card) continue;
        const token = randomUUID(),
          common = {
            ticket: token,
            accepted: false,
            bucket: null,
            cursor: null,
          };
        tx.update(self, { ...common, peer: candidate.id, lastMatch: null });
        tx.update(candidate.ref, { ...common, peer: uid });
        tx.set(seen, {
          members: [uid, candidate.id],
          until: now + 30 * DAY,
          expireAt: new Date(now + 30 * DAY),
        });
        return {
          state: "intro",
          ...card,
          ticket: token,
          accepted: false,
          city: state.get("city") ?? null,
        };
      }
      tx.update(self, {
        bucket,
        lastMatch: null,
        cursor: batch.size === 12 ? batch.docs[11].id : null,
      });
      return waiting;
    });
  },
);

export const listDiscoveryEvents = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuth(request);
    await requireVerifiedUsers([uid]);
    const { after } = request.data ?? {};
    let q = db
      .collection("eventRooms")
      .where("status", "==", "published")
      .where("closesAt", ">", Date.now())
      .orderBy("closesAt")
      .orderBy(FieldPath.documentId())
      .limit(16);
    if (after) {
      if (
        !Number.isSafeInteger(after.time) ||
        !/^[a-zA-Z0-9]{20}$/.test(after.id)
      )
        throw new HttpsError("invalid-argument", "Invalid page.");
      q = q.startAfter(after.time, after.id);
    }
    const snap = await q.get();
    const rooms = snap.docs.map((d) => ({
      id: d.id,
      title: d.get("title"),
      city: d.get("city"),
      category: d.get("category"),
      timezone: d.get("timezone"),
      closesAt: d.get("closesAt"),
    }));
    const last = rooms.at(-1);
    return {
      rooms,
      after:
        snap.size === 16 && last ? { id: last.id, time: last.closesAt } : null,
    };
  },
);
