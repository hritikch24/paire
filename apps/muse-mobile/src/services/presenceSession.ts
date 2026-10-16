/**
 * This device's presence session. "Online" means recently interacting with
 * Paire in the foreground, so the session reports only *when* the person last
 * did something here (taps, clicks, scrolling, key presses, navigation, coming
 * back to the app), never what they did or typed, and nothing outside Paire.
 *
 * Interactions only update a number in memory: no React state and no network
 * write per event. The server hears from a session when it starts, when it
 * goes to the background or ends, every heartbeat while the person is active,
 * and right away when they come back after going idle. Once idle for the
 * timeout, heartbeats stop, so an open tab can't keep anyone online. Durations
 * come from a monotonic clock and the server converts them to its own time,
 * so this device's clock never matters.
 */

export type PresencePlatform = "web" | "android" | "ios";
export type BeatState = "active" | "background" | "ended";
export type BeatPayload = { sessionId: string; platform: PresencePlatform; state: BeatState; idleMs: number; seq: number };
export type BeatReply = { enabled: boolean; sharing: boolean; idleTimeoutMs: number; heartbeatMs: number; serverNow: number };

export const PRESENCE_DEFAULTS = { idleTimeoutMs: 2 * 60_000, heartbeatMs: 45_000 };
/** Coming back from idle beats at once, but never more often than this. */
export const MIN_ACTIVITY_GAP_MS = 5_000;
/** While presence is off for Paire, check again on foreground at most this often. */
export const RECHECK_DISABLED_MS = 10 * 60_000;
/**
 * The server said "not sharing" although this device thinks sharing is on: usually the
 * settings change hasn't reached it yet. Try again soon.
 */
export const RECHECK_SHARING_MS = 15_000;

type Deps = {
  send: (payload: BeatPayload) => Promise<BeatReply>;
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  platform: PresencePlatform;
  sessionId: string;
  /** Whether Paire is in the foreground right now. A session started in the background isn't activity. */
  startForeground?: boolean;
};

export type PresenceSession = {
  /** A meaningful interaction just happened (call freely: it costs nothing). */
  markActivity: () => void;
  foreground: () => void;
  background: () => void;
  /** Ends the session (sign-out, page close). Best effort; the lease covers the rest. */
  end: () => Promise<void>;
};

export function createPresenceSession(deps: Deps): PresenceSession {
  let config = { ...PRESENCE_DEFAULTS };
  let running = true;
  let inForeground = deps.startForeground !== false;
  // Opening Paire counts as activity; starting unseen in the background doesn't.
  let lastInteraction = inForeground ? deps.now() : -Infinity;
  let seq = 0;
  let lastBeatAt = -Infinity;
  /** The heartbeat loop runs only while the person has been active within the idle timeout. */
  let heartbeating = false;
  let timer: unknown = null;
  let disabledUntil = -Infinity;
  let inFlight = false;

  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  const disabled = () => deps.now() < disabledUntil;

  const send = async (state: BeatState) => {
    lastBeatAt = deps.now();
    seq += 1;
    const idle = deps.now() - lastInteraction;
    const reply = await deps.send({
      sessionId: deps.sessionId,
      platform: deps.platform,
      state,
      // Never interacted in this session: report "long ago" (the server caps it).
      idleMs: Number.isFinite(idle) ? Math.max(0, Math.round(idle)) : 7 * 24 * 60 * 60_000,
      seq
    });
    config = { idleTimeoutMs: reply.idleTimeoutMs, heartbeatMs: reply.heartbeatMs };
    if (!reply.enabled || !reply.sharing) {
      disabledUntil = deps.now() + (reply.enabled ? RECHECK_SHARING_MS : RECHECK_DISABLED_MS);
      heartbeating = false;
      clear();
    }
  };

  const schedule = () => {
    clear();
    if (!running || !inForeground || disabled()) return;
    heartbeating = true;
    timer = deps.setTimer(tick, config.heartbeatMs);
  };

  const beatActive = () => {
    if (inFlight) return;
    inFlight = true;
    void send("active")
      .catch(() => undefined) // Offline or failed: the next heartbeat or interaction retries.
      .finally(() => {
        inFlight = false;
      });
  };

  function tick() {
    timer = null;
    if (!running || !inForeground || disabled()) return;
    if (deps.now() - lastInteraction >= config.idleTimeoutMs) {
      // Idle: stop renewing. The server shows them offline from the timestamps alone.
      heartbeating = false;
      return;
    }
    beatActive();
    schedule();
  }

  const markActivity = () => {
    lastInteraction = deps.now();
    if (!running || !inForeground || disabled() || heartbeating) return;
    if (deps.now() - lastBeatAt < MIN_ACTIVITY_GAP_MS) return;
    beatActive();
    schedule();
  };

  const foreground = () => {
    if (!running) return;
    const wasForeground = inForeground;
    inForeground = true;
    lastInteraction = deps.now(); // Opening or coming back to Paire counts as activity.
    if (disabled() || (wasForeground && heartbeating)) return;
    beatActive();
    schedule();
  };

  const background = () => {
    if (!running || !inForeground) return;
    inForeground = false;
    heartbeating = false;
    clear();
    if (!disabled()) void send("background").catch(() => undefined);
  };

  const end = async () => {
    if (!running) return;
    running = false;
    heartbeating = false;
    clear();
    if (!disabled()) await send("ended").catch(() => undefined);
  };

  // Starting the session in the foreground (opening Paire) counts as activity.
  if (inForeground) {
    beatActive();
    schedule();
  }
  return { markActivity, foreground, background, end };
}

/**
 * Id for one tab or app process; a fresh one each launch, so a duplicated tab
 * can't share a session. Not a secret: the server files sessions under the
 * signed-in account, so nobody can write to someone else's.
 */
export function newSessionId(random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 24; i += 1) id += alphabet[Math.floor(random() * alphabet.length)];
  return id;
}
