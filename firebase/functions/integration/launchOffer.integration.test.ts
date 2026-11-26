import { db } from "../src/admin";
import { promoCheckout } from "../src/launchOffer";
import { LAUNCH_OFFER } from "../src/lib/launch-offer";

test("concurrent retired-code attempts preserve historical claims and never call the payment provider", async () => {
  const member = "old_offer_qa_" + Date.now();
  const ref = db.doc(`launchOfferClaims/${member}`);
  const original = { plan:"day", code:"PAIRE250", state:"open",result:{orderId:"order_PREVIOUS01",amount:2800} };
  await ref.set(original);
  const create = jest.fn(async()=>({}));
  const outcomes=await Promise.allSettled(LAUNCH_OFFER.codes.map(code=>promoCheckout(member,"day",code,create)));
  expect(outcomes.every(outcome=>outcome.status==="rejected")).toBe(true);
  expect(create).not.toHaveBeenCalled();
  expect((await ref.get()).data()).toEqual(original);
});
