import { readFileSync } from "fs";
import { resolve } from "path";
import { currentPrice, LAUNCH_OFFER, OFFER_PRICES, offerActive, normalizePromo, validPromo } from "../src/lib/launch-offer";

test("campaign boundaries use India dates, with no reset or rolling countdown", () => {
  expect(offerActive(LAUNCH_OFFER.startsAt - 1)).toBe(false);
  expect(offerActive(LAUNCH_OFFER.startsAt)).toBe(true);
  expect(offerActive(LAUNCH_OFFER.endsAt - 1)).toBe(true);
  expect(offerActive(LAUNCH_OFFER.endsAt)).toBe(false);
  expect(LAUNCH_OFFER.endsAt - LAUNCH_OFFER.startsAt).toBe(2 * 86400000);
  for (const id of Object.keys(OFFER_PRICES) as (keyof typeof OFFER_PRICES)[]) {
    expect(currentPrice(id, LAUNCH_OFFER.startsAt)).toBe(OFFER_PRICES[id].offer);
    expect(currentPrice(id, LAUNCH_OFFER.endsAt)).toBe(OFFER_PRICES[id].regular);
  }
});
test("exact owner examples and extra ten percent for the remaining plans", () => {
  expect(OFFER_PRICES.day).toEqual({ regular: 4900, offer: 3500, coupon: 2800 });
  expect(OFFER_PRICES.week).toEqual({ regular: 15000, offer: 9900, coupon: 8500 });
  for (const id of ["month", "halfyear", "lifetime", "chat"] as const) expect(OFFER_PRICES[id].coupon).toBe(Math.round(OFFER_PRICES[id].offer * 0.9));
  expect(validPromo(normalizePromo(" paire250 "))).toBe(true);
  for (const code of ["", "__proto__", "FREE", "PAIRE251"]) expect(validPromo(code)).toBe(false);
});
test("browser and checkout contract stay byte-identical to the server", () => {
  const here = readFileSync(resolve(__dirname, "../src/lib/launch-offer.ts"), "utf8");
  expect(readFileSync(resolve(__dirname, "../../../apps/muse-mobile/src/config/launch-offer.ts"), "utf8")).toBe(here);
  expect(readFileSync(resolve(__dirname, "../../../../kanoon-simplified/src/lib/launch-offer.ts"), "utf8")).toBe(here);
});
