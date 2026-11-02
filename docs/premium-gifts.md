# Premium gifts — web release, 2 November 2026

Owner approved completing premium-only gifting. The release is isolated from the earlier local travel, reminder-like and safety-review feature branch. No native files or billing were changed. Commits/pushes use `hritikch24` only. See `web-changes.md` for actual deployment/activation receipts.

## Product contract

- Adults in an active, unblocked one-to-one match can give or ask for Paire Plus. Both genders use the same flow. Existing account, cohort, email and configured photo-verification checks apply at order creation, capture and acceptance.
- Gifts are **Plus passes only**: **1 day ₹35; 7 days ₹99; monthly 60 days ₹399**, taxes included. No cash, items, transfer, cash-out, chat-only unlock, half-year or Lifetime gift. Gift prices are a separate fixed catalogue and do not stack with coupons/member offers.
- A request is free and creates no order. Members can say no, withdraw, ignore or disable requests. At most three new requests/day and one request to the same person every seven days, including after refusal. First-move controls still apply. Selecting a requested plan opens price review, then a separate explicit checkout action is required.
- Payment opens on KraftAI, then Razorpay. The recipient is taken from the match, not supplied by the buyer. No recipient name, chat, match ID or login is sent to the payment provider. Captured gifts wait for the recipient to accept; no Plus is granted before that consent. At most three paid gifts/sender/UTC day, enforced transactionally even for simultaneous captures.
- Unaccepted gifts expire after seven days. Decline, expiry or inability to deliver creates a refund obligation to the sender's original payment method. It does not create cash value for the recipient. No gift buys a reply, meeting, sex or company.

## Entitlements and refunds

New accepted gifts use independent duration credits in private `webPassLedger/{uid}.premiumQueue`. Existing active authoritative purchased/granted rights are imported once, preserving remaining time without copying cached expiry into a gift. Ambiguous overlapping legacy paid windows or unreconciled old gifts fail closed for support review. Live read-only preflight found no claimed/pending gifts before this launch; no member entitlement was changed by the preflight.

Gift acceptance, later web purchases, owner complimentary months, and their reversals update the same ledger transaction. A refund removes only that source's unused time. Elapsed service stays elapsed; other unused purchased/gifted days move forward. Monthly gifts include the same monthly unlimited-like benefits. Source dates shown to the recipient are derived from the current queue; completed gift dates are archived back to the private order as the queue compacts. Lifetime access remains an explicit, separate entitlement. Current web behavior for members who have never accepted a gift is preserved. Native billing remains paused and is outside this release's QA scope.

Billing source reads and cache writes now share a transaction, so a slow refresh cannot restore refunded access. Razorpay, earlier CCAvenue and reviewed UPI paths preserve the queue. Complimentary grants use their own credits once the queue is active. Account deletion removes non-financial requests and premium access, while financial orders/refund obligations remain available for accounting and refunds.

Each payment has one server-only `giftRefundJobs` record, a lease/backoff, and a stable provider `X-Refund-Idempotency` key/receipt/body. Failed calls and lost responses remain due; extra-payment and capture crash windows are swept. Submitted refunds are reconciled at most daily; provider `refund.failed` or a partial/ambiguous result is marked `needs_review`, not reported as a completed refund. The UI distinguishes pending, requested, processed and support-required states. Bank completion can take additional time. No real payments or production-member logins were used for QA.

The existing signed `razorpayWebhook` now dispatches gifts too. `razorpayGiftWebhook` remains compatible. KraftAI `/pay/notify` validates the original raw-body HMAC locally and forwards unchanged bytes/signature to the fixed payment backend; it requires `PAIRE_RAZORPAY_WEBHOOK_SECRET`, matching the active Paire webhook secret. It never grants access or accepts a client-selected upstream. The current provider webhook remains configured; a second provider webhook is not required for gift delivery. The optional KraftAI relay is fail-closed until its dedicated secret is configured in KraftAI’s separate hosting account; it is not used by the existing production webhook or checkout return flow. Do not point the provider at that optional endpoint while it returns 503.

## Cost and operations

No new paid AI/model, location lookup or interval polling. Gift lists cache for five minutes, cap at 60 checks/day and read bounded recent history. An oldest-pending page prevents long histories from hiding unaccepted paid gifts. The three gift-list indexes must be READY before enabling sales. Refund/expiry recovery uses the existing daily scheduler and bounded pages.

Review server-only `giftRefundJobs` with `status=needs_review` and the private gift order when support receives a refund concern. Verify the provider result/payment total before issuing another refund; never create another refund merely because a response was lost. Stable jobs/keys reconcile uncertain attempts. Do not edit aggregate billing expiry or the premium queue by hand; use the queue-aware owner grant and payment/reversal paths. Financial records are retained after account deletion under the privacy notice.

## Verification

- App lint/TypeScript and 291 unit tests passed; Functions lint/TypeScript, build and 393 unit tests passed.
- Firestore/Storage rules: 157 tests passed. Full isolated API suite: 270 tests / 21 suites passed, including original purchase/chat/recovery/lifetime flows, request privacy/refusal/deletion, eligibility changes, concurrent captures, both refund orders, source preservation, failure/lost-response retries, bank reconciliation and pending gifts behind a long history.
- Website/scripts: 36 tests passed. Both production builds passed. Fixed verification-script emulator ports were occupied; equivalent rule/API stages used a private demo workspace with disabled provider secrets on alternate ports.
- KraftAI: 11 checkout tests, TypeScript and targeted lint passed. Local builds used Webpack because this isolated worktree's symlinked dependencies are outside Turbopack's filesystem root. The release preserves newer unrelated `origin/main` changes.
- Browser acceptance at 390/1280px passed: request plan selection sends no payment, explicit plan purchase reaches local KraftAI with the exact amount and gift callback kind, cash/unsupported plans are refused, refund wording is accurate, and no external SDK requests/charges or horizontal overflow occurred. Temporary harness removed before release.
- Read-only production checks confirmed billing on, gift sales off before rollout, matching current checkout host, a working primary webhook and zero minimum instances. Provider credential and deployment/flag receipts are recorded separately before activation.

References: [Razorpay refund idempotency](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md), [refund webhook events](https://github.com/razorpay/markdown-docs/blob/master/webhooks/refunds.md). Source contracts use integer paise and signed server verification throughout.
