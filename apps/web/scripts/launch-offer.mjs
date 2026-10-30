import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../muse-mobile/package.json", import.meta.url));
const ts = require("typescript");
const source = readFileSync(new URL("../../muse-mobile/src/config/launch-offer.ts", import.meta.url), "utf8");
export const offerModule = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { LAUNCH_OFFER, OFFER_PRICES, currentPrice, formatInr, offerActive } = await import(`data:text/javascript;base64,${Buffer.from(offerModule).toString("base64")}`);
export { LAUNCH_OFFER, OFFER_PRICES, currentPrice, formatInr, offerActive };
export function offerTable(now = Date.now()) {
  const active = offerActive(now);
  const labels = { day: "1 day", week: "1 week", month: "Monthly · 60 days", halfyear: "6 months", lifetime: "Lifetime Plus", chat: "Unlimited Chat · once" };
  return `<section class="launch-offer" aria-label="October pricing offer"><p class="eyebrow">${active ? "30–31 OCTOBER ONLY" : "CURRENT PRICES"}</p><h2>${active ? "A first hello.<br>A little less." : "Choose your pass."}</h2><p>${active ? `These launch prices end ${LAUNCH_OFFER.endLabel}. New members joining on 30–31 October can apply a marketing code on their first purchase. Limited to the first 250 accounts to claim a code, shared across all codes.` : "The 30–31 October promotion has ended. Previously issued orders keep their original quote."}</p><div class="offer-table-wrap"><table><thead><tr><th>Plan</th><th>From 1 November</th>${active ? "<th>30–31 Oct offer</th><th>With eligible promo</th>" : ""}</tr></thead><tbody>${Object.entries(OFFER_PRICES).map(([id, p]) => `<tr><th>${labels[id]}</th><td>${active ? `<s>${formatInr(p.regular)}</s>` : formatInr(p.regular)}</td>${active ? `<td><strong>${formatInr(p.offer)}</strong></td><td>${formatInr(p.coupon)}</td>` : ""}</tr>`).join("")}</tbody></table></div><p class="fine">${active ? "Day promo: ₹35 → ₹28. Week promo: ₹99 → ₹85. Extra 10% off the other plans. Apply your code inside the app before paying securely through KraftAI and Razorpay. " : ""}Totals include applicable taxes. One-time payments; no auto-renewal. The higher prices are scheduled future prices, not previous sale prices.</p><a class="button" href="/app/">${active ? "Choose your offer" : "Choose your pass"} ↗</a></section>`;
}
export function renderLaunchOffer(html, now = Date.now()) {
  const active = offerActive(now);
  if (!active) {
    const replacements = Object.fromEntries(Object.values(OFFER_PRICES).map(p => [formatInr(p.offer), formatInr(p.regular)]));
    html = html.replace(/₹(?:1,499|799|399|99|49|35)(?![\d,.])/g, value => replacements[value] ?? value);
    html = html.replace(/"price":"(35|99|399|799|1499|49)"/g, (all, amount) => {
      const p = Object.values(OFFER_PRICES).find(p => p.offer === Number(amount) * 100);
      return p ? `"price":"${p.regular / 100}"` : all;
    }).replace(/₹6\.65/g, "₹9.50").replace(/₹4\.44/g, "₹6.34");
  }
  html = html.replace(/<div data-launch-offer>[\s\S]*?<\/div><!-- launch-offer-end -->/g, `<div data-launch-offer>${offerTable(now)}</div><!-- launch-offer-end -->`);
  for (const [id, p] of Object.entries(OFFER_PRICES)) {
    const price = currentPrice(id, now);
    html = html.replace(new RegExp(String.raw`<h3 data-offer-plan="${id}">[\s\S]*?<\/h3>`, "g"), `<h3 data-offer-plan="${id}">${active ? `<s class="offer-reference">${formatInr(p.regular)} from 1 Nov</s>` : ""}${formatInr(price)}<span>${id === "month" ? "total for 60 days" : id === "day" ? "total for 24 hours" : id === "lifetime" ? "pay once · no expiry" : id === "week" ? "total for 7 days" : id === "halfyear" ? "total for 180 days" : "messaging only · once"}</span>${active ? `<small class="offer-coupon">${formatInr(p.coupon)} with eligible promo</small>` : ""}</h3>`);
  }
  return html;
}
