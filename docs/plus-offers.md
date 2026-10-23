# Web offers — 24 October 2026

The owner's requested priority is **₹399, ₹20, ₹1,499**. Total prices lead on the homepage and browser Plus screen. The monthly offer is initially selected; selecting a card never starts a payment. Existing lifetime owners see their included benefits without another sales offer.

| Option | Total paid | Access | Regular likes | Messaging |
| --- | --- | --- | --- | --- |
| Monthly offer | ₹399 | 30 paid + 30 bonus days | Unlimited during its period | Included during its period |
| Day | ₹20 | 24 hours | 100/day | Included during its period |
| Lifetime Plus | ₹1,499 | No scheduled expiry on this account while the Plus service operates | Unlimited | Included |
| Week, secondary | ₹99 | 7 days | 100/day | Included during its period |
| Six months, secondary | ₹799 | 180 days | Unlimited during its period | Included during its period |
| Unlimited Chat, separate | ₹49 once | No expiry on the account | Existing discovery allowance unchanged | All current/future mutual matches |

All Plus options include 5 Super Likes/day, liker reveals, priority likes and the age-gap filter. Safety and privacy controls remain free. No auto-renewal, fabricated popularity, guaranteed matches or artificial countdown. The day/week cap is distinct from unlimited regular likes on the monthly/six-month/lifetime plans. A complimentary 30-day gift retains its existing allowance. Native/store products are unchanged.

Secondary durations are collapsed under “More options”; the public homepage explains messaging-only there too. The Plus screen offers the existing messaging-only checkout using the server's real status, eligibility and payment methods. Before a first mutual match it explains availability without a checkout button. Existing owners, pending payments and verification requirements keep their existing paths. No new payment family, runtime switch or scheduled upsell was added.

## Product research and decision

Reviewed the official [Tinder subscription comparison](https://tinder.com/feature/subscription-tiers) and [Tinder help](https://www.help.tinder.com/hc/en-us/articles/115004487406-Tinder-subscriptions), plus Bumble's official [People tab guide](https://support.bumble.com/hc/articles/28423154479645-Using-the-People-tab). These describe subscriptions that distinguish benefits such as unlimited likes and liker visibility. They support comparing actual entitlements rather than showing unexplained prices. Their local/personalised prices are not used as a reference price or savings claim.

Our product decision is to offer a low upfront trial, a medium-duration unlimited-like offer, permanent Plus, and a lower-cost messaging-only alternative. The additional six-month option provides a lower daily cost without requiring lifetime access. This is a product hypothesis, not a conversion result or a claim of novelty. Paid visibility boosts and unimplemented add-ons were not added: the current product cannot promise useful extra exposure in a sparse audience.

## Pricing and compatibility

New server orders: day 2000, week 9900, month 39900, `halfyear` 79900, lifetime 149900, chat 4900 paise. Browser catalog, public copy/structured data, backend catalog and KraftAI checkout must agree. Old server-created ₹29 day and ₹299 monthly orders remain payable at exactly their stored quotes. Previously purchased time is never repriced. Finite passes still queue, while unlimited-like benefits start with their own active period. Refund/revocation removes only its own source. Legacy direct-UPI orders retain their exact QR reconciliation amount.

Deploy the counterpart in `kanoon-simplified` through its existing GitHub integration first; its live Vercel project belongs to `hritikchaudhary016-4858s-projects/myaiproductss`, not Paire's Team-Rockstar account. Then deploy all Firebase entitlement writers/readers and push Paire main for the existing Vercel integration. No customer payments or production account logins are part of QA.

Validation and deployment evidence are recorded in `docs/web-changes.md`.
