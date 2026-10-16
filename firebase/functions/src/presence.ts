import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { PRESENCE, REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { pairId } from "./lib/ids";
import {
  applyBeat,
  parseBeat,
  parsePresenceConfig,
  PresenceConfig,
  PresenceDoc,
  presenceView,
  PresenceView
} from "./lib/presence";

/**
 * presence/{uid}: server-only. Members write their own sessions through
 * presenceBeat and read other people's status through getPresence, which only
 * answers for people they share an active chat with who haven't hidden their
 * activity. Status is computed from timestamps on every read.
 */

let cached: { config: PresenceConfig; at: number } | null = null;
/** Emulators and tests read runtime switches fresh. */
export const uncachedRuntime = () => process.env.FUNCTIONS_EMULATOR === "true" || process.env.MUSE_UNCACHED_RUNTIME === "true";

/** runtime/presence, cached briefly per instance. Off unless an admin enables it. */
export async function presenceConfig(now = Date.now()): Promise<PresenceConfig> {
  if (cached && now - cached.at < 30_000 && !uncachedRuntime()) return cached.config;
  const config = parsePresenceConfig((await db.doc("runtime/presence").get()).data());
  cached = { config, at: now };
  return config;
}

/** Forgets every session and the last-active time (hidden activity, bans, account deletion). */
export async function clearPresence(uid: string): Promise<void> {
  await db.doc(`presence/${uid}`).delete();
}

type BeatReply = { enabled: boolean; sharing: boolean; idleTimeoutMs: number; heartbeatMs: number; serverNow: number };

export const presenceBeat = onCall({ region: REGION }, async (request): Promise<BeatReply> => {
  const uid = requireAuth(request);
  const input = parseBeat(request.data);
  if (!input) throw new HttpsError("invalid-argument", "Invalid presence update.");
  const config = await presenceConfig();
  const reply = (sharing: boolean): BeatReply => ({
    enabled: config.enabled,
    sharing,
    idleTimeoutMs: config.idleTimeoutMs,
    heartbeatMs: config.heartbeatMs,
    serverNow: Date.now()
  });
  if (!config.enabled) return reply(true);

  const ref = db.doc(`presence/${uid}`);
  const sharing = await db.runTransaction(async (tx) => {
    const [snap, profile, settings, moderation] = await tx.getAll(
      ref,
      db.doc(`users/${uid}`),
      db.doc(`users/${uid}/private/settings`),
      db.doc(`moderation/${uid}`)
    );
    // Hidden activity, banned or deleted accounts: store nothing.
    const shares = settings.get("showPresence") !== false;
    if (!shares || !profile.exists || moderation.get("status") === "banned") {
      if (snap.exists) tx.delete(ref);
      return shares;
    }
    const next = applyBeat(snap.data() as PresenceDoc | undefined, input, config, Date.now());
    if (next) tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  return reply(sharing);
});

/**
 * The people `viewer` may see presence for, among `uids`: anyone they share an
 * active one-to-one match or Duo chat with. Blocking or unmatching ends the
 * match, so it ends visibility too.
 */
async function sharedChatMembers(viewer: string, uids: string[]): Promise<Set<string>> {
  const visible = new Set<string>();
  const pairs = await db.getAll(...uids.map((uid) => db.doc(`matches/${pairId(viewer, uid)}`)));
  pairs.forEach((snap, index) => {
    const participants = (snap.get("participants") as string[] | undefined) ?? [];
    if (snap.get("active") === true && participants.includes(viewer) && participants.includes(uids[index])) visible.add(uids[index]);
  });
  if (visible.size < uids.length) {
    const duoChats = await db
      .collection("matches")
      .where("participants", "array-contains", viewer)
      .where("kind", "==", "duo")
      .where("active", "==", true)
      .limit(20)
      .get();
    for (const chat of duoChats.docs) {
      for (const member of (chat.get("participants") as string[] | undefined) ?? []) if (uids.includes(member)) visible.add(member);
    }
  }
  return visible;
}

type PresenceReply = {
  enabled: boolean;
  idleTimeoutMs: number;
  heartbeatMs: number;
  serverNow: number;
  members: Record<string, PresenceView>;
};

export const getPresence = onCall({ region: REGION }, async (request): Promise<PresenceReply> => {
  const viewer = requireAuth(request);
  const config = await presenceConfig();
  const raw = (request.data as { uids?: unknown } | null)?.uids ?? [];
  if (!Array.isArray(raw) || raw.length > PRESENCE.maxTargets) throw new HttpsError("invalid-argument", `Ask about at most ${PRESENCE.maxTargets} people.`);
  const uids = [...new Set(raw)].filter((uid): uid is string => typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !uid.includes("/") && uid !== viewer);
  const now = Date.now();
  const members: Record<string, PresenceView> = Object.fromEntries(uids.map((uid) => [uid, { state: "unavailable" } as PresenceView]));
  const reply = (): PresenceReply => ({ enabled: config.enabled, idleTimeoutMs: config.idleTimeoutMs, heartbeatMs: config.heartbeatMs, serverNow: now, members });
  if (!config.enabled || !uids.length) return reply();
  if ((await db.doc(`moderation/${viewer}`).get()).get("status") === "banned") return reply();

  const visible = [...(await sharedChatMembers(viewer, uids))];
  if (!visible.length) return reply();
  // presence/{uid} is deleted when a member hides their activity, is banned or deletes their
  // account; their settings and moderation record are checked here too, so a missed clean-up
  // never shows anything.
  const snaps = await db.getAll(...visible.flatMap((uid) => [db.doc(`presence/${uid}`), db.doc(`users/${uid}/private/settings`), db.doc(`moderation/${uid}`)]));
  visible.forEach((uid, index) => {
    const [presence, settings, moderation] = snaps.slice(index * 3, index * 3 + 3);
    if (presence.exists && settings.get("showPresence") !== false && moderation.get("status") !== "banned") {
      members[uid] = presenceView(presence.data() as PresenceDoc, config, now);
    }
  });
  return reply();
});

/**
 * Members who hide their activity keep no last-active time on their profile,
 * so discovery recency is kept server-side instead (it only orders feeds).
 */
export const touchActivity = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const ref = db.doc(`discovery/${uid}`);
  // Only to the hour (like syncDiscoveryIndex): feed order and paging cursors never reveal more.
  const hour = Math.floor(Date.now() / PRESENCE.hiddenRecencyStepMs) * PRESENCE.hiddenRecencyStepMs;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.get("lastActiveAt");
    if (snap.exists && !(typeof last === "number" && last >= hour)) tx.update(ref, { lastActiveAt: hour });
  });
  return { ok: true };
});
