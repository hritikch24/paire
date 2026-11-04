# Firebase backend deployment — 4 November 2026

Owner requested deployment of the existing signup test-like code, then an owner-authorized 1+1 monthly Plus grant and a local unpublished-code inventory. No product source was changed for this deployment.

## Source and checks

- Deployed GitHub `main` at `4a925f02e1927c3e0708e5808a24d06cdb606c57`; feature `e67aa72`, composite index `4a925f0`.
- The original local `main` had one documentation-only commit, `0cfb676`. It is preserved as `backup/main-before-testlike-20261104`. A fresh local `main` tracks GitHub exactly before this receipt commit. Other feature branches, the stash and unrelated untracked files were preserved.
- Ran `npm ci`, lint, typecheck and the full Functions unit suite. All **397 tests / 46 suites passed**, including `launchOffer` and `memberOffer`; the anticipated failures did not occur on this run. Local Node is 25; deployed runtime is Node.js 22. The Firebase predeploy build passed.

## Deployment and live readback

1. `firebase deploy --only firestore --project muse-352ba --non-interactive` succeeded. Rules compiled and were released.
2. Waited for `testLikeJobs(status ASC, dueAt ASC, __name__ ASC)` index `CICAgLiIjZIK` to become **READY**, confirmed through the Firestore Admin API, before starting Functions deployment.
3. `firebase deploy --only functions:onTestSignupCompleted,functions:sendDueTestLikes,functions:adminGetSignupFunnel --project muse-352ba --non-interactive` succeeded. No other function or website was deployed.

All three functions were read back **ACTIVE**, Node.js 22, minimum instances **0**, updated at 15:54 UTC on 4 November. The scheduler `firebase-schedule-sendDueTestLikes-us-central1` is enabled with `every 1 minutes`. The application switch remains **off**: `runtime/testLike` does not exist, so its parser defaults to disabled. No test signup, queue job, like, push or email was created by this deployment. The configured sender account exists and is enabled. No payment, gifting, verification or paid-AI switch was changed.

To run the test later, supply an actual throwaway signup email, put it in the allowlist before onboarding completes and explicitly enable the document described in `signup-test-like.md`. Owner UI: `https://www.paire.in/app/?admin=signup-funnel`. Delivery timing was not exercised against production members.

## Owner Plus grant

The supplied numeric ID and proposed email did not identify an account. A name search found a candidate and the owner explicitly confirmed its actual login email before the write. Customer identifiers remain in the private Firebase audit, not this repository.

After deployment, a deterministic, idempotent zero-value `goodwill-grant` audit and independent monthly duration credit added **60 days** to that member. Existing purchased access through **2 January 2027** was preserved; the resulting expiry is **3 March 2027, 21:17 IST**. Authoritative source accounting, the billing cache and the chat-access mirror were updated consistently and read back. A normal `syncPremium` refresh confirmed active Plus and unlimited regular likes. No payment, order or revenue was recorded. Other members were not changed.

## Local work not pushed

Inventory checked against freshly fetched remote refs on 4 November. These branches have overlapping history, so their entire file diffs are not independent new releases.

| Branch / commit | Local work | Status |
|---|---|---|
| `feat/together-safety-gift-requests`: `4cac8ca`, logs `0ffb24b`, `7a2c507`, `26f8b25` | Public outing suggestions and Luventra link, sent-likes history with seven-day reminder cooldown, respectful-like prompt, automated flags and moderator review, related plain-English policies | Those travel/reminder/safety features are not on `origin/main`. Premium gifting from the same branch was separately shipped in `9191064` / `3096a13`; it is already published and must not be treated as pending. |
| Companion `/Users/hritik/Projects/travel-partner`, branch `feat/paire-public-outings`: `dd6b0f7`, `86c3502` | Luventra `/paire` city outing pilot, privacy and policy changes | Local only; neither commit is on that repository's `origin/main`. No companion deployment in this task. |
| `paire-optional-phone`: `3482716`, `26eb016`, log `598c025` | Optional private phone field during browser signup and in Settings; email-change verification action and browser continue links; rules/tests | Not pushed or deployed according to its branch receipt; absent from current `main`. |
| `paire-chat-safety`: `3dce601`, log `75935c2` | Dangerous-content rules/trigger checks, generated rules patterns, web rejection message and tests | Not pushed to GitHub. Its historical receipt records a targeted backend/rules deployment on 28 October; current presence of that older deployment was not audited here. This task deployed current `main` rules, so the historical receipt is not evidence that its rules remain live. |
| `seo/claude-seo-2026-10-29`: `8898d31`, log `f2829f7` | SEO titles/descriptions in `apps/web/content/core.mjs` and `compare.mjs` | Local variant differs from current `main`. Some related SEO changes were published separately; review the individual intended metadata edits, not the stale branch as a whole. |
| `owner-match-notice` / `load-test-likes`: `61a184c`, `32ab7f3` | One-off owner notification function and historical deployment record | Not pushed. Receipt says it was used once and then deleted from Firebase on 29 October; not an active feature to publish. |
| `release/premium-gifts-20261102`: `fb37574`; `backup/main-before-testlike-20261104`: `0cfb676` | Completed deployment receipts for gifting and cost/device-photo changes | Documentation-only local commits. The underlying gift and device-check product code is already on `main`. |
| Older `feat/accept-and-sponsor` and checkout/launch branches | Earlier implementations, plans and receipts | Historical branches largely superseded by later production releases; do not count every old commit as a missing live feature. `paire-web-launch` and `feat/kraftai-hosted-checkout` have no commits ahead of current `origin/main`. |
| `stash@{0}` | Preserved SEO working copy from `load-test-likes` | Left untouched. |
| Untracked `.claude/`, marketing/handoff documents and `scripts/load-test-likes/` | Agent configuration/worktrees, outreach drafts/data and local emulator load-test helpers | Preserved, not staged, pushed or deployed. |

This receipt and its `web-changes.md` entry are committed locally as `hritikch24`; no push was performed, so no additional Vercel deployment is triggered.
