# Monthly unlimited likes and Lifetime Plus — 23 October 2026

## Plans

| Plan | Price | Duration | Regular likes | Super Likes |
|---|---:|---|---|---|
| Free | ₹0 | — | 10/day | 1/day |
| Day | ₹29 | 24 hours | 100/day | 5/day |
| Week | ₹99 | 7 days | 100/day | 5/day |
| Month | ₹299 | 60 days with the current bonus-month offer | Unlimited during the monthly pass | 5/day |
| Lifetime Plus | ₹1,499 once | No scheduled expiry while the Plus service operates on this account | Unlimited | 5/day |

All Plus plans include messaging, liker reveals, priority likes and the age-gap filter. Lifetime is account-specific and never auto-renews. It starts immediately after verified payment, including when another pass is still running. Existing finite purchases remain recorded. Refunds/reversals revoke only their own entitlement source; deleting the account removes its access. Matching, blocks, bans, verification, privacy controls and abuse protection still apply. Native store products and their billing flows were not changed.

Existing paid monthly records gain unlimited likes on the next premium refresh without changing their dates or collecting money. Future queued monthly passes gain that benefit when their own period starts. The bonus month is included. Owner-confirmed monthly payment recoveries follow the covered order's plan. Complimentary 30-day gifts retain their existing allowance; they are separate from paid monthly purchases.

## Representation

- `webPassBenefits` recomputes access from server-owned Razorpay, CCAvenue, approved UPI, owner recovery, complimentary-month and lifetime-gift records. Lifetime is an explicit boolean, not a fabricated distant expiration.
- `billing/{uid}` caches `lifetime`, `unlimitedLikesUntil`, finite `expiresAt` and `checkedAt`. The existing ten-minute freshness requirement still applies to swipe benefits.
- Monthly and lifetime regular-like caps and remaining counts are `null` in the allowance/swipe API. The browser renders **Unlimited likes**. A finite large number is never substituted. Super Likes remain a separate daily allowance.
- Lifetime access returns `active: true`, `lifetime: true`, `expiresAt: null`. Native RevenueCat lifetime entitlements remain ignored; the new lifetime product is web-only.
- The server's chat mirror sets `unlimited: true` for either a separate active chat unlock or active Lifetime Plus, and exposes `premiumLifetime` as a descriptive field. Existing Firestore chat rules already understand permanent messaging access, so their read/expression budget and client permissions are unchanged. Recomputing after a lifetime refund preserves an independently purchased chat unlock.
- `lifetimePlusGrants/{uid}` is a private owner-gift source. Account deletion removes it and the lifetime checkout cache. Clients cannot read or write these records, billing snapshots or chat mirrors.

## Payment behavior

The authoritative web price is **149900 paise** in both `PLUS_PASSES` and KraftAI's `PAIRE_PLANS`. The existing `plus` callback/product family is reused; signatures, account ownership, server-to-server captured-payment reads, exact amount and INR checks still decide fulfillment. No client amount, expiry or lifetime flag is accepted.

Lifetime checkouts reuse one open order per account. A creating lock prevents concurrent order creation. Fulfillment serializes on the account ledger: simultaneous lifetime captures grant once, and redundant captured purchases are marked duplicate and refunded. Repeated deliveries do not refund again. An extra payment attempt on a paid order is recorded separately; refunding it does not revoke the original purchase. Refund failures remain recorded for support. An existing lifetime holder cannot open a new Plus or chat purchase. A stale chat checkout paid after lifetime activation is treated as redundant.

CCAvenue and moderator-approved UPI also understand explicit lifetime windows if their existing switches are enabled in the future. Direct UPI approval refuses an already-owned lifetime purchase and instructs the moderator to check/refund manually. This release does not enable a payment method or change runtime switches.

## Complimentary lifetime operation

For an explicitly owner-authorized gift:

```sh
node scripts/grant-lifetime-plus.mjs --project muse-352ba --email MEMBER_EMAIL \
  --reason 'Owner-authorized lifetime gift'
# Review the dry run, then repeat with --confirm.
```

The script uses the logged-in Firebase CLI credentials and requires an enabled member profile. It writes the gift, zero-value `lifetime-goodwill-grant` audit, billing cache and permanent chat mirror in one transaction, then reads back the result. Existing paid periods, payment records, separate chat purchases and moderation fields are preserved. A repeat of an already-active gift is a no-op. No charge, refund or email is sent, and the gift is not revenue. The owner's requested account is granted through this source, not an email hardcoded into application logic.

## Verification

- Full `./scripts/verify.sh`: **750 tests** (176 app, 7 website, 278 functions, 146 rules, 143 integration).
- Lifetime checks cover strict prices, pending/forged/wrong-owner payment attempts, duplicate captures, repeated webhooks, extra captured attempts, refunds, chargebacks, restoration of existing timed passes and persistent owner gifts.
- Real emulator swipe at **10,000 used likes** succeeds for monthly access and returns an unlimited remaining count. Expiry/refund restores finite limits. Super Like caps and blocked profiles remain enforced. Gift access adds no revenue and account deletion removes it.
- Browser acceptance at 320/390/1280px: monthly unlimited-like display and actual swipe, lifetime benefits without a purchase prompt or invalid expiry, visible footer, correct lifetime selection and a loopback-only checkout receiving `{plan: "lifetime"}`. No checkout response alone grants access.
- Static public audit: 53 sitemap pages passed metadata, canonical, JSON-LD, internal-link and trust-copy checks. Pricing cards include all four options. Homepage, pricing, comparisons, Terms, Refunds and AI-readable facts describe the new plans.
- Hosted checkout: six route/catalog tests, typecheck, scoped lint and production Next build passed. Muse app lint/typecheck/unit tests and production web build passed after final copy changes.
- All purchase and account QA used fictional members and isolated `demo-muse` emulators. The explicitly requested owner gift is an operational grant, not a production QA login. No real payment, refund, customer email or notification is used for testing.

## Release order

1. Deploy KraftAI checkout catalog first: counterpart commit `9ffd3f7`.
2. Deploy all handlers that recompute or consume shared premium/chat caches, so an old handler cannot erase a lifetime grant: `getPremiumStatus`, `revenueCatWebhook`, `createPlusOrder`, `confirmPlusPayment`, `razorpayWebhook`, `createChatUnlockOrder`, `confirmChatUnlock`, `getChatAccess`, `ccavenueResponse`, `confirmCcavenueOrder`, `createCcavenueOrder`, `createUpiUnlockOrder`, `getUpiReviewQueue`, `getUpiUnlockOrder`, `reviewUpiPayment`, `submitUpiPayment`, `deleteAccount`, `onAuthUserDeleted`, `getDailyAllowance`, `getDiscoverFeed`, `swipe`, `getLikesYou`, `adminGetMember`, `adminListMembers`, `adminPreviewPlusGrant`, `adminGrantPlusMonth`.
3. Push the website/browser app; verify Vercel and live public pricing/bundle.
4. Apply the authorized owner gift and verify its source/cache/mirror. Submit IndexNow and record the release in [web-changes.md](web-changes.md).

No rules/index migration or runtime flag change is needed. Real payment-provider acceptance and a real-phone purchase remain outside emulator QA; the existing checkout and signed-confirmation machinery are reused.

## Production release evidence

- Paire product source `1a4962a`, pushed to GitHub `main`. Vercel deployment `paire-iypn66i9f` (`dpl_HP1Hkgc2HTXBBFvLhK1Xozva52tD`) is Ready with `www.paire.in` assigned.
- KraftAI counterpart `9ffd3f7bdb28d576995ab18e31252c4f382c1346` is pushed to its `main`. The existing GitHub/Vercel integration reports “Deployment has completed” for `hritikchaudhary016-4858s-projects/myaiproductss/BPM4SUEFhyN3frajg9D84tgpx2tj`. The public KraftAI domain returns 200.
- All 26 named Firebase handlers were read back **ACTIVE**, updated on 23 October 2026. Google's build queue expired the first discovery build before it ran; retrying only `getDiscoverFeed` succeeded. Its new revision is `getdiscoverfeed-00016-taz`; account deletion is `deleteaccount-00016-zat`. No runtime flags, rules or indexes were changed.
- The explicitly requested owner lifetime gift was committed and read back: lifetime access, unlimited regular likes, permanent messaging, `expiresAt: null`, ₹0 charged and ₹0 revenue. The private audit and existing paid records remain separate. No user email is embedded in application entitlement logic.
- Read-only live checks passed for eight public paths, all advertised prices and lifetime terms, JSON-LD's ₹1,499 offer, monthly unlimited-like copy and the exported browser bundle (`index-3c33cdebb9c71188ad7a4eb4009f2ed1.js`). IndexNow accepted all 53 URLs with HTTP 200.
