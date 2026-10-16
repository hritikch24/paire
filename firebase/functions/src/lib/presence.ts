import { PRESENCE } from "../config";

/**
 * Activity-based presence, as pure functions of server time.
 *
 * Each tab or app process is a session. A session counts as online only while
 * it is in the foreground, its last meaningful interaction is recent, and its
 * heartbeat lease hasn't lapsed. A member is online while at least one session
 * is. Everything is decided from timestamps when it is read; nothing waits for
 * a document to be deleted.
 *
 * Clients never send a clock time: they send how long ago the person last
 * interacted (`idleMs`, from their own monotonic clock), and the server turns
 * that into server time. Heartbeats renew the lease, never the activity.
 */

export type PresencePlatform = "web" | "android" | "ios";
export type BeatState = "active" | "background" | "ended";

export type PresenceConfig = {
  enabled: boolean;
  idleTimeoutMs: number;
  leaseMs: number;
  /** How often a foreground, recently active client renews its lease. */
  heartbeatMs: number;
};

export type StoredSession = {
  platform: PresencePlatform;
  foreground: boolean;
  /** Server ms of the last meaningful interaction; null before the first one. */
  activeAt: number | null;
  /** Server ms of the last beat (the lease). */
  heartbeatAt: number;
  createdAt: number;
  /** The client's beat counter: an older beat arriving late never overrides a newer one. */
  seq?: number;
};

export type PresenceDoc = {
  sessions?: Record<string, StoredSession>;
  /** Latest meaningful interaction across every session, in server ms. */
  lastActiveAt?: number | null;
};

export type BeatInput = { sessionId: string; platform: PresencePlatform; state: BeatState; idleMs: number; seq?: number };

export type PresenceView =
  | { state: "online"; onlineUntil: number }
  | { state: "offline"; lastActiveAt: number | null }
  | { state: "unavailable" };

const PLATFORMS = new Set<PresencePlatform>(["web", "android", "ios"]);
const STATES = new Set<BeatState>(["active", "background", "ended"]);
const SESSION_ID = /^[A-Za-z0-9_-]{12,64}$/;
const MAX_IDLE_MS = 7 * 24 * 60 * 60_000;

function bounded(value: unknown, [min, max]: readonly number[], fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

/** runtime/presence → config. Missing or malformed values fall back to safe defaults; presence is off unless enabled. */
export function parsePresenceConfig(data: unknown): PresenceConfig {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const idleTimeoutMs = bounded(raw.idleTimeoutMs, PRESENCE.idleTimeoutBoundsMs, PRESENCE.idleTimeoutMs);
  const leaseMs = bounded(raw.leaseMs, PRESENCE.leaseBoundsMs, PRESENCE.leaseMs);
  // Two beats per lease, so one lost beat doesn't drop a live session.
  const heartbeatMs = Math.max(PRESENCE.minBeatIntervalMs, Math.floor(leaseMs / 2));
  return { enabled: raw.enabled === true, idleTimeoutMs, leaseMs, heartbeatMs };
}

export function parseBeat(data: unknown): BeatInput | null {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (typeof raw.sessionId !== "string" || !SESSION_ID.test(raw.sessionId)) return null;
  if (!PLATFORMS.has(raw.platform as PresencePlatform) || !STATES.has(raw.state as BeatState)) return null;
  if (typeof raw.idleMs !== "number" || !Number.isFinite(raw.idleMs) || raw.idleMs < 0) return null;
  const seq = typeof raw.seq === "number" && Number.isInteger(raw.seq) && raw.seq >= 0 && raw.seq < 2 ** 31 ? raw.seq : undefined;
  return {
    sessionId: raw.sessionId,
    platform: raw.platform as PresencePlatform,
    state: raw.state as BeatState,
    idleMs: Math.min(MAX_IDLE_MS, Math.round(raw.idleMs)),
    ...(seq === undefined ? {} : { seq })
  };
}

/** When this session stops counting as online (server ms), or 0 if it doesn't count now. */
export function sessionOnlineUntil(session: StoredSession, config: PresenceConfig, now: number): number {
  if (!session.foreground || typeof session.activeAt !== "number") return 0;
  const until = Math.min(session.activeAt + config.idleTimeoutMs, session.heartbeatAt + config.leaseMs);
  return until > now ? until : 0;
}

/** Latest moment any session keeps the member online, or null when none does. */
export function onlineUntil(doc: PresenceDoc | undefined, config: PresenceConfig, now: number): number | null {
  let best = 0;
  for (const session of Object.values(doc?.sessions ?? {})) best = Math.max(best, sessionOnlineUntil(session, config, now));
  return best > 0 ? best : null;
}

/**
 * Approximate "last active": 5-minute steps within the hour, then hours, then
 * days, and nothing beyond the horizon. Never the exact moment.
 */
export function coarseLastActive(lastActiveAt: unknown, now: number): number | null {
  if (typeof lastActiveAt !== "number" || !Number.isFinite(lastActiveAt) || lastActiveAt <= 0) return null;
  const at = Math.min(lastActiveAt, now);
  const age = now - at;
  if (age > PRESENCE.lastActiveHorizonMs) return null;
  const step = age < 60 * 60_000 ? 5 * 60_000 : age < 24 * 60 * 60_000 ? 60 * 60_000 : 24 * 60 * 60_000;
  return Math.floor(at / step) * step;
}

/** onlineUntil is reported in 5-second steps (rounded down), so polling can't rebuild exact tap times. */
const ONLINE_STEP_MS = 5_000;

export function presenceView(doc: PresenceDoc | undefined, config: PresenceConfig, now: number): PresenceView {
  const until = onlineUntil(doc, config, now);
  if (until && Math.floor(until / ONLINE_STEP_MS) * ONLINE_STEP_MS > now) return { state: "online", onlineUntil: Math.floor(until / ONLINE_STEP_MS) * ONLINE_STEP_MS };
  return { state: "offline", lastActiveAt: coarseLastActive(doc?.lastActiveAt, now) };
}

/**
 * Applies one beat to the member's sessions. Returns null when the beat changes
 * nothing worth a write (a repeat within minBeatIntervalMs).
 */
export function applyBeat(
  doc: PresenceDoc | undefined,
  input: BeatInput,
  config: PresenceConfig,
  now: number
): Required<PresenceDoc> | null {
  const sessions: Record<string, StoredSession> = { ...(doc?.sessions ?? {}) };
  const existing = sessions[input.sessionId];
  // Beats can arrive out of order (an "active" sent just before "background"): keep the newest.
  if (existing && typeof existing.seq === "number" && input.seq !== undefined && input.seq <= existing.seq) return null;
  const foreground = input.state === "active";
  // Activity happened `idleMs` before this beat, measured on the client's own clock.
  const interactedAt = now - input.idleMs;
  const activeAt = Math.max(existing?.activeAt ?? 0, interactedAt);

  if (
    existing &&
    foreground &&
    existing.foreground &&
    now - existing.heartbeatAt < PRESENCE.minBeatIntervalMs &&
    activeAt - (existing.activeAt ?? 0) < PRESENCE.minBeatIntervalMs
  ) {
    return null;
  }

  if (input.state === "ended") {
    delete sessions[input.sessionId];
  } else {
    sessions[input.sessionId] = {
      platform: input.platform,
      foreground,
      activeAt,
      heartbeatAt: now,
      createdAt: existing?.createdAt ?? now,
      ...(input.seq === undefined ? {} : { seq: input.seq })
    };
  }

  // Drop sessions whose lease lapsed long ago, then keep only the freshest few.
  const kept = Object.entries(sessions)
    .filter(([, session]) => session.heartbeatAt + config.leaseMs + PRESENCE.pruneAfterMs > now)
    .sort(([, a], [, b]) => b.heartbeatAt - a.heartbeatAt)
    .slice(0, PRESENCE.maxSessions);

  const previous = typeof doc?.lastActiveAt === "number" ? doc.lastActiveAt : 0;
  return { sessions: Object.fromEntries(kept), lastActiveAt: Math.max(previous, interactedAt) };
}
