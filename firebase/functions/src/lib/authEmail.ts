/**
 * Paire's own account emails (confirm email, reset password). Firebase has locked
 * this project's email templates (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED), so their
 * links can't be pointed at paire.in. Instead the server asks Firebase for the
 * one-time code, builds a www.paire.in/auth/action/ link, and sends a Paire email.
 */
export type AuthEmailKind = "verify" | "reset";

export const SITE_URL = (process.env.PAIRE_SITE_URL || "https://www.paire.in").replace(/\/+$/, "");

/** Firebase's generated link → the same one-time code on Paire's own page. */
export function paireActionLink(firebaseLink: string, site = SITE_URL): string | null {
  try {
    const source = new URL(firebaseLink);
    const mode = source.searchParams.get("mode");
    const oobCode = source.searchParams.get("oobCode");
    if (!mode || !oobCode || !["verifyEmail", "resetPassword"].includes(mode)) return null;
    const link = new URL(`${site}/auth/action/`);
    link.searchParams.set("mode", mode);
    link.searchParams.set("oobCode", oobCode);
    const apiKey = source.searchParams.get("apiKey");
    if (apiKey) link.searchParams.set("apiKey", apiKey);
    return link.toString();
  } catch {
    return null;
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COPY: Record<AuthEmailKind, { subject: string; title: string; text: string; button: string; footer: string }> = {
  verify: {
    subject: "Confirm your email for Paire",
    title: "One tap and you're in",
    text: "Confirm this is your email to finish setting up Paire. Every member confirms theirs, so fake accounts stay out.",
    button: "Confirm my email",
    footer: "Didn't sign up for Paire? Ignore this email and nothing will happen."
  },
  reset: {
    subject: "Reset your Paire password",
    title: "Choose a new password",
    text: "Someone (hopefully you) asked to reset the password for your Paire account. The link works once and expires in an hour.",
    button: "Choose a new password",
    footer: "Didn't ask for this? Ignore this email: your password stays the same."
  }
};

/** Subject, plain text and a simple inline-styled HTML email (renders in Gmail, Outlook and phones). */
export function authEmail(kind: AuthEmailKind, link: string): { subject: string; text: string; html: string } {
  const copy = COPY[kind];
  const href = escapeHtml(link);
  const text = `${copy.title}\n\n${copy.text}\n\n${copy.button}: ${link}\n\n${copy.footer}\n\nPaire · Find your Paire · ${SITE_URL.replace(/^https:\/\//, "")}`;
  const html = `<!doctype html><html><body style="margin:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b1a29">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #eadfd6;border-radius:24px">
<tr><td style="padding:32px 28px">
<div style="font-size:26px;font-weight:700;letter-spacing:-0.5px;color:#3a1236">paire<span style="color:#ee7a82">.</span></div>
<h1 style="font-size:26px;line-height:1.2;margin:28px 0 12px;color:#2b1a29">${escapeHtml(copy.title)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 26px;color:#6b5a66">${escapeHtml(copy.text)}</p>
<a href="${href}" style="display:inline-block;background:#a43754;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:15px 26px;border-radius:999px">${escapeHtml(copy.button)}</a>
<p style="font-size:12px;line-height:1.6;margin:26px 0 0;color:#8a7a84">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:#a43754;word-break:break-all">${href}</a></p>
<p style="font-size:12px;line-height:1.6;margin:22px 0 0;color:#8a7a84">${escapeHtml(copy.footer)}</p>
</td></tr></table>
<p style="font-size:12px;color:#8a7a84;margin:18px 0 0">Paire · Find your Paire · <a href="${SITE_URL}" style="color:#8a7a84">${escapeHtml(SITE_URL.replace(/^https:\/\//, ""))}</a></p>
</td></tr></table></body></html>`;
  return { subject: copy.subject, text, html };
}
