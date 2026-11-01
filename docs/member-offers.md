# Monthly and Lifetime member offers

Owner requested usage-based discounts of 30–50% on 1 November 2026, with Monthly and Lifetime Plus featured first. Implementation and verification are complete. Rollout is in progress.

Eligible members without active Plus receive one seven-day offer when first viewing Discovery or Plus. The offer starts at 30%, increases to 40% when either free likes or Super Likes are exhausted or when likes/Super Likes were used on three of the last seven UTC days, and reaches 50% when both free allowances are exhausted on a day. Earned savings persist after the daily reset, while the original expiry never resets or extends. Expired offers do not automatically respawn. Existing active/lifetime holders receive no new sales offer.

| Plan | Regular | 30% | 40% | 50% |
| --- | ---: | ---: | ---: | ---: |
| Monthly, 60 days including the bonus | ₹570 | ₹399 | ₹342 | ₹285 |
| Lifetime Plus | ₹2,141.43 | ₹1,499 | ₹1,284.86 | ₹1,070.72 |

All amounts use integer paise. These offers use the existing Paire → KraftAI → Razorpay flow; CCAvenue, direct UPI, gifts and native/store billing retain their existing prices and behavior. No promo code is required and discounts do not stack. Existing orders retain their quoted amounts and access after an offer expires.

A server-owned `memberOffers/{uid}` record stores the offer UUID, reason, earned tier and fixed dates. Actual server usage documents determine upgrades. City and an allowlisted, self-selected non-sensitive hobby personalize wording only; neither affects price. The UI makes no exclusive regional discount, fake popularity, guaranteed match or resetting-countdown claim. Discovery's card is dismissible, a newly earned tier can appear once, and opening Plus or selecting a plan never starts payment. Reading messages and safety controls stay free.

`getLaunchOffer` provides authoritative prices; `createPlusOrder` recomputes eligibility and rejects a price differing from the amount the member saw. Razorpay notes record the campaign, offer UUID, tier and dates, with no account UID. KraftAI independently validates exact supported amounts, allowed tiers, UUID format and original order creation time within the fixed offer window. Client-supplied percentages, interests or city cannot set a price. Existing entitlement, confirmation and refund paths continue to use the original recorded payment amount.

Rollout after tests: matching KraftAI public pricing and hosted validation first, then `getLaunchOffer`, `createPlusOrder` and the explicit member-offer Firestore deny rule, then the Paire browser/website. Keep existing billing and sales switches unchanged. Verification uses only fictional accounts and isolated emulators, with no real purchases or customer logins.

The KraftAI release preserves the current production Asterion changes. A pre-existing Next.js build error was also repaired by moving the shared niche metrics dashboard out of `page.tsx` and updating its five existing imports; route behavior and dashboard code are preserved.

Validation completed:

- App lint/typecheck and 274 unit tests; Functions lint/typecheck/build and 378 unit tests; 32 website/script tests; 155 rule tests; eight KraftAI checkout tests; both production builds passed.
- The full integration pass found an older forged-order fixture missing the newly modeled Razorpay timestamp and an assertion still expecting October's ₹49 chat quote. Both fixtures were corrected. The three affected integration suites passed 71 tests, including all earned tiers, fixed expiry, one offer under concurrency, inactive/paid/lifetime exclusions, immutable quotes and actual entitlement activation against the fake test-mode provider. The other integration suites passed in the full run.
- Public pages passed local 320/390/1280px checks for tier amounts, Monthly/Lifetime-first layout and absence of page errors or document overflow. Component tests cover dismissal, earned upgrades, expiry, real city/hobby context, explicit purchase and exact discounted amount sent to checkout.
- Standard verification emulator ports were occupied; security and integration checks used the isolated demo-muse workspace on 35001/38080/39099/39199. A transient disk-space failure was resolved by removing generated build output/cache from this work. No customer accounts, payments or live state were used for QA.
