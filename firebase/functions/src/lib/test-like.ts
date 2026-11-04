export type TestLikeConfig = { enabled: boolean; senderEmail: string; allowlist: string[]; delayMs: number };

export const DEFAULT_DELAY_MS = 5 * 60 * 1000;
const MIN_DELAY_MS = 60 * 1000;
const MAX_DELAY_MS = 60 * 60 * 1000;

export function parseTestLikeConfig(data: Record<string, unknown> | undefined): TestLikeConfig {
  const emails = (value: unknown) => (Array.isArray(value) ? value : []).filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const delay = Number(data?.delayMs);
  return {
    enabled: data?.enabled === true,
    senderEmail: typeof data?.senderEmail === "string" ? data.senderEmail.trim().toLowerCase() : "",
    allowlist: emails(data?.allowlist),
    delayMs: Number.isFinite(delay) && delay > 0 ? Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, delay)) : DEFAULT_DELAY_MS
  };
}

/** Pure decision used by the trigger: should this write queue a like, and when is it due? */
export function dueTime(config: TestLikeConfig, email: string | null | undefined, completedNow: boolean, now: number): number | null {
  if (!config.enabled || !completedNow || !config.senderEmail || !email) return null;
  const normal = email.trim().toLowerCase();
  if (normal === config.senderEmail || !config.allowlist.includes(normal)) return null;
  return now + config.delayMs;
}

/** "Returned" means the recipient was active after the like was delivered. */
export function funnelStatus(job: { status?: string; likeSentAt?: number }, lastActiveAt: number | null): "waiting" | "sent" | "returned" | "failed" {
  if (job.status === "failed" || job.status === "skipped") return "failed";
  if (job.status !== "sent" || !job.likeSentAt) return "waiting";
  return lastActiveAt !== null && lastActiveAt > job.likeSentAt ? "returned" : "sent";
}

