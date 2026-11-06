import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../muse-mobile/package.json", import.meta.url));
const ts = require("typescript");
const source = readFileSync(new URL("../../muse-mobile/src/config/launch-offer.ts", import.meta.url), "utf8");
const memberSource = readFileSync(new URL("../../muse-mobile/src/config/member-offer.ts", import.meta.url), "utf8");
export const memberModule = ts.transpileModule(memberSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replace('"./launch-offer"', '"/launch-offer-contract.js"');
export const offerModule = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { LAUNCH_OFFER, OFFER_PRICES, currentPrice, formatInr, offerActive } = await import(`data:text/javascript;base64,${Buffer.from(offerModule).toString("base64")}`);
export { LAUNCH_OFFER, OFFER_PRICES, currentPrice, formatInr, offerActive };
const staticMemberModule = ts.transpileModule(memberSource.replace('import { OFFER_PRICES } from "./launch-offer";', `const OFFER_PRICES = ${JSON.stringify(OFFER_PRICES)};`), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { MEMBER_OFFER, memberPrice } = await import(`data:text/javascript;base64,${Buffer.from(staticMemberModule).toString("base64")}`);
function memberTable(compact = false) {
  if (compact) return `<section class="member-offer-strip" aria-label="Plus member offers"><strong>Your Plus offer · 50% off</strong><p>Annual ${formatInr(memberPrice("year",50))} · Lifetime ${formatInr(memberPrice("lifetime",50))} for eligible members.</p><small>One seven-day offer from first eligibility. <a href="/pricing/">Eligibility &amp; offer terms ↗</a></small></section>`;
  return `<section class="launch-offer member-price-offer" aria-label="Plus member offers"><p class="eyebrow">YOUR PLUS OFFER · 50% OFF</p><h2>Your next hello.<br>Your Plus offer.</h2><p>A full year of possibility. Or all the time you need. Eligible members without active Plus get 50% off Monthly, Annual and Lifetime Plus. No code needed.</p>${compact ? "" : `<div class="offer-table-wrap"><table><thead><tr><th>Plan</th><th>Regular total</th><th>Member total · 50% off</th></tr></thead><tbody>${["year", "lifetime", "month"].map(id => `<tr><th>${id === "year" ? "Annual · 365 days" : id === "month" ? "Monthly · 60 days" : "Lifetime Plus"}</th><td>${formatInr(OFFER_PRICES[id].regular)}</td><td><strong>${formatInr(memberPrice(id,50))}</strong></td></tr>`).join("")}</tbody></table></div>`}<p class="fine">For eligible members without active Plus. Your seven-day deadline starts at first eligibility and never resets on another visit. Existing unexpired offers move to 50% without extending their deadline; expired offers stay expired. No code needed; offers do not stack. City and hobby details personalize wording, not the price. All totals include taxes. No auto-renewal or guaranteed matches.</p>${compact ? "" : `<a class="button" href="/app/">See my offer ↗</a>`}</section>`;
}
export function offerTable(now = Date.now()) {
  if (now >= MEMBER_OFFER.startsAt) return memberTable();
  const active = offerActive(now);
  const labels = { day: "1 day", week: "1 week", month: "Monthly · 60 days", halfyear: "6 months", year: "Annual · 365 days", lifetime: "Lifetime Plus", chat: "Unlimited Chat · once" };
  return `<section class="launch-offer" aria-label="October pricing offer"><p class="eyebrow">${active ? "30–31 OCTOBER ONLY" : "CURRENT PRICES"}</p><h2>${active ? "A first hello.<br>A little less." : "Choose your pass."}</h2><p>${active ? `These launch prices end ${LAUNCH_OFFER.endLabel}. New members joining on 30–31 October can apply a marketing code on their first purchase. Limited to the first 250 accounts to claim a code, shared across all codes.` : "The 30–31 October promotion has ended. Previously issued orders keep their original quote."}</p><div class="offer-table-wrap"><table><thead><tr><th>Plan</th><th>From 1 November</th>${active ? "<th>30–31 Oct offer</th><th>With eligible promo</th>" : ""}</tr></thead><tbody>${Object.entries(OFFER_PRICES).map(([id, p]) => `<tr><th>${labels[id]}</th><td>${active ? `<s>${formatInr(p.regular)}</s>` : formatInr(p.regular)}</td>${active ? `<td><strong>${formatInr(p.offer)}</strong></td><td>${formatInr(p.coupon)}</td>` : ""}</tr>`).join("")}</tbody></table></div><p class="fine">${active ? "Day promo: ₹35 → ₹28. Week promo: ₹99 → ₹85. Extra 10% off the other plans. Apply your code inside the app before paying securely through KraftAI and Razorpay. " : ""}Totals include applicable taxes. One-time payments; no auto-renewal. The higher prices are scheduled future prices, not previous sale prices.</p><a class="button" href="/app/">${active ? "Choose your offer" : "Choose your pass"} ↗</a></section>`;
}
export function renderLaunchOffer(html, now = Date.now()) {
  const active = offerActive(now);
  if (!active) {
    const replacements = Object.fromEntries(Object.values(OFFER_PRICES).map(p => [formatInr(p.offer), formatInr(p.regular)]));
    html = html.replace(/₹(?:1,499|799|399|99|49|35)(?![\d,.])/g, value => replacements[value] ?? value);
    html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (script, source) => {
      const graph = JSON.parse(source);
      const visit = node => {
        if (!node || typeof node !== "object") return;
        if (node["@type"] === "Offer" && node.priceCurrency === "INR" && node.name !== "Free") {
          const name = node.name ?? "";
          const id = /365|Annual/.test(name) ? "year" : /Lifetime/.test(name) ? "lifetime" : /180|6 months/.test(name) ? "halfyear" : /60 days|1 month/.test(name) ? "month" : /7 days/.test(name) ? "week" : /1 day/.test(name) ? "day" : /Chat/.test(name) ? "chat" : null;
          if (id) node.price = String(currentPrice(id, now) / 100);
        }
        Object.values(node).forEach(visit);
      };
      visit(graph);
      return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
    }).replace(/₹6\.65/g, "₹9.50").replace(/₹4\.44/g, "₹6.34");
  }
  html = html.replace(/<div data-launch-offer>[\s\S]*?<\/div><!-- launch-offer-end -->/g, `<div data-launch-offer>${now >= MEMBER_OFFER.startsAt && html.includes("primary-price-grid") ? memberTable(true) : offerTable(now)}</div><!-- launch-offer-end -->`);
  for (const [id, p] of Object.entries(OFFER_PRICES)) {
    const member = now >= MEMBER_OFFER.startsAt && MEMBER_OFFER.plans.includes(id);
    const price = member ? memberPrice(id, MEMBER_OFFER.minimumDiscount) : currentPrice(id, now);
    html = html.replace(new RegExp(String.raw`<h3 data-offer-plan="${id}">[\s\S]*?<\/h3>`, "g"), `<h3 data-offer-plan="${id}">${active || member ? `<s class="offer-reference">${formatInr(p.regular)} regular</s>` : ""}${formatInr(price)}<span>${id === "month" ? "total for 60 days" : id === "day" ? "total for 24 hours" : id === "lifetime" ? "pay once · no expiry" : id === "week" ? "total for 7 days" : id === "halfyear" ? "total for 180 days" : id === "year" ? "total for 365 days" : "messaging only · once"}</span>${member ? `<small class="offer-coupon">50% off for eligible members · checked in-app</small>` : active ? `<small class="offer-coupon">${formatInr(p.coupon)} with eligible promo</small>` : ""}</h3>`);
  }
  return html;
}
