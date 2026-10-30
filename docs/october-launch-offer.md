# October 30–31 web offer

Deployment authorized by the owner on 30 October 2026. KraftAI release `a6e16ab` is live; Pairé Firebase release `0d5562a` deployed successfully (six payment/quote functions and Firestore rules). Pairé website/browser deployment is in progress. KraftAI release is based on production `main` and preserves the newer Asterion site.

The promotion uses the existing Paire → KraftAI → Razorpay flow. No runtime sales switches or native/store products change. CCAvenue, direct UPI and gifts retain their existing catalog and checkout. Their buttons quote their own amounts; promo redemption uses Razorpay.

The lower public prices run from **30 October 2026 00:00 IST through 31 October 2026 23:59:59 IST**. From 1 November, new Razorpay quotes use the scheduled higher prices. Higher references are explicitly scheduled future prices, never claimed as historical sale prices. Existing orders and receipts retain their stored amounts and access.

| Plan | Scheduled from 1 Nov | 30–31 Oct | Eligible promo |
| --- | ---: | ---: | ---: |
| Day | ₹49 | ₹35 | ₹28 |
| Week | ₹150 | ₹99 | ₹85 |
| Monthly, 60 days including bonus | ₹570 | ₹399 | ₹359.10 |
| Six months, 180 days | ₹1,141.43 | ₹799 | ₹719.10 |
| Lifetime Plus | ₹2,141.43 | ₹1,499 | ₹1,349.10 |
| Unlimited Chat, once | ₹70 | ₹49 | ₹44.10 |

The day/week examples are the owner's explicit prices, rather than a uniform percentage. The remaining reference prices are the current offer divided by 0.70 and rounded to paise; their coupon prices are an extra 10% off. Lifetime retains its existing service/account terms.

Marketing codes: **PAIRE250**, **WELCOME250**, **DIWALI250**. Codes are case-insensitive and share **one 250-account pool**, rather than 250 per code. A member must have an Auth creation date within the campaign and no previous paid/approved/refunded/charged-back purchase. The base launch prices are available during the two dates; the additional promo is for new accounts' first purchase only.

An atomic transaction claims a slot when an eligible member actually opens a promo checkout. Applying a code only previews the quote. One immutable discounted order is reserved per account across all plans and aliases. Retrying reopens the same order. Concurrent requests cannot allocate a 251st slot or create a second coupon order for one account. Slots count claims, including abandoned checkouts, as the public terms state. Server-only claim and campaign documents cannot be read or written directly by clients.

The browser sends its displayed amount; the server refuses a changed quote. KraftAI accepts only exact catalog, historical or campaign coupon amounts with valid server-created order metadata. Both Paire confirmation and the signed webhook verify the captured payment against the stored order. Chat refunds use the original order amount, including the discount. No price query or browser action grants access.

A provider timeout keeps the claim in `creating` to prevent a duplicate purchase. Support must reconcile the provider and the Paire order records before repairing a stuck claim; never delete claims or lower the campaign count to bypass uncertainty. Previously issued coupon checkout links remain payable at their original amount after expiry; no new coupon order can be created then.

The campaign contract is byte-identical in functions, browser config and KraftAI (`launch-offer.ts`), with a parity test. The website's build and expiry script derive their contract from the byte-identical browser copy, which is included in Vercel uploads. The new KraftAI public counterpart is `/products/paire`; the retired `/paire` redirect is unchanged.

Rollout: deploy the matching KraftAI checkout and `/products/paire` first, then Paire's affected Firebase functions (`getLaunchOffer`, `createPlusOrder`, `createChatUnlockOrder`, `getChatAccess`, `confirmChatUnlock`, `razorpayWebhook` and any other functions importing the changed chat settlement helper), then the Paire browser/site build. Rules add explicit denial for campaign documents. Keep sales switches as they are. No live payment or production-account QA is needed to deploy this code.

Validation completed locally:

- App lint/typecheck and 270 unit checks passed; Functions lint/typecheck/build and 373 unit checks passed.
- Website/script checks: 31 passed. Security rules: 155 passed in an isolated emulator workspace.
- The full 240-case payment/application integration run identified a chat verifier that still required ₹49; that was fixed. The affected payment and campaign suites were then rerun on the final code: 52 passed, including all six coupon plans, real entitlement settlement against a fake Razorpay test API, discounted duplicate refunds, invalid claims, retries, expiry, and concurrent 250-account enforcement. The other 188 integration cases passed in the full run.
- KraftAI checkout validation: 7 passed, including legacy/gift regression coverage, exact coupon notes and rejection of tampered prices. KraftAI production build and the Paire website/browser export passed.
- Browser checks passed at 390px and 1280px on both public pricing pages, with no page errors or document overflow. An already-open Paire tab switched to regular prices at the deadline. Local screenshots: `/tmp/paire-offer-390.png`, `/tmp/paire-offer-1280.png`, `/tmp/kraftai-paire-offer-390.png`, `/tmp/kraftai-paire-offer-1280.png`.
- `./scripts/verify.sh` completed its app/site/functions checks but its standard emulator ports were occupied by an unrelated running workspace. Rules and integration checks ran separately on isolated ports 24400/25001/28080/29099/29199, without disturbing that workspace. No live account login, payment, deployment, push, email or runtime-switch change occurred.

Deployment preparation corrected the website contract loader to read the browser copy under `apps/muse-mobile`, because Vercel intentionally excludes `firebase/`. Website checks passed after this packaging correction. Existing sales flag values were compared with production before the Firebase rollout and are unchanged.
