/** Never derive canonical URLs from a preview/deployment hostname. */
export function seoConfig(env = process.env) {
  const url = new URL(env.PAIRE_SITE_URL || env.CHITTHI_SITE_URL || env.MUSE_SITE_URL || "https://www.paire.in");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("PAIRE_SITE_URL must be an HTTPS origin without a path, query or credentials.");
  }
  const flag = env.PAIRE_ALLOW_INDEXING ?? env.CHITTHI_ALLOW_INDEXING ?? env.MUSE_ALLOW_INDEXING;
  const nonProduction = env.VERCEL_ENV && env.VERCEL_ENV !== "production";
  return { origin: url.origin, indexable: !nonProduction && flag !== "false" };
}

export function sitemapXml(origin, paths) {
  const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  // No synthetic modification dates or Google-ignored priority/changefreq values.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(paths)].map((path) => `  <url><loc>${escape(new URL(path, origin).href)}</loc></url>`).join("\n")}\n</urlset>\n`;
}
