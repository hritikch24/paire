import type { PresenceView } from "../services/presenceService";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** What the app shows for one person; null when nothing may be said. */
export type PresenceStatus = { online: true } | { online: false; lastActiveAt: number | null };

/**
 * Turns the server's answer into a status on this device's clock. `offsetMs`
 * converts server time to local time. Unknown, stale or hidden presence is
 * never "online".
 */
export function presenceStatus(view: PresenceView | undefined, offsetMs: number, now = Date.now()): PresenceStatus | null {
  if (!view || view.state === "unavailable") return null;
  if (view.state === "online" && view.onlineUntil + offsetMs > now) return { online: true };
  // An online window that just ran out here: they were active moments ago.
  const lastActiveAt = view.state === "offline" ? view.lastActiveAt : view.onlineUntil;
  return { online: false, lastActiveAt: typeof lastActiveAt === "number" ? lastActiveAt + offsetMs : null };
}

/** "Online", or an approximate "Active 20 min ago" / "Active 3 h ago" / "Active yesterday". */
export function presenceLabel(status: PresenceStatus | null, now = Date.now()): string {
  if (!status) return "";
  if (status.online) return "Online";
  if (!status.lastActiveAt) return "";
  const age = Math.max(0, now - status.lastActiveAt);
  if (age < 10 * MINUTE) return "Active a few minutes ago";
  if (age < HOUR) return `Active ${Math.floor(age / (5 * MINUTE)) * 5} min ago`;
  if (age < DAY) return `Active ${Math.floor(age / HOUR)} h ago`;
  if (age < 2 * DAY) return "Active yesterday";
  if (age <= 30 * DAY) return `Active ${Math.floor(age / DAY)} days ago`;
  return "";
}

/** When a shown status will next change by itself (someone online timing out), as a local time. */
export function nextPresenceChange(members: Record<string, PresenceView> | undefined, offsetMs: number, now = Date.now()): number | null {
  let next: number | null = null;
  for (const view of Object.values(members ?? {})) {
    if (view.state !== "online") continue;
    const at = view.onlineUntil + offsetMs;
    if (at > now && (next === null || at < next)) next = at;
  }
  return next;
}
