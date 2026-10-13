import { createHmac } from "crypto";
import { sameSecret } from "./billing";

/** Didit's hosted live check is configured (it then takes priority over Paire's selfie check). */
export const diditCaptureAvailable = () => process.env.MUSE_VERIFICATION_ENABLED === "true" && Boolean(process.env.DIDIT_API_KEY && process.env.DIDIT_API_KEY !== "disabled" && process.env.DIDIT_WORKFLOW_ID && process.env.DIDIT_APPLICATION_ID);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function validDiditSignature(body: unknown, signature: string | undefined, timestamp: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!secret || secret === "disabled" || !signature || !/^[a-f0-9]{64}$/.test(signature) || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  // V2 authenticates the full decision, and timestamp must be part of that signed body.
  if ((body as { timestamp?: unknown } | null)?.timestamp !== Number(timestamp)) return false;
  return sameSecret(signature, createHmac("sha256", secret).update(JSON.stringify(canonical(body)), "utf8").digest("hex"));
}

export function passedLiveCheck(decision: unknown): boolean {
  const value = decision as { status?: unknown; liveness_checks?: unknown; face_matches?: unknown } | null;
  const checksPassed = (rows: unknown) => Array.isArray(rows) && rows.length > 0 && rows.every((row) => row && row.status === "Approved" && Array.isArray(row.warnings) && row.warnings.length === 0);
  return value?.status === "Approved" && checksPassed(value.liveness_checks) && checksPassed(value.face_matches);
}

/** Equal-second deliveries give revocation precedence; replayed approval cannot undo it. */
export function ignoreDiditEvent(previous: { eventAt?: unknown; eventId?: unknown; providerPassed?: unknown; providerErased?: unknown }, eventAt: number, eventId: string, passed: boolean): boolean {
  if (previous.providerErased === true) return true;
  if (typeof previous.eventAt !== "number") return false;
  return previous.eventAt > eventAt || (previous.eventAt === eventAt && (previous.eventId === eventId || (passed && previous.providerPassed === false)));
}

/** No arbitrary remote URL fetches: only the owner's Firebase bucket objects. */
export function ownedPhotoPath(url: string, uid: string, bucket: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://firebasestorage.googleapis.com") return null;
    const prefix = `/v0/b/${bucket}/o/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    const expected = `user-uploads/${uid}/photos/`;
    if (path.startsWith(`verified-photos/${uid}/`) && /^[a-f0-9-]{36}\/[0-5]$/.test(path.slice(`verified-photos/${uid}/`.length))) return path;
    return path.startsWith(expected) && /^[a-zA-Z0-9_.-]+$/.test(path.slice(expected.length)) ? path : null;
  } catch { return null; }
}
