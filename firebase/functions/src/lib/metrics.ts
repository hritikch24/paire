/**
 * Anonymous visit counting for www.paire.in: no cookies, no IP addresses, no
 * user IDs. A page view adds 1 to today's totals by page, source and device; the
 * browser itself says whether it's its first visit today (localStorage).
 */
export const METRICS_SHARDS = 10;

/** India's calendar day, "2026-10-13". */
export const istDay = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);

const PAGES = ["/", "/app/", "/garba-nights/", "/privacy/", "/terms/", "/safety/", "/community-guidelines/", "/refunds/", "/contact/", "/delete-account/", "/auth/action/"];

/** Known pages only (Firestore map keys can't hold "/" or "."). */
export function pageKey(path: unknown): string {
  if (typeof path !== "string") return "other";
  const clean = path.split(/[?#]/)[0].replace(/\/?$/, "/");
  const page = clean.startsWith("/app/") ? "/app/" : PAGES.includes(clean) ? clean : "other";
  return page === "/" ? "home" : page.replace(/^\/|\/$/g, "").replace(/\//g, "-");
}

const KNOWN_REFERRERS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "instagram"], [/(^|\.)facebook\.com$|(^|\.)fb\.com$|^l\.facebook\.com$/, "facebook"],
  [/(^|\.)google\./, "google"], [/(^|\.)bing\.com$/, "bing"], [/(^|\.)youtube\.com$/, "youtube"],
  [/(^|\.)t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, "x"], [/(^|\.)linkedin\.com$|lnkd\.in$/, "linkedin"],
  [/(^|\.)whatsapp\.(com|net)$|wa\.me$/, "whatsapp"], [/(^|\.)reddit\.com$/, "reddit"], [/(^|\.)chatgpt\.com$|openai\.com$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"], [/(^|\.)snapchat\.com$/, "snapchat"], [/(^|\.)sharechat\.com$/, "sharechat"]
];

/** Where the visit came from: an ad tag, a known site, another site, or direct. */
export function sourceKey(input: { utm?: unknown; referrer?: unknown; fbclid?: unknown; gclid?: unknown }): string {
  if (typeof input.utm === "string" && /^[a-zA-Z0-9_-]{1,30}$/.test(input.utm)) return `utm_${input.utm.toLowerCase()}`;
  if (input.fbclid) return "facebook-ad";
  if (input.gclid) return "google-ad";
  if (typeof input.referrer !== "string" || !input.referrer) return "direct";
  let host: string;
  try { host = new URL(input.referrer).hostname.toLowerCase(); } catch { return "direct"; }
  if (/(^|\.)paire\.in$|vercel\.app$/.test(host)) return "direct";
  const known = KNOWN_REFERRERS.find(([pattern]) => pattern.test(host));
  return known ? known[1] : "other-sites";
}

export const isBot = (userAgent: unknown) =>
  typeof userAgent !== "string" || !userAgent || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|python|curl|wget|httpclient/i.test(userAgent);

export const deviceKey = (userAgent: string) => (/mobile|android|iphone|ipod/i.test(userAgent) ? "phone" : /ipad|tablet/i.test(userAgent) ? "tablet" : "computer");
