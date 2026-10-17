/**
 * Content pages (guides, city pages, comparisons, about, pricing…) rendered at
 * build time from apps/web/content/*.mjs. Each page gets its own title,
 * description, canonical URL, Open Graph tags and JSON-LD (Article or WebPage,
 * BreadcrumbList, and FAQPage when it has questions), so search engines and AI
 * assistants can read and cite it.
 */
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
export const stripHtml = (html) => html.replace(/<li>/g, "\n- ").replace(/<(h2|h3)[^>]*>/g, "\n\n## ").replace(/<\/(p|h2|h3|ul|ol|table|tr)>/g, "\n").replace(/<td[^>]*>/g, " | ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();

const NAV = `<nav aria-label="Main"><a href="/guides/">Guides</a><a href="/dating/">Cities</a><a href="/compare/">Compare</a><a href="/pricing/">Pricing</a><a href="/verification/">Safety &amp; verification</a></nav>`;

export const FOOTER = `<footer class="wrap"><div><a class="wordmark" href="/">paire<span>.</span></a><p>Built for real connection.<br>Made for all of India.</p></div><div class="footer-links"><a href="/about/">About Paire</a><a href="/features/">Features</a><a href="/pricing/">Pricing</a><a href="/verification/">How verification works</a><a href="/guides/">Dating guides</a><a href="/dating/">Dating in your city</a><a href="/compare/">Paire vs other apps</a><a href="/garba-nights/">Garba Nights</a></div><div class="footer-links"><a href="/safety/">Dating safety</a><a href="/community-guidelines/">Community guidelines</a><a href="/privacy/">Privacy policy</a><a href="/terms/">Terms of service</a><a href="/refunds/">Refunds &amp; cancellation</a><a href="/contact/">Contact us</a><a href="/delete-account/">Delete your account</a></div><p class="footer-credit">Built by KraftAI</p></footer>`;

const human = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function renderPage(page, { origin, pages, extraHead = "" }) {
  const url = `${origin}/${page.path}`;
  const crumbs = [{ name: "Paire", path: "" }, ...(page.parent ? [page.parent] : []), { name: page.crumb ?? page.h1, path: page.path }];
  const related = (page.related ?? []).map((path) => pages.find((p) => p.path === path)).filter(Boolean);
  const isArticle = page.type !== "hub";
  const graph = [
    {
      "@context": "https://schema.org",
      "@type": isArticle ? "Article" : "CollectionPage",
      headline: page.h1.replace(/<[^>]+>/g, ""),
      name: page.title,
      description: page.description,
      url,
      inLanguage: "en-IN",
      isPartOf: { "@id": `${origin}/#website` },
      ...(isArticle ? {
        datePublished: page.published, dateModified: page.updated,
        author: { "@type": "Organization", name: "Paire", url: `${origin}/` },
        publisher: { "@id": `${origin}/#org` },
        mainEntityOfPage: url, image: `${origin}/og-image.png`
      } : {}),
      ...(page.about ? { about: page.about } : {})
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.name, item: `${origin}/${crumb.path}` }))
    },
    ...(page.faq?.length ? [{
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
    }] : [])
  ];
  const hubList = page.type === "hub"
    ? `<div class="hub-grid">${pages.filter((p) => p.parent?.path === page.path).map((p) => `<a class="hub-card" href="/${p.path}"><strong>${esc(p.crumb ?? p.h1.replace(/<[^>]+>/g, ""))}</strong><span>${esc(p.description)}</span></a>`).join("")}</div>`
    : "";
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#faf6f0">
<title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${url}"><link rel="alternate" hreflang="en-IN" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">
<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/site.css">
<meta property="og:site_name" content="Paire"><meta property="og:type" content="${isArticle ? "article" : "website"}"><meta property="og:title" content="${esc(page.ogTitle ?? page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}/og-image.png"><meta property="og:locale" content="en_IN">${isArticle ? `<meta property="article:modified_time" content="${page.updated}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.ogTitle ?? page.title)}"><meta name="twitter:description" content="${esc(page.description)}"><meta name="twitter:image" content="${origin}/og-image.png">
<script type="application/ld+json">${json(graph)}</script>${extraHead}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav wrap"><a class="wordmark" href="/" aria-label="Paire home">paire<span>.</span></a>${NAV}<a class="button small" href="/app/">Open Paire <span aria-hidden="true">↗</span></a></header>
<main id="main" class="article wrap">
<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="/${c.path}">${esc(c.name)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(c.name)}</span>`)).join("")}</nav>
<p class="eyebrow">${esc(page.eyebrow ?? "PAIRE")}</p>
<h1>${page.h1}</h1>
<p class="article-lede">${page.lede}</p>
${isArticle ? `<p class="article-meta">Updated <time datetime="${page.updated}">${human(page.updated)}</time> · By the Paire team</p>` : ""}
${page.summary ? `<div class="article-summary"><strong>In short</strong><ul>${page.summary.map((s) => `<li>${s}</li>`).join("")}</ul></div>` : ""}
<div class="article-body">${page.body ?? ""}</div>
${hubList}
${page.faq?.length ? `<section class="article-faq"><h2>Questions people ask</h2>${page.faq.map(([q, a]) => `<details><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join("")}</section>` : ""}
<aside class="article-cta"><div><strong>${esc(page.cta ?? "Find your Paire.")}</strong><span>Free to join. Every like comes with a note, women set the rules, and seeing who likes you is free.</span></div><a class="button" href="/app/">Open Paire <span aria-hidden="true">↗</span></a></aside>
${related.length ? `<section class="article-related"><h2>Keep reading</h2><div class="hub-grid">${related.map((p) => `<a class="hub-card" href="/${p.path}"><strong>${esc(p.crumb ?? p.h1.replace(/<[^>]+>/g, ""))}</strong><span>${esc(p.description)}</span></a>`).join("")}</div></section>` : ""}
</main>
${FOOTER}
</body>
</html>
`;
}
