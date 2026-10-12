const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Accepts millis, Firestore Timestamps, or pending server timestamps (null). */
export function toMillis(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number") return candidate.seconds * 1000;
  }
  return fallback;
}

export function formatLastActive(lastActiveAt?: number, now = Date.now()): string {
  if (!lastActiveAt) return "";
  const diff = now - lastActiveAt;
  if (diff < 2 * HOUR) return "Active recently";
  if (diff < DAY) return "Active today";
  if (diff < 7 * DAY) return "Active this week";
  return "";
}

/** Short relative label for list rows: "now", "5m", "3h", "Tue", "12 Mar". */
export function formatShortTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  const date = new Date(timestamp);
  if (diff < 7 * DAY) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function isSameDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/** Day separator label for chat: "Today", "Yesterday", or a date. */
export function formatDayLabel(timestamp: number, now = Date.now()): string {
  if (isSameDay(timestamp, now)) return "Today";
  if (isSameDay(timestamp, now - DAY)) return "Yesterday";
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}
