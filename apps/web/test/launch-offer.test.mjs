import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAUNCH_OFFER, renderLaunchOffer, offerTable } from "../scripts/launch-offer.mjs";
const home = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
test("launch prices and explicit coupon examples render with real deadline", () => {
  const html = renderLaunchOffer(home, LAUNCH_OFFER.startsAt);
  assert.match(html, /₹49 from 1 Nov/);
  assert.match(html, /₹28 with eligible promo/);
  assert.match(html, /₹85/);
  assert.match(html, /31 October 2026, 11:59 pm IST/);
  assert.match(html, /first 250 accounts/);
});
test("expiry removes coupon marketing and updates card and schema prices", () => {
  const html = renderLaunchOffer(home, LAUNCH_OFFER.endsAt);
  assert.match(html, /promotion has ended/);
  assert.doesNotMatch(html, /with eligible promo/);
  assert.match(html, /"price":"49"/);
  assert.match(html, /"price":"570"/);
  assert.doesNotMatch(html, /"price":"35"/);
  assert.doesNotMatch(offerTable(LAUNCH_OFFER.endsAt), /<s>|With eligible promo/);
});
