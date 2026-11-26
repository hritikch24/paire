import { consumeDailyQuota } from "./quota";
import { countPreview } from "./eventMetrics";
import { requireAuth } from "./lib/auth";
import { requireVerifiedUsers, verifiedUsers } from "./trust";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { pairId } from "./lib/ids";
import { isCandidateForViewer, candidateLatLng } from "./lib/prefs";
import {
  buildDiscoveryEntry,
  toDiscoverProfile,
  viewerTraits,
} from "./lib/discovery";
import { createHash, randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { LIMITS, REGION } from "./config";
import { requireSupportOperator } from "./supportAdmin";

const week = 7 * 24 * 3600_000;
const invalid = () =>
  new HttpsError("invalid-argument", "Check the event details.");
function field(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw invalid();
  return value.trim().normalize("NFC");
}
function instant(value: unknown): number {
  const iso = field(value, 40);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(
      iso,
    ) ||
    !Number.isFinite(Date.parse(iso))
  )
    throw invalid();
  return Date.parse(iso);
}

export const saveEventRoom = onCall({ region: REGION }, async (request) => {
  const actor = await requireSupportOperator(request);
  const input = request.data ?? {};
  const title = field(input.title, 150),
    city = field(input.city, 80),
    venue = field(input.venue, 150);
  const cover = input.cover ? field(input.cover, 180) : null;
  if (
    cover &&
    !/^\/event-covers\/[a-z0-9_-]+\.(webp|avif|jpg|png)$/.test(cover)
  )
    throw invalid();
  const coverLicense = cover ? field(input.coverLicense, 300) : null;
  const category = field(input.category, 50),
    timezone = field(input.timezone, 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw invalid();
  }
  const start = instant(input.start),
    end = instant(input.end);
  const status = field(input.status, 16);
  if (end <= start || !["draft", "published", "closed"].includes(status))
    throw invalid();
  if (input.id != null && !/^[A-Za-z0-9]{20}$/.test(field(input.id, 20)))
    throw invalid();
  const ref = input.id
    ? db.collection("eventRooms").doc(input.id)
    : db.collection("eventRooms").doc();
  const key = createHash("sha256")
    .update(
      JSON.stringify(
        [title, city, venue]
          .map((x) => x.toLowerCase().replace(/\s+/g, " "))
          .concat(String(start)),
      ),
    )
    .digest("hex");
  const unique = db.collection("eventRoomKeys").doc(key);
  await db.runTransaction(async (tx) => {
    const [room, duplicate, operator] = await tx.getAll(
      ref,
      unique,
      db.doc(`supportOperators/${actor}`),
    );
    if (operator.get("enabled") !== true)
      throw new HttpsError("permission-denied", "Operator access required.");
    if (input.id && !room.exists)
      throw new HttpsError("not-found", "Room unavailable.");
    if (duplicate.exists && duplicate.get("id") !== ref.id)
      throw new HttpsError(
        "already-exists",
        "A room already exists for this event.",
      );
    if (room.exists && room.get("key") !== key)
      tx.delete(db.collection("eventRoomKeys").doc(room.get("key")));
    tx.set(unique, { id: ref.id });
    tx.set(ref, {
      title,
      city,
      venue,
      category,
      cover,
      coverLicense,
      timezone,
      start,
      end,
      closesAt: end + week,
      cleanupDue: end + week,
      status,
      key,
    });
  });
  return { id: ref.id };
});

export const getEventRoom = onCall({ region: REGION }, async (request) => {
  const id = field(request.data?.id, 20);
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw invalid();
  const room = await db.collection("eventRooms").doc(id).get();
  const data = room.data();
  if (!data || data.status === "draft")
    throw new HttpsError("not-found", "Room unavailable.");
  const { title, city, venue, category, timezone, start, end, closesAt } = data;
  const ownMembership = request.auth
    ? await room.ref
        .collection("eventParticipants")
        .doc(requireAuth(request))
        .get()
    : null;
  return {
    title,
    city,
    venue,
    category,
    ...(ownMembership ? { joined: ownMembership.exists } : {}),
    cover: data.cover ?? null,
    timezone,
    start,
    end,
    closesAt,
    open: data.status === "published" && Date.now() < closesAt,
  };
});

export const setEventParticipation = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuth(request);
    const id = field(request.data?.id, 20);
    const join = request.data?.join;
    if (!/^[A-Za-z0-9]{20}$/.test(id) || typeof join !== "boolean")
      throw invalid();
    const room = db.collection("eventRooms").doc(id);
    await db.runTransaction(async (tx) => {
      const member = room.collection("eventParticipants").doc(uid);
      if (!join) {
        tx.delete(member);
        return;
      }
      const listing = await tx.get(room);
      if (
        listing.get("status") !== "published" ||
        Date.now() >= listing.get("closesAt")
      )
        throw new HttpsError("failed-precondition", "This room is closed.");
      await requireVerifiedUsers([uid], tx);
      const [profile, settings, moderation] = await tx.getAll(
        db.doc(`users/${uid}`),
        db.doc(`users/${uid}/private/settings`),
        db.doc(`moderation/${uid}`),
      );
      const entry = buildDiscoveryEntry(
        uid,
        profile.data(),
        settings.data(),
        moderation.data(),
      );
      if (!entry.visible)
        throw new HttpsError(
          "failed-precondition",
          "A visible adult profile is required.",
        );
      tx.set(member, { uid, gender: entry.gender });
    });
    return { joined: join };
  },
);

// Only a bounded count of indistinguishable placeholders leaves this endpoint.
// No image, profile identifier or private field enters the guest representation.
export const previewEventDeck = onCall({ region: REGION }, async (request) => {
  const id = field(request.data?.id, 20);
  const gender = request.data?.gender;
  const age = request.data?.age ?? "all";
  if (!["all", "18-29", "30-44", "45+"].includes(age)) throw invalid();
  if (
    !/^[A-Za-z0-9]{20}$/.test(id) ||
    !["woman", "man"].includes(gender) ||
    request.data?.adult !== true
  )
    throw invalid();
  const room = db.collection("eventRooms").doc(id);
  const result = await db.runTransaction(async (tx) => {
    const hour = Math.floor(Date.now() / 3600000);
    const key = createHash("sha256")
      .update(hour + "|" + (request.rawRequest?.ip ?? "unknown"))
      .digest("hex");
    const quota = db.collection("eventPreviewQuotas").doc(key);
    const used = Number((await tx.get(quota)).get("count")) || 0;
    if (used >= 240)
      throw new HttpsError(
        "resource-exhausted",
        "Please try browsing again later.",
      );
    const listing = await tx.get(room);
    if (
      listing.get("status") !== "published" ||
      Date.now() >= listing.get("closesAt")
    )
      throw new HttpsError("failed-precondition", "This room is closed.");
    const members = await tx.get(
      room
        .collection("eventParticipants")
        .where("gender", "==", gender)
        .limit(12),
    );
    const verified = await verifiedUsers(
      members.docs.map((member) => member.id),
      tx,
    );
    const candidates: string[] = [];
    for (const uid of verified) {
      const viewer = request.auth?.uid;
      if (viewer) {
        if (viewer === uid) continue;
        const blocks = await tx.getAll(
          db.doc(`blocks/${viewer}/blocked/${uid}`),
          db.doc(`blocks/${uid}/blocked/${viewer}`),
        );
        if (blocks.some((block) => block.exists)) continue;
      }
      const [profile, settings, moderation] = await tx.getAll(
        db.doc(`users/${uid}`),
        db.doc(`users/${uid}/private/settings`),
        db.doc(`moderation/${uid}`),
      );
      const entry = buildDiscoveryEntry(
        uid,
        profile.data(),
        settings.data(),
        moderation.data(),
      );
      const inRange =
        entry.age !== null &&
        (age === "all" ||
          (age === "18-29" && entry.age < 30) ||
          (age === "30-44" && entry.age >= 30 && entry.age < 45) ||
          (age === "45+" && entry.age >= 45));
      if (
        inRange &&
        entry.visible &&
        entry.cohort === "public" &&
        entry.gender === gender &&
        !entry.privatePhotos &&
        !entry.incognito
      )
        candidates.push(uid);
    }
    tx.set(quota, {
      count: used + 1,
      expireAt: new Date((hour + 2) * 3600000),
    });
    if (!candidates.length) return { count: 0 };
    const deck = randomUUID();
    tx.create(db.collection("eventPreviewDecks").doc(deck), {
      id,
      candidates,
      expireAt: new Date(
        Math.min(listing.get("closesAt"), Date.now() + 3600000),
      ),
    });
    return { count: candidates.length, deck };
  });
  if (typeof request.data?.session === "string")
    await countPreview(request.data.session, request.data.campaign, id);
  return result;
});

export const getEventMembers = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const id = field(request.data?.id, 20);
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw invalid();
  await consumeDailyQuota(uid, "feedCalls", LIMITS.feedCallsPerDay);
  const room = db.collection("eventRooms").doc(id);
  return db.runTransaction(async (tx) => {
    await requireVerifiedUsers([uid], tx);
    const [listing, member, profile, settings, mod] = await tx.getAll(
      room,
      room.collection("eventParticipants").doc(uid),
      db.doc(`users/${uid}`),
      db.doc(`users/${uid}/private/settings`),
      db.doc(`moderation/${uid}`),
    );
    if (
      !member.exists ||
      listing.get("status") !== "published" ||
      Date.now() >= listing.get("closesAt")
    )
      throw new HttpsError(
        "failed-precondition",
        "Join an open room to discover members.",
      );
    const mine = buildDiscoveryEntry(
      uid,
      profile.data(),
      settings.data(),
      mod.data(),
    );
    if (!mine.visible)
      throw new HttpsError(
        "failed-precondition",
        "A visible profile is required.",
      );
    let batch = room
      .collection("eventParticipants")
      .orderBy(FieldPath.documentId())
      .limit(12);
    if (request.data?.after)
      batch = batch.startAfter(field(request.data.after, 128));
    const members = await tx.get(batch);
    const ids = members.docs.map((m) => m.id);
    const { deck, slot } = request.data;
    if (
      !request.data.after &&
      typeof deck === "string" &&
      /^[a-f0-9-]{36}$/.test(deck) &&
      Number.isInteger(slot) &&
      slot >= 0 &&
      slot < 12
    ) {
      const saved = await tx.get(db.collection("eventPreviewDecks").doc(deck));
      if (
        saved.get("id") === id &&
        saved.get("expireAt").toMillis() > Date.now()
      ) {
        const target = saved.get("candidates")[slot];
        if (
          target &&
          (await tx.get(room.collection("eventParticipants").doc(target)))
            .exists
        )
          ids.unshift(target);
      }
    }
    const resume = request.data.resume;
    if (
      !request.data.after &&
      typeof resume === "string" &&
      /^[A-Za-z0-9_-]{1,128}$/.test(resume)
    ) {
      if (
        (await tx.get(room.collection("eventParticipants").doc(resume))).exists
      )
        ids.unshift(resume);
    }
    const verified = await verifiedUsers(ids, tx);
    const profiles = [];
    for (const other of verified) {
      if (other === uid) continue;
      const [person, prefs, moderation, block, blockedBy, match, swipe] =
        await tx.getAll(
          db.doc(`users/${other}`),
          db.doc(`users/${other}/private/settings`),
          db.doc(`moderation/${other}`),
          db.doc(`blocks/${uid}/blocked/${other}`),
          db.doc(`blocks/${other}/blocked/${uid}`),
          db.doc(`matches/${pairId(uid, other)}`),
          db.doc(`swipes/${uid}/outgoing/${other}`),
        );
      const theirs = buildDiscoveryEntry(
        other,
        person.data(),
        prefs.data(),
        moderation.data(),
      );
      const location = candidateLatLng(mine);
      if (
        block.exists ||
        blockedBy.exists ||
        match.exists ||
        (swipe.exists && !(other === resume && swipe.get("type") === "rewound" && swipe.get("eventId") === id)) ||
        theirs.incognito ||
        !isCandidateForViewer(mine, theirs, {
          viewerLocation: location,
          sharedVibesOnly: settings.get("sharedVibesOnly") === true,
        })
      )
        continue;
      const card = toDiscoverProfile(
        person.data()!,
        theirs,
        location,
        false,
        viewerTraits(mine, profile.data()),
      );
      if (card) profiles.push(card);
    }
    return {
      profiles,
      after: members.size === 12 ? members.docs[11].id : null,
    };
  });
});

export const getAdminEventRoom = onCall({ region: REGION }, async (request) => {
  await requireSupportOperator(request);
  const id = field(request.data?.id, 20);
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw invalid();
  const room = await db.collection("eventRooms").doc(id).get();
  if (!room.exists) throw new HttpsError("not-found", "Room unavailable.");
  const {
    title,
    category,
    city,
    venue,
    start,
    end,
    timezone,
    cover,
    coverLicense,
    status,
  } = room.data()!;
  return {
    id,
    title,
    category,
    city,
    venue,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    timezone,
    cover: cover ?? "",
    coverLicense: coverLicense ?? "",
    status,
  };
});

// Check the room inside the deletion transaction. An operator can extend an
// event without racing a previously scheduled deletion of its participants.
export const cleanupEventParticipants = onSchedule(
  { region: REGION, schedule: "every 15 minutes" },
  async () => {
    const rooms = await db
      .collection("eventRooms")
      .where("cleanupDue", "<=", Date.now())
      .limit(40)
      .get();
    for (const room of rooms.docs) {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(room.ref);
        if (!current.exists || current.get("closesAt") > Date.now()) return;
        const expired = await tx.get(
          room.ref.collection("eventParticipants").limit(200),
        );
        for (const participant of expired.docs) tx.delete(participant.ref);
        if (expired.size < 200)
          tx.update(room.ref, { cleanupDue: FieldValue.delete() });
      });
    }
  },
);
