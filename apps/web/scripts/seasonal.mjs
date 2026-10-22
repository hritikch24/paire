/** Remove an expired dated campaign before crawlers read the static page. */
export function expireCampaigns(html, now = Date.now()) {
  const today = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  const expired = [];
  html = html.replace(/<section\b([^>]*\bdata-garba-until="(\d{4}-\d{2}-\d{2})"[^>]*)>[\s\S]*?<\/section>/g, (block, attributes, until) => {
    if (today <= until) return block;
    const id = attributes.match(/\bid="([^"]+)"/)?.[1]; if (id) expired.push(id);
    return "";
  });
  for (const id of expired) html = html.replace(new RegExp(`<a\\b[^>]*href="#${id}"[^>]*>[\\s\\S]*?<\\/a>`, "g"), "");
  if (expired.includes("garba")) html = html.replace(/<b\b[^>]*data-garba-item[^>]*>[\s\S]*?<\/b>/g, "");
  return html;
}
