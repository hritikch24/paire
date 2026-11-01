# Firebase cost controls — 2 November 2026

The owner requested the lowest practical Firebase spend after reporting about ₹600 over 15 days under Agent Platform Model Garden. Read-only inspection confirmed Gemini enabled on the deployed AI-related functions and 399 recorded Vertex API requests in the preceding 15 days. Requests are not a token/cost breakdown and can include failures. The Cloud Billing API was disabled, so the reported amount and its exact SKUs have not been independently reconciled.

## Code changes

- All paid LLM requests now require `MUSE_PAID_AI_ENABLED=true`. Missing, false or malformed values disable both Claude and Gemini, even with existing keys, the legacy Gemini switch or an explicit provider argument. The checked-in example and isolated QA environments explicitly use false; the existing git-ignored local deploy environment was set to false without changing any other field.
- Bios and icebreakers use their existing built-in generators. Matching preserves its existing rules ranking and skips the extra candidate-settings reads for model reranking. Chat safety retains its rules; optional paid second opinions stop.
- New Gemini selfie checks, including submission of previously started attempts, report unavailable before database/image/model work. No badge is granted or extended, existing approvals retain their original expiry/photo binding, and verification enforcement is unchanged. Didit configuration and cleanup remain independent. The browser explains that new checks are temporarily unavailable instead of promising an upcoming launch.
- Offer, likes, premium-status and verification queries stop on mounted background screens and hidden browser tabs. Native polling behavior is preserved. Visible member-offer refreshes change from once a minute to every five minutes; fixed expiry timers and explicit refresh after exhausted allowances remain. No-offer accounts stop interval polling. Likes interval polling changes from one to two minutes, and fresh focus navigation no longer forces a duplicate web fetch. Verification gates cache for five minutes and poll only when verification is required, a checker is available and the member is not verified. Web presence polling changes from every 30 seconds to a minimum of 60 seconds; online-expiry timers and hidden/unknown-state handling remain intact.

Core message listeners, payment confirmation/refunds, purchased access, safety rules, privacy cleanup, account deletion and scheduled settlement jobs are preserved. No billing account, sales/enforcement switch, API permission or production data was changed. These changes reduce this app's requests; they cannot stop unrelated clients or other projects using the billing account.

## Rollout

This is a local code change, not a deployment. The owner requested code changes; repository instructions require a separate deployment request. Existing production requests and charges continue until the new code is deployed.

Deploy all seven entry points that use or advertise the AI-backed features, together:

```sh
firebase deploy --project muse-352ba --only functions:suggestBio,functions:suggestOpeners,functions:getDiscoverFeed,functions:onMessageCreated,functions:startSelfieCheck,functions:submitSelfieCheck,functions:getVerificationStatus
```

Then publish the browser app through the existing Vercel flow. Keep `MUSE_PAID_AI_ENABLED=false` in the deploy environment. Confirm the deployed flag and public verification availability using read-only inspection, and watch the AI service's request trend and itemised billing report after reporting delay. Do not create a real purchase or customer login for QA.

A ₹50/month total cannot be guaranteed by these code changes: Firestore, image storage/downloads, function compute, scheduled jobs, build artifacts and other services have separate usage costs. Do not unlink billing or downgrade the project to Spark: that would interrupt the current backend. Provider-side spend controls and budgets need separate billing-console configuration; alerts alone do not stop charges, and stopping future requests does not erase accrued charges.

## Validation

Validation completed:

- App lint/typecheck and 279 unit tests; Functions lint/typecheck/build and 385 unit tests; 27 website and five script tests passed.
- The standard `./scripts/verify.sh` completed those checks, then encountered occupied emulator ports. An isolated demo-muse workspace on 35001/38080/39099/39199 passed all 155 security-rule tests. The full integration run passed 253/254 tests; an older admin test assumed its October-dated fixture was on the first page despite newer users from another suite. That test now follows actual pagination without changing production behavior. Its complete payment/admin suite passed all 47 tests on retest; the other 19 integration suites passed in the full run. Final Functions lint/typecheck passed after the fixture correction.
- The production web build passed. Local browser checks at 390/1280px passed for startup, page errors/overflow, paused-check copy and bundled visibility logic, with external requests blocked. No customer login, real order or payment was used.
- Regression tests confirm zero provider traffic despite legacy credentials and explicit provider requests, useful free suggestions, matching without extra AI reads, selfie submissions blocked before image/database/model work, hidden/background query suppression, native activity behavior and fixed offer expiry with reduced polling.

No production deployment, cloud billing configuration or API enablement was performed. QA workspaces contain only disabled provider secrets and fictional emulator accounts.
