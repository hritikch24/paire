const istToday = (now) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);

/** Remove an expired dated campaign before crawlers read the static page. */
export function expireCampaigns(html, now = Date.now()) {
  const today = istToday(now);
  const expired = [];
  html = html.replace(/<section\b([^>]*\bdata-(?:garba|campaign)-until="(\d{4}-\d{2}-\d{2})"[^>]*)>[\s\S]*?<\/section>/g, (block, attributes, until) => {
    if (today <= until) return block;
    const id = attributes.match(/\bid="([^"]+)"/)?.[1]; if (id) expired.push(id);
    return "";
  });
  for (const id of expired) html = html.replace(new RegExp(`<a\\b[^>]*href="#${id}"[^>]*>[\\s\\S]*?<\\/a>`, "g"), "");
  if (expired.includes("garba")) html = html.replace(/<b\b[^>]*data-garba-item[^>]*>[\s\S]*?<\/b>/g, "");
  return html;
}

export const DIWALI_LAST_DAY = "2026-11-10";
export const diwaliOpen = (now = Date.now()) => istToday(now) <= DIWALI_LAST_DAY;

/**
 * The Diwali Together page after 10 November IST: the campaign blocks (<!--open-->…<!--/open-->) are
 * removed, so crawlers never read "this Diwali" copy once it is over. Before then the page is unchanged.
 */
export function closeDiwali(html, now = Date.now()) {
  if (diwaliOpen(now)) return html;
  return html
    .replace(/<!--open-->[\s\S]*?<!--\/open-->/g, "")
    .replace(/<h2 id="closed-title">([\s\S]*?)<\/h2>/, '<h1 id="closed-title">$1</h1>')
    .replace(/<html\b/, '<html data-campaign="closed"');
}
