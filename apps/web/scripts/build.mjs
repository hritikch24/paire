/**
 * Builds the Paire website for static hosting (Vercel or any CDN):
 *   /            marketing page (apps/web/site)
 *   /app/        the real Paire app, exported for the browser from apps/muse-mobile
 *   /privacy/ …  legal pages (apps/web/legal)
 *
 * Run from anywhere: `node apps/web/scripts/build.mjs`. Output: apps/web/dist.
 * The browser app talks to the same Firebase project as the phone app; set
 * EXPO_PUBLIC_FIREBASE_* / EXPO_PUBLIC_FUNCTIONS_REGION in the hosting
 * environment to point it elsewhere. Emulators and test hooks are always off.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cities } from "../content/cities.mjs";
import { compare } from "../content/compare.mjs";
import { core } from "../content/core.mjs";
import { guidesA } from "../content/guides-a.mjs";
import { guidesB } from "../content/guides-b.mjs";
import { FOOTER, renderPage, stripHtml } from "./render-pages.mjs";

const web = resolve(import.meta.dirname, "..");
const app = resolve(web, "../muse-mobile");
const output = resolve(web, "dist");
const exported = resolve(web, ".browser-export");

/** A PAIRE_* site variable; the earlier CHITTHI_* name still works, so a renamed brand never drops back to placeholders. */
const siteVar = (name) => process.env[`PAIRE_${name}`] || process.env[`CHITTHI_${name}`] || undefined;

if (!existsSync(resolve(app, "node_modules/expo"))) {
  execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: app, stdio: "inherit" });
}

// Legal links inside the app point at this same site when we know its address.
const siteUrl = (
  siteVar("SITE_URL") ||
  process.env.MUSE_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
).replace(/\/+$/, "");

const env = {
  ...process.env,
  EXPO_NO_DOTENV: "1",
  EXPO_PUBLIC_USE_FIREBASE_EMULATOR: "false",
  EXPO_PUBLIC_TEST_SERVER: "false",
  EXPO_PUBLIC_E2E: "false",
  // Native-only providers stay off in the browser.
  EXPO_PUBLIC_CALL_DOMAIN: "",
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "",
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: "",
  ...(siteVar("SUPPORT_EMAIL") && !process.env.EXPO_PUBLIC_SUPPORT_EMAIL ? { EXPO_PUBLIC_SUPPORT_EMAIL: siteVar("SUPPORT_EMAIL") } : {}),
  ...(siteUrl && !process.env.EXPO_PUBLIC_LEGAL_BASE_URL ? { EXPO_PUBLIC_LEGAL_BASE_URL: siteUrl } : {})
};

rmSync(output, { recursive: true, force: true });
rmSync(exported, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

execFileSync(
  process.execPath,
  [resolve(app, "node_modules/expo/bin/cli"), "export", "--platform", "web", "--output-dir", exported, "--clear"],
  { cwd: app, env, stdio: "inherit" }
);

// The app's assets live at the root (/_expo, /assets); its page moves to /app/.
for (const item of readdirSync(exported)) {
  if (item !== "index.html") cpSync(resolve(exported, item), resolve(output, item), { recursive: true });
}
mkdirSync(resolve(output, "app"), { recursive: true });
writeFileSync(
  resolve(output, "app/index.html"),
  readFileSync(resolve(exported, "index.html"), "utf8")
    .replace(/<title>[^<]*<\/title>/, "<title>Paire — Find your Paire</title>")
    .replace(
      "</head>",
      '<meta name="description" content="Paire: likes with notes, free \u201cwho likes you\u201d and privacy controls built for India." />' +
        '<meta name="theme-color" content="#9A2C5A" /><link rel="manifest" href="/manifest.webmanifest" />' +
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png" /><meta name="robots" content="noindex" /></head>'
    )
);

cpSync(resolve(web, "site"), output, { recursive: true });

// Meta Pixel for ads (PAIRE_META_PIXEL_ID in Vercel): PageView everywhere, Lead when someone opens the app,
// and the app itself reports CompleteRegistration and Purchase (src/services/analytics.ts).
// It loads only with consent (India DPDP Act: consent before processing): a small banner asks once, the
// answer is kept in localStorage ("paire_ads_consent": "granted" | "denied", changeable on
// /privacy-choices/), and a Global Privacy Control signal always counts as "no". Without consent no
// Meta code or cookie is loaded, and the app's conversion calls do nothing (window.fbq doesn't exist).
const pixelId = /^\d{6,20}$/.test(siteVar("META_PIXEL_ID") ?? "") ? siteVar("META_PIXEL_ID") : "";
const pixelCode = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="/app/"]');if(a)fbq('track','Lead')});`;
const pixel = pixelId
  ? `<script>(function(){var K='paire_ads_consent',w=window,d=document;function get(){try{return localStorage.getItem(K)}catch(e){return null}}function set(v){try{localStorage.setItem(K,v)}catch(e){}}function load(){if(w.fbq)return;${pixelCode}}w.paireAdsConsent={get:get,set:set,load:load};if(navigator.globalPrivacyControl===true||navigator.webdriver)return;var c=get();if(c==='granted'){load();return}if(c==='denied')return;function ask(){if(d.getElementById('paire-consent'))return;var b=d.createElement('div');b.id='paire-consent';b.setAttribute('role','region');b.setAttribute('aria-label','Advertising measurement choice');b.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;background:#302a2c;color:#faf6f0;border-radius:16px;padding:14px 16px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 10px 30px #0004;display:flex;flex-wrap:wrap;gap:10px;align-items:center';b.innerHTML='<span style="flex:1 1 260px">May we use the Meta Pixel to measure our ads? It never sees your profile, photos or messages. <a href="/privacy-choices/" style="color:#e8b0ab">Learn more</a></span>';function btn(t,v,p){var x=d.createElement('button');x.type='button';x.textContent=t;x.style.cssText='border:0;border-radius:99px;padding:9px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;'+(p?'background:#e8b0ab;color:#302a2c':'background:transparent;color:#faf6f0;border:1px solid #faf6f088');x.onclick=function(){set(v);b.remove();if(v==='granted')load()};return x}b.appendChild(btn('No thanks','denied'));b.appendChild(btn('Allow','granted',1));d.body.appendChild(b)}if(d.body)ask();else d.addEventListener('DOMContentLoaded',ask)})()</script>`
  : "";

// Anonymous page counts for /metrics/: no cookies, no IP or user IDs. The browser only remembers
// (localStorage) whether it already visited today, so daily visitors can be counted.
const visitBeacon = `<script>(function(){try{if(navigator.webdriver)return;var q=new URLSearchParams(location.search),d=new Date(Date.now()+198e5).toISOString().slice(0,10),n=0;try{if(localStorage.getItem('paire_seen')!==d){localStorage.setItem('paire_seen',d);n=1}}catch(e){}var b=JSON.stringify({p:location.pathname,r:document.referrer,s:q.get('utm_source')||'',f:q.has('fbclid')?1:0,g:q.has('gclid')?1:0,n:n});if(navigator.sendBeacon)navigator.sendBeacon('/v/',new Blob([b],{type:'text/plain'}));else fetch('/v/',{method:'POST',body:b,keepalive:true})}catch(e){}})()</script>`;

// Site pages: absolute URLs for canonical links, structured data and social previews.
const origin = siteUrl || "https://www.paire.in";
// Search Console / Bing Webmaster Tools ownership tags (PAIRE_GOOGLE_SITE_VERIFICATION, PAIRE_BING_SITE_VERIFICATION).
const verificationTags = [["google-site-verification", siteVar("GOOGLE_SITE_VERIFICATION")], ["msvalidate.01", siteVar("BING_SITE_VERIFICATION")]]
  .filter(([, value]) => value && /^[\w-]{10,100}$/.test(value))
  .map(([name, value]) => `<meta name="${name}" content="${value}">`).join("");
for (const page of ["index.html", "garba-nights/index.html", "vibe-quiz/index.html"]) {
  const file = resolve(output, page);
  writeFileSync(
    file,
    readFileSync(file, "utf8")
      .split("%SITE_URL%").join(origin)
      .replace('content="/og-image.png"', `content="${origin}/og-image.png"`)
      .replace(/<footer class="wrap">[\s\S]*?<\/footer>/, FOOTER)
      .replace("</head>", `${page === "index.html" ? verificationTags : ""}${pixel}${visitBeacon}</head>`)
  );
}

// Guides, city pages, comparisons, about, pricing… (apps/web/content). Existing pages are listed
// too so content can link to them in "Keep reading".
const contentPages = [...core, ...compare, ...cities, ...guidesA, ...guidesB];
const linkable = [
  ...contentPages,
  { path: "garba-nights/", crumb: "Garba Nights", h1: "Garba Nights", description: "Find a Garba or Dandiya partner this Navratri: pick your nights and meet people near you going on the same nights." },
  { path: "vibe-quiz/", crumb: "Dating vibe quiz", h1: "What's your dating vibe?", description: "A free 1-minute quiz: are you a Cozy Romantic, Midnight Philosopher, Adventure Spark or Movie Dreamer, and who do you click with?" },
  { path: "safety/", crumb: "Dating safety guide", h1: "Dating safety", description: "Paire's safety guide: before you meet, on the date, and how reporting works." }
];
for (const page of contentPages) {
  mkdirSync(resolve(output, page.path), { recursive: true });
  writeFileSync(resolve(output, page.path, "index.html"), renderPage(page, { origin, pages: linkable, extraHead: `${pixel}${visitBeacon}` }));
}

// IndexNow (Bing, Yandex, Seznam…; ChatGPT search reads Bing's index): the key file is
// apps/web/site/<key>.txt; after each deploy run `node apps/web/scripts/indexnow.mjs`.
{
  const appIndex = resolve(output, "app/index.html");
  writeFileSync(appIndex, readFileSync(appIndex, "utf8").replace("</head>", `${pixel}${visitBeacon}</head>`));
}
mkdirSync(resolve(output, "fonts"), { recursive: true });
for (const [weight, kind] of [["400Regular", "regular"], ["700Bold", "bold"]]) {
  cpSync(
    resolve(app, `node_modules/@expo-google-fonts/space-grotesk/${weight}/SpaceGrotesk_${weight}.ttf`),
    resolve(output, `fonts/space-grotesk-${kind}.ttf`)
  );
}
// Business details for the legal pages come from the environment, never from source.
const effectiveDate =
  siteVar("LEGAL_EFFECTIVE_DATE") ||
  new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const legalDetails = {
  "[SUPPORT EMAIL]": siteVar("SUPPORT_EMAIL"),
  "[GRIEVANCE EMAIL]": siteVar("GRIEVANCE_EMAIL") || siteVar("SUPPORT_EMAIL"),
  "[GRIEVANCE OFFICER NAME]": siteVar("GRIEVANCE_OFFICER") || "Hritik Chaudhary",
  "[POSTAL ADDRESS]": siteVar("POSTAL_ADDRESS"),
  "[CITY]": siteVar("JURISDICTION_CITY"),
  "[EFFECTIVE DATE]": effectiveDate
};
const missing = Object.entries(legalDetails).filter(([, value]) => !value).map(([key]) => key);
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DRAFT_BANNER = /<div class="card"><strong>Private preview · Legal draft<\/strong>.*?<\/div>/s;
for (const page of ["privacy", "terms", "community-guidelines", "safety", "delete-account", "refunds", "contact", "privacy-choices", "copyright", "accessibility"]) {
  let html = readFileSync(resolve(web, "legal", `${page}.html`), "utf8");
  for (const [placeholder, value] of Object.entries(legalDetails)) {
    if (value) html = html.split(placeholder).join(escapeHtml(value));
  }
  if (!missing.length) html = html.replace(DRAFT_BANNER, "");
  html = html.replace("</head>", `${visitBeacon}</head>`);
  mkdirSync(resolve(output, page), { recursive: true });
  writeFileSync(resolve(output, page, "index.html"), html);
}
if (missing.length) {
  console.warn(`Legal pages still show draft placeholders: ${missing.join(", ")}. Set the PAIRE_* variables (docs/vercel.md) before launch.`);
}
cpSync(resolve(web, "legal/styles.css"), resolve(output, "styles.css"));

// Search engines stay out until the public launch (set PAIRE_ALLOW_INDEXING=true then).
// The founder dashboard is deliberately not named here: it opens only at /metrics?key=admin
// (a vercel.json rewrite), carries noindex, and needs an allowed Google account.
const indexable = (siteVar("ALLOW_INDEXING") ?? process.env.MUSE_ALLOW_INDEXING) === "true";
writeFileSync(
  resolve(output, "robots.txt"),
  indexable
    ? // Search engines and AI answer engines (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) are all welcome.
      `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /auth/\n\n${["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Bingbot"]
        .map((bot) => `User-agent: ${bot}\nAllow: /\nDisallow: /app/\n`)
        .join("\n")}\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ""}`
    : "User-agent: *\nDisallow: /\n"
);
if (indexable && siteUrl) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    ["", today, "1.0", "daily"],
    ["garba-nights/", today, "0.9", "weekly"],
    ["vibe-quiz/", today, "0.8", "monthly"],
    ...contentPages.map((page) => [page.path, page.updated ?? today, page.type === "hub" ? "0.8" : page.path.startsWith("guides/") || page.path.startsWith("compare/") ? "0.8" : "0.7", "monthly"]),
    ...["safety/", "community-guidelines/", "contact/", "terms/", "privacy/", "refunds/", "privacy-choices/", "copyright/", "accessibility/"].map((page) => [page, today, page === "safety/" ? "0.6" : "0.3", "yearly"])
  ];
  writeFileSync(
    resolve(output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
      .map(([page, lastmod, priority, changefreq]) => `  <url><loc>${siteUrl}/${page}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`)
      .join("\n")}\n</urlset>\n`
  );
  writeFileSync(resolve(output, "urls.txt"), entries.map(([page]) => `${siteUrl}/${page}`).join("\n") + "\n");
}

// llms.txt (a map for AI assistants) lists every page; llms-full.txt carries their full text.
const section = (title, pages) => `\n## ${title}\n\n${pages.map((page) => `- [${page.crumb ?? stripHtml(page.h1)}](${origin}/${page.path}): ${page.description}`).join("\n")}\n`;
writeFileSync(
  resolve(output, "llms.txt"),
  readFileSync(resolve(web, "site/llms.txt"), "utf8").trimEnd() + "\n" +
    section("About Paire", core.filter((page) => page.type !== "hub")) +
    section("Paire compared with other apps", compare) +
    section("Dating guides for India", [...guidesA, ...guidesB]) +
    section("Dating in Indian cities", cities) +
    `\nFull text of these pages: ${origin}/llms-full.txt\n`
);
writeFileSync(
  resolve(output, "llms-full.txt"),
  `# Paire: full text\n\n${readFileSync(resolve(web, "site/llms.txt"), "utf8").trim()}\n\n` +
    contentPages.filter((page) => page.type !== "hub").map((page) => [
      `---\n\n# ${stripHtml(page.h1)}\n\nURL: ${origin}/${page.path}\nUpdated: ${page.updated}\n\n${stripHtml(page.lede)}`,
      page.summary ? `\n\nIn short:\n${page.summary.map((line) => `- ${stripHtml(line)}`).join("\n")}` : "",
      `\n\n${stripHtml(page.body ?? "")}`,
      page.faq?.length ? `\n\n## Questions\n\n${page.faq.map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n")}` : ""
    ].join("")).join("\n\n") + "\n"
);
writeFileSync(
  resolve(output, "404.html"),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — Paire</title><link rel="stylesheet" href="/site.css"><main class="wrap section"><a class="wordmark" href="/">paire<span>.</span></a><h1>This page wandered off.</h1><p>Head back home or open the dating app.</p><a class="button" href="/">Back home</a> <a class="text-link" href="/app/">Open Paire</a></main></html>'
);
rmSync(exported, { recursive: true, force: true });
console.log(`Paire web built in ${output}${siteUrl ? ` for ${siteUrl}` : ""}. Emulators and test hooks are off.`);
