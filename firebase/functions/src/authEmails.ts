import { createHash } from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { authEmail, AuthEmailKind, paireActionLink } from "./lib/authEmail";
import { dayKey } from "./lib/ids";
import { consumeDailyQuota } from "./quota";

/**
 * Sends Paire's own confirm-email and reset-password emails through Resend
 * (RESEND_API_KEY secret; sender AUTH_EMAIL_FROM, a verified paire.in address).
 * Until a key is set this answers { sent: false } and the app falls back to
 * Firebase's built-in emails.
 */
const resendKey = () => {
  const key = process.env.RESEND_API_KEY;
  return key && key !== "disabled" ? key : null;
};
const FROM = () => process.env.AUTH_EMAIL_FROM || "Paire <noreply@paire.in>";
const RESET_PER_EMAIL_PER_DAY = 3;
const RESET_PER_IP_PER_DAY = 30;
const VERIFY_PER_DAY = 6;

async function send(to: string, kind: AuthEmailKind, firebaseLink: string): Promise<void> {
  const link = paireActionLink(firebaseLink);
  if (!link) throw new Error("Unexpected action link");
  const email = authEmail(kind, link);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${resendKey()}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], reply_to: "support@paire.in", subject: email.subject, text: email.text, html: email.html })
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

/** Counts one send against a hashed key for today; false once the limit is reached. */
async function underLimit(key: string, limit: number): Promise<boolean> {
  const ref = db.doc(`authEmailLimits/${createHash("sha256").update(`${dayKey()}:${key}`).digest("hex")}`);
  return db.runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).get("count") as number | undefined) ?? 0;
    if (used >= limit) return false;
    tx.set(ref, { count: used + 1, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    return true;
  });
}

export const requestAuthEmail = onCall({ region: REGION, secrets: ["RESEND_API_KEY"], timeoutSeconds: 30 }, async (request): Promise<{ sent: boolean }> => {
  const kind = request.data?.kind;
  if (kind !== "verify" && kind !== "reset") throw new HttpsError("invalid-argument", "Choose an email to send.");
  if (!resendKey()) return { sent: false };
  try {
    if (kind === "verify") {
      const uid = requireAuth(request);
      const user = await adminAuth().getUser(uid);
      if (!user.email || user.emailVerified) return { sent: true };
      await consumeDailyQuota(uid, "verifyEmails", VERIFY_PER_DAY);
      await send(user.email, "verify", await adminAuth().generateEmailVerificationLink(user.email));
      return { sent: true };
    }
    const email = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 320) throw new HttpsError("invalid-argument", "Enter a valid email address.");
    const ip = request.rawRequest?.ip || "unknown";
    if (!(await underLimit(`ip:${ip}`, RESET_PER_IP_PER_DAY)) || !(await underLimit(`email:${email}`, RESET_PER_EMAIL_PER_DAY))) {
      throw new HttpsError("resource-exhausted", "Too many emails in a row. Wait a while, then try again.");
    }
    // The same answer whether or not an account exists, so this can't be used to look people up.
    const exists = await adminAuth().getUserByEmail(email).then(() => true, () => false);
    if (exists) await send(email, "reset", await adminAuth().generatePasswordResetLink(email));
    return { sent: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Account email failed", { kind, error: String(error) });
    // Let the app fall back to Firebase's own email rather than leave the member stuck.
    return { sent: false };
  }
});
