import { createHash } from "node:crypto";

export type BrowserSubscription = { endpoint: string; keys: { auth: string; p256dh: string } };

/** Limit outgoing requests to browser push services, never caller-controlled servers. */
export function parseBrowserSubscription(value: unknown): BrowserSubscription | null {
  if (!value || typeof value !== "object") return null;
  const data = value as { endpoint?: unknown; keys?: { auth?: unknown; p256dh?: unknown } };
  if (typeof data.endpoint !== "string" || data.endpoint.length > 2048) return null;
  try {
    const url = new URL(data.endpoint);
    const host = url.hostname;
    const allowed = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
    if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return null;
  } catch { return null; }
  const validKey = (key: unknown, bytes: number) => typeof key === "string" && /^[A-Za-z0-9_-]+={0,2}$/.test(key) && Buffer.from(key, "base64url").length === bytes;
  if (!validKey(data.keys?.auth, 16) || !validKey(data.keys?.p256dh, 65)) return null;
  return { endpoint: data.endpoint, keys: { auth: data.keys!.auth as string, p256dh: data.keys!.p256dh as string } };
}

export const subscriptionId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");
