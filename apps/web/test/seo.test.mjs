import test from "node:test";
import assert from "node:assert/strict";
import { seoConfig, sitemapXml } from "../scripts/seo.mjs";
import { renderPage } from "../scripts/render-pages.mjs";

test("production is indexable while explicit holds and inherited preview flags remain private", () => {
  assert.equal(seoConfig({ VERCEL_ENV: "production" }).indexable, true);
  assert.equal(seoConfig({ PAIRE_ALLOW_INDEXING: "false" }).indexable, false);
  assert.equal(seoConfig({ MUSE_ALLOW_INDEXING: "false" }).indexable, false);
  for (const VERCEL_ENV of ["preview", "development"]) assert.equal(seoConfig({ VERCEL_ENV, PAIRE_ALLOW_INDEXING: "true" }).indexable, false);
});
test("deployment host never replaces the public canonical origin", () => {
  assert.equal(seoConfig({ VERCEL_PROJECT_PRODUCTION_URL: "preview.invalid" }).origin, "https://www.paire.in");
  for (const PAIRE_SITE_URL of ["http://www.paire.in", "https://www.paire.in/path", "https://www.paire.in/?a=1", "https://user:pass@www.paire.in/"]) assert.throws(() => seoConfig({ PAIRE_SITE_URL }));
});
test("sitemap deduplicates URLs, escapes XML and makes no false freshness claims", () => {
  const xml = sitemapXml("https://www.paire.in", ["/", "/pricing/", "/pricing/", "/a&b/"]);
  assert.equal((xml.match(/<url>/g) || []).length, 3);
  assert.match(xml, /a&amp;b/);
  assert.doesNotMatch(xml, /lastmod|priority|changefreq/);
});
test("editorial guides use Article while product, about and city pages use page types", () => {
  const expected = { "guides/safety/": "Article", "compare/app/": "Article", "pricing/": "WebPage", "dating/delhi/": "WebPage", "circles/tech/": "WebPage", "about/": "AboutPage" };
  for (const [path, type] of Object.entries(expected)) {
    const html = renderPage({ path, title: "Test page", description: "Description", h1: "Heading", lede: "Intro", updated: "2026-10-29", published: "2026-10-13" }, { origin: "https://www.paire.in", pages: [] });
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(graph.find((item) => item["@id"]?.endsWith("#page"))["@type"], type, path);
    assert.equal(graph.find((item) => item["@type"] === "BreadcrumbList").itemListElement[0].item, "https://www.paire.in/");
  }
});
