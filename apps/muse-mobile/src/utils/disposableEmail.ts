/**
 * Throwaway inbox services. A verified address on one of these still isn't a
 * real person's mailbox, so it never unlocks dating. Mirrored from the server
 * (firebase/functions/src/lib/disposableEmail.ts), which enforces it; here it only warns before sign-up.
 */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonaddy.me", "burnermail.io",
  "byom.de", "dispostable.com", "discard.email", "dropmail.me", "emailondeck.com", "emailfake.com",
  "emltmp.com", "fakeinbox.com", "fakemail.net", "getairmail.com", "getnada.com", "guerrillamail.biz",
  "guerrillamail.com", "guerrillamail.de", "guerrillamail.info", "guerrillamail.net", "guerrillamail.org",
  "guerrillamailblock.com", "grr.la", "harakirimail.com", "inboxbear.com", "inboxkitten.com", "incognitomail.org",
  "jetable.org", "mail.tm", "mail.gw", "mailcatch.com", "maildrop.cc", "mailinator.com", "mailinator.net",
  "mailnesia.com", "mailpoof.com", "mailsac.com", "mintemail.com", "mohmal.com", "moakt.com", "mytemp.email",
  "nada.email", "sharklasers.com", "spam4.me", "spamgourmet.com", "temp-mail.io", "temp-mail.org", "tempail.com",
  "tempmail.com", "tempmail.dev", "tempmail.net", "tempmail.plus", "tempmailo.com", "tempr.email", "tmail.ws",
  "tmailor.com", "tmpmail.net", "tmpmail.org", "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.net",
  "trbvm.com", "yopmail.com", "yopmail.fr", "yopmail.net", "zetmail.com"
]);

export function isDisposableEmail(email: string | null | undefined): boolean {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  // Subdomains of a throwaway service count too (e.g. "x.mailinator.com").
  return [...DISPOSABLE_EMAIL_DOMAINS].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}
