import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAUNCH_OFFER, renderLaunchOffer, offerTable } from "../scripts/launch-offer.mjs";
const home = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
test("launch prices and explicit coupon examples render with real deadline", () => {
  const html = renderLaunchOffer(home, LAUNCH_OFFER.startsAt);
  assert.match(html, /₹49 regular/);
  assert.match(html, /₹28 with eligible promo/);
  assert.match(html, /₹85/);
  assert.match(html, /31 October 2026, 11:59 pm IST/);
  assert.match(html, /first 250 accounts/);
});
test("October expiry introduces the member program without reviving old codes", () => {
  const html = renderLaunchOffer(home, LAUNCH_OFFER.endsAt);
  assert.match(html, /Your Plus offer/);
  assert.doesNotMatch(html, /with eligible promo/);
  assert.match(html, /"price":"49"/);
  assert.match(html, /"price":"570"/);
  assert.doesNotMatch(html, /"price":"35"/);
  assert.doesNotMatch(offerTable(LAUNCH_OFFER.endsAt), /<s>|With eligible promo/);
});

test("public offers describe qualification and show all three exact tiers",()=>{
 const html=renderLaunchOffer(home,LAUNCH_OFFER.endsAt+1000);
 assert.match(html,/₹285/);assert.match(html,/₹1,070.72/);assert.match(html,/seven-day deadline/);assert.match(html,/City and hobby details personalize wording, not the price/);
 assert.doesNotMatch(html,/PAIRE250|first 250 accounts|30–31 OCTOBER ONLY/);
});
