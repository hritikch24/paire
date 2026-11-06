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

test("public offers show exact annual and lifetime savings and eligibility",()=>{
 const html=renderLaunchOffer(home,LAUNCH_OFFER.endsAt+1000);
 assert.match(html,/₹285/);assert.match(html,/₹1,070.72/);assert.match(html,/seven-day offer/);assert.match(offerTable(LAUNCH_OFFER.endsAt),/City and hobby details personalize wording, not the price/);
 assert.doesNotMatch(html,/PAIRE250|first 250 accounts|30–31 OCTOBER ONLY/);
});

test("annual and lifetime schema retain their own prices despite sharing old catalog amounts",()=>{
 const html=renderLaunchOffer(home,Date.parse("2026-11-06T12:00:00+05:30"));
 const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 const offers=graph.find(item=>item["@type"]==="WebApplication").offers;
 assert.equal(offers.find(item=>item.name.includes("Annual")).price,"1499");
 assert.equal(offers.find(item=>item.name.includes("Lifetime")).price,"2141.43");
 assert.match(html,/₹749.50/);assert.match(html,/50% off for eligible members/);
 assert.doesNotMatch(html,/30% off|Use all your free likes/);
});
