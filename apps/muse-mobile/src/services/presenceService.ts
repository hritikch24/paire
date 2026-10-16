import { AppState, Platform } from "react-native";
import { setActivityListener } from "./activity";
import { callFunction } from "./firebase";
import { BeatPayload, BeatReply, createPresenceSession, newSessionId, PresencePlatform, PresenceSession } from "./presenceSession";

export type PresenceView =
  | { state: "online"; onlineUntil: number }
  | { state: "offline"; lastActiveAt: number | null }
  | { state: "unavailable" };

export type PresenceResult = {
  enabled: boolean;
  idleTimeoutMs: number;
  heartbeatMs: number;
  serverNow: number;
  members: Record<string, PresenceView>;
  /** Local clock when the answer arrived (for converting server times). */
  receivedAt: number;
};

/** Online/last-active for people you share an active chat with. The server decides who you may see. */
export async function fetchPresence(uids: string[]): Promise<PresenceResult> {
  const result = await callFunction<Omit<PresenceResult, "receivedAt">>("getPresence", { uids });
  return { ...result, receivedAt: Date.now() };
}

const monotonic = () => (typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now());
const platform: PresencePlatform = Platform.OS === "web" ? "web" : Platform.OS === "ios" ? "ios" : "android";

let current: { uid: string; session: PresenceSession; detach: () => void } | null = null;

/** Records that a meaningful interaction just happened. Cheap: no state update, no network call. */
export function markPresenceActivity() {
  current?.session.markActivity();
}

/**
 * Starts this device's session for the signed-in member (one per tab or app
 * process, however many components ask). Listens to app lifecycle and, on the
 * web, to interaction events without ever reading what was typed or clicked.
 */
export function startPresence(uid: string): void {
  if (current?.uid === uid) return;
  void stopPresence();
  const session = createPresenceSession({
    send: (payload: BeatPayload) => callFunction<BeatReply>("presenceBeat", payload, 10_000),
    now: monotonic,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    platform,
    sessionId: newSessionId(),
    startForeground: AppState.currentState === "active" || AppState.currentState == null
  });
  const cleanups: Array<() => void> = [];
  const lifecycle = AppState.addEventListener("change", (state) => {
    // On the web this follows the tab's visibility; "inactive" is iOS's app switcher.
    if (state === "active") session.foreground();
    else session.background();
  });
  cleanups.push(() => lifecycle.remove());
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const mark = () => session.markActivity();
    const options = { capture: true, passive: true } as const;
    // Not "scroll": pages scroll themselves (anchoring, new messages). Wheel, touch and keys are people.
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      document.addEventListener(event, mark, options);
      cleanups.push(() => document.removeEventListener(event, mark, options));
    }
    // Closing or leaving the page: best effort, and the lease covers a missed signal. Not an
    // end, so a page restored from the back-forward cache picks up again when it's shown.
    const leave = () => session.background();
    window.addEventListener("pagehide", leave);
    cleanups.push(() => window.removeEventListener("pagehide", leave));
  }
  setActivityListener(markPresenceActivity);
  cleanups.push(() => setActivityListener(null));
  current = { uid, session, detach: () => cleanups.forEach((cleanup) => cleanup()) };
}

/** Ends the session (sign-out, hiding activity). Waits briefly for the server, never blocks for long. */
export async function stopPresence(timeoutMs = 1500): Promise<void> {
  const active = current;
  if (!active) return;
  current = null;
  active.detach();
  await Promise.race([active.session.end(), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
