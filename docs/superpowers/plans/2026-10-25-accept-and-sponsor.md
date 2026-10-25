# Accept likes, man pays to message, sponsorship: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let women accept likes for free, make the man's premium the key to messaging (women reply free), and let either match partner gift the other an existing Plus pass, all behind switches that stay off and **without changing the existing Razorpay setup**.

**Architecture:** Extend the paid-chat model (`lib/chatAccess.ts` policy, the `maySend` rules, the `moderation.chatAccess` mirror) with a gender-derived `freeSender` term and three new `runtime/trust` switches, read by the app through a new `getSendPolicy` callable. Matches are created by one shared helper used by `swipe` and a new `acceptLike`. Gifts replicate the existing Plus payment flow in **new files only**: a Razorpay order labelled `gift_plan` (same plans and prices as Plus), its own order collection, confirm callable and webhook. A claimed gift extends the recipient through the existing `complimentaryPlusGrants` source, so `webPassBenefits`, `syncPremium` and the chat mirror need no edits.

**Tech Stack:** Firebase Cloud Functions (TypeScript, Jest), Firestore rules (Jest + emulator), Expo/React Native Web app (`apps/muse-mobile/src`), Razorpay (checkout hosted on kraftai.in, sibling repo `../kanoon-simplified`), `scripts/set-runtime-flags.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-25-accept-and-sponsor-design.md`

## Global Constraints

- Paire only. Do **not** touch `apps/muse-mobile/android/`, `ios/`, native config in `app.config.js`, `plugins/`, `eas.json`, `*.native.ts(x)`, RevenueCat/Play billing, `scripts/android/`, or `us/` (Verity).
- New switches in `runtime/trust`, all default **false**, missing = off: `acceptFlow`, `womenSendFree`, `giftSales`. Do not turn any on, change a live switch, or run a real payment. Browser checks use local emulators only.
- **The existing Razorpay setup is frozen (owner, 2026-10-25): no edit, not even a line or a word, to** `firebase/functions/src/razorpay.ts`, `razorpayClient.ts`, `chatAccess.ts` (Unlimited Chat purchase), `billing.ts`, `ccavenue.ts`, `upiPayments.ts`, `lib/razorpay.ts`, `lib/kraftai.ts`, `lib/checkout-products.ts`, `lib/payment-names.ts`, `config.ts` price tables, `apps/muse-mobile/src/hooks/useKraftaiReturn.ts`, `services/billingService.ts`, `services/chatAccessService.ts`, `PremiumScreen.tsx`, `ChatAccessCard.tsx`, or any price. Gifts add new files. Prices stay: `day` ₹35, `week` ₹99, `month` ₹399 (the "1 month + 1 month free" pass), `halfyear` ₹799, `lifetime` ₹1,499, Unlimited Chat ₹49. No new plans, no boost.
- Only these existing files may be edited, and only as the named task says: additive policy fields in `lib/chatAccess.ts` and `chatEntitlement.ts` (`syncChatAccess` adds the `freeSender` mirror field; no existing value changes) and `firestore.rules` (`paidSendAllowed` gets one extra OR term; new `giftOrders`/`gifts` blocks) in Task 1 and Task 6; `swipes.ts` (uses the match helper, behavior identical) in Task 2; `likes.ts` in Task 4; `index.ts` exports; the Likes and Matches screens and the chat composer's lock check in Task 5; `AppStack.tsx` (one new hook call) in Task 9; `scripts/set-runtime-flags.mjs` (new options). Every existing test must pass unchanged.
- Gifts: sizes `day`, `week`, `month` only (the existing plans at their existing prices); active match required; max 3 gifts sent per member per day; unclaimed gift expires after 7 days and is refunded; recipient can decline; no cash-out; no transfer.
- Women free to reply applies to all of a woman's chats (past and future) once `womenSendFree` is on.
- Accepting a like uses no daily like quota. A man's own "who liked me" list stays Plus-only.
- Every web-product commit gets a row in `docs/web-changes.md` (date, hash, summary, deploy status "not pushed"); commit the log row in a follow-up commit. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage explicit paths only (never `git add .`; keep untracked `.claude/` and `docs/marketing/*` out).
- Gift payments replicate the Plus flow (`docs/kraftai-checkout.md`): Paire's server creates the Razorpay order (INR, the plan's existing price, `notes {plan, product: "gift_plan"}`, receipt `gift_plan_<plan>_<ts>`; never a uid in notes), Checkout opens on kraftai.in, and nothing is granted until Paire re-reads the payment from Razorpay (signature check, then `paymentMatchesOrder`). Gift orders live only in `giftOrders/{orderId}`, never in `razorpayOrders`, so Plus accounting, revenue and the existing webhook (which ignores orders it doesn't know) are untouched. The existing `razorpayWebhook` URL is not changed; a **second** Razorpay webhook (new function `razorpayGiftWebhook`, new secret `RAZORPAY_GIFT_WEBHOOK_SECRET`) is added in the Razorpay dashboard by the owner.
- kraftai.in refuses products it doesn't know, so it needs one **additive** entry: `gift_plan` accepted for plan ids `day`, `week`, `month` at exactly the existing `PAIRE_PLANS` amounts, returning `kind=gift` to the app. That is in the sibling repo `../kanoon-simplified` (the owner allowed it if needed). Deploying KraftAI before Paire, and any production deploy, stay the owner's call.
- Read `docs/presence-and-paid-chat.md` and `docs/kraftai-checkout.md` before Tasks 1, 6, 7 and 8.
- `./scripts/verify.sh` must pass before the last commit of each piece (A, B).

## Review Focus

- A man's stale like after she blocks/unmatches/bans him, or after he is unverified: Accept must fail with "no longer available" and create no match (Task 3).
- Double-tapping Accept or two tabs accepting at once: exactly one match, one notification (Task 3).
- A woman whose profile gender is missing or changed to man: `freeSender` must be false, never granted by a stale mirror (Task 1).
- `womenSendFree` turned off again: women lose free sending at once without clearing the mirror (rules read the switch) (Task 1).
- A gift to someone who deleted their account, got banned, or unmatched before paying/claiming: refund, never a pass (Tasks 7, 8).
- A gift payment confirmed twice (callable plus webhook, or two tabs): one `gifts` record and at most one refund (Task 7).
- A gift order id sent to the existing `confirmPlusPayment`/`confirmChatUnlock`, or a Plus order id sent to `confirmGiftPayment`: refused as not found (Task 7).
- A chargeback or refund after the recipient claimed: only that gift's days are removed, and only if it was the last extension of their complimentary expiry; otherwise it is flagged for the owner and never shortens a purchased pass (Task 8).
- A gift to someone who already has a longer pass: it starts after their current pass ends (Task 8).

---

## Piece A: Accept flow and woman-free replies

### Task 1: Switches and the `freeSender` access term

**Files:**
- Modify: `firebase/functions/src/lib/chatAccess.ts` (ChatPolicy, parseChatPolicy, ChatAccessMirror, entitled/maySend), `firebase/functions/src/chatEntitlement.ts` (`syncChatAccess`: add the `freeSender` mirror field only), `firebase/rules/firestore.rules:359-368` (`paidSendAllowed`: one extra OR term), `scripts/set-runtime-flags.mjs`
- Create: `firebase/functions/src/sendPolicy.ts` (callable `getSendPolicy`), `apps/muse-mobile/src/services/sendPolicyService.ts` (`fetchSendPolicy`), `apps/muse-mobile/src/utils/sendPolicy.ts` (`sendLockedFor`)
- Test: `firebase/functions/test/chatAccess.test.ts`, `firebase/test/firestore.rules.test.ts`, `apps/muse-mobile/src/__tests__/sendPolicy.test.ts` (new), `firebase/functions/test/sendPolicy.test.ts` (new)

**Interfaces:**
- Produces: `ChatPolicy` gains `acceptFlow: boolean; womenSendFree: boolean; giftSales: boolean` (parse: `=== true`, default false). `ChatAccessMirror` gains `freeSender?: boolean`. `maySend(policy, access, chatCreatedAt, now)` returns true when `policy.womenSendFree && access?.freeSender === true` (and the gate is enforced). New callable `getSendPolicy() → { acceptFlow: boolean; womenSendFree: boolean; giftSales: boolean; freeSender: boolean }` (`freeSender` is effective: switch on AND the caller's mirror true; read-only, uses `chatPolicy()` and `moderation/{uid}.chatAccess`, never writes). App: `sendLockedFor(access: ChatAccess | undefined, policy: SendPolicy | undefined, chatCreatedAt: number, now?: number): boolean` returns false when `policy?.freeSender` and otherwise returns the existing `sendLocked(...)` result; the existing `sendLocked` and `ChatAccess` type are not edited.
- `syncChatAccess` sets `freeSender = users/{uid}.gender === "woman"` in the mirror (compare it in the "only write when changed" check; a missing mirror with `freeSender` false still writes nothing).

- [ ] **Step 1: Write failing tests.** In `chatAccess.test.ts`: `parseChatPolicy({})` has all three new switches false; `maySend` with enforced gate, `womenSendFree:true`, `{freeSender:true}` → true; same with `womenSendFree:false` → false; `{freeSender:false}` → false (a man with no pass). In `firestore.rules.test.ts`: with `enforcePaidChat:true`, an active-match sender whose `moderation.chatAccess.freeSender` is true can create the message + match-preview batch only when `runtime/trust.womenSendFree` is true; a sender without it is refused; a client can't write `moderation/{uid}.chatAccess`. New app util test `sendPolicy.test.ts`: `sendLockedFor({enforced:true,...no pass}, {freeSender:true})` → false; with `{freeSender:false}` or `undefined` it equals `sendLocked(...)`. New `sendPolicy.test.ts` in functions tests the callable's effective-`freeSender` logic through a pure helper `effectiveFreeSender(policy, mirror)`.
- [ ] **Step 2: Run to confirm failure.** `cd firebase/functions && npx jest test/chatAccess.test.ts`; `cd firebase && npm run test:rules` (needs emulators; use `./scripts/verify.sh` recipe in `docs/presence-and-paid-chat.md` or the `emulators:exec` line there); `cd apps/muse-mobile && npx jest src/__tests__/sendPolicy.test.ts`. Expected: FAIL on the new assertions.
- [ ] **Step 3: Implement** the types and logic above. In the rules add `|| (policy.get('womenSendFree', false) == true && access.get('freeSender', false) == true)` inside `paidSendAllowed`. Keep the gate-off short path in `maySend(chat)` untouched (Duo read budget).
- [ ] **Step 4: Add flags to `scripts/set-runtime-flags.mjs`:** `--accept-flow on|off`, `--women-send-free on|off`, `--gift-sales on|off` (same dry-run/`--confirm` behavior and `--status` output as `--unlock-sales`; update the usage line and the header comment).
- [ ] **Step 5: Run all three suites plus `npm run typecheck` in functions and app.** Expected: PASS.
- [ ] **Step 6: Commit** `git add` the files above; message `Paid chat: freeSender access term and acceptFlow/womenSendFree/giftSales switches (all off)`.

### Task 2: One shared match-creation helper

**Files:**
- Create: `firebase/functions/src/lib/matchDoc.ts`
- Modify: `firebase/functions/src/swipes.ts:120-179` (use the helper; behavior unchanged)
- Test: `firebase/functions/test/matchDoc.test.ts`; existing swipe integration tests must stay green

**Interfaces:**
- Produces: `buildMatchDoc(args: { uid: string; targetUid: string; me?: Partial<PublicProfile>; target?: Partial<PublicProfile>; superLikedBy: string[]; notes: Record<string, string | undefined>; firstMove: Record<string, boolean> }): { id: string; data: Record<string, unknown> }` (the exact document `swipe` writes today, using `FieldValue.serverTimestamp()` for times). Also `assertLikeEligible(args: { mine: DiscoveryEntry; theirs: DiscoveryEntry; theyLikedMe: boolean; mySettings: UserSettings | undefined; note: string | null }): void` throwing the same `HttpsError`s as the inline checks (`not-found` "That profile is no longer available for matching.", the incognito rule, and the notes-only rule).

- [ ] **Step 1: Write failing unit tests** for `buildMatchDoc` (sorted participants, `unread` zeros, `active:true`, `superLikedBy`, `sparks` from notes, `firstMoveBy`) and `assertLikeEligible` (throws for invisible viewer, ineligible target, incognito non-reciprocal, notes-only without note and not reciprocal; passes when reciprocal).
- [ ] **Step 2: Run** `npx jest test/matchDoc.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** by moving the code out of `swipe` unchanged, then call both helpers from `swipe`.
- [ ] **Step 4: Run** `npx jest test/matchDoc.test.ts`, then `npm test` and `npm run test:integration -- swipe` equivalents (`functions.integration.test.ts`, `premiumLikesAndGrants.integration.test.ts`; run with emulators per `docs/web-preview.md`). Expected: PASS with no behavior change.
- [ ] **Step 5: Commit** `Refactor: shared match creation helper for swipe`.

### Task 3: `acceptLike` callable

**Files:**
- Create: `firebase/functions/src/acceptLike.ts`; export it from `firebase/functions/src/index.ts`
- Modify: `firebase/functions/src/lib/validate.ts` (reuse `parseTargetInput`), `firebase/functions/src/chatEntitlement.ts` (read `acceptFlow` via `chatPolicy()`)
- Test: `firebase/functions/integration/acceptLike.integration.test.ts`; unit tests for any pure helper

**Interfaces:**
- Consumes: Task 1 (`chatPolicy().acceptFlow`), Task 2 (`buildMatchDoc`, `assertLikeEligible`).
- Produces: callable `acceptLike({ targetUid: string }) → { matched: true; matchId: string }`. Errors: `failed-precondition` (reason `accept-off`) when `acceptFlow` is false; `permission-denied` when the caller's gender isn't `woman`; `not-found` when there is no pending like from `targetUid` (types `like`/`super`) or the usual block/ban/visibility/verification checks fail.

- [ ] **Step 1: Write the failing integration test** (emulators, fictional members): man likes woman → `acceptLike` as woman creates `matches/{pairId}` with both participants, `active:true`, and her `swipes/{her}/outgoing/{him}` like exists; calling it again returns the same `matchId` and creates no second match or second push (idempotent); with `acceptFlow` off → `failed-precondition`; a man calling it → `permission-denied`; after she blocks him, or he is unverified/banned, → `not-found` and no match; consumes no `dailyLimits` like count. Also a race test: two parallel `acceptLike` calls → one match doc.
- [ ] **Step 2: Run** `npm run test:integration -- acceptLike` → FAIL.
- [ ] **Step 3: Implement** with one transaction: `requireVerifiedUsers([uid,targetUid], tx)`, read the incoming swipe, blocks, both users/settings/moderation, existing match; run `assertLikeEligible({theyLikedMe:true})`; write her swipe (`type:"like"`) and the match via `buildMatchDoc` (carry both notes into `sparks`; `superLikedBy` from the incoming type); do not touch `dailyLimits`. If the match already exists and is active, return it. After commit, send the same "It's a match" push to the man as `swipe` does. Rate-limit with `consumeDailyQuota(uid, "acceptChecks", 300)`.
- [ ] **Step 4: Run** the integration test → PASS.
- [ ] **Step 5: Commit** `Accept a like: acceptLike callable (acceptFlow switch, off)`.

### Task 4: Free likes list for women

**Files:**
- Modify: `firebase/functions/src/likes.ts:21-67` (`getLikesYou`), `apps/muse-mobile/src/services/discoveryService.ts` (`LikesYouResult`, add `acceptable: boolean`, add `acceptLike(targetUid)` wrapper calling `"acceptLike"`)
- Test: `firebase/functions/integration/acceptLike.integration.test.ts` (extend) and `premiumLikesAndGrants.integration.test.ts` (no regression)

**Interfaces:**
- Consumes: Task 1 switch, Task 3 callable.
- Produces: `getLikesYou` returns `locked:false` and full `profiles` (with notes) when the caller has Plus **or** (`acceptFlow` on and the caller's gender is `woman`); `LikesYouResult.acceptable` is true only in the second case. Men without Plus still get only the anonymous count.

- [ ] **Step 1: Extend the integration test:** woman without Plus + `acceptFlow` on sees the man's card, note and `acceptable:true`; `acceptFlow` off → anonymous count, `locked:true`; a man without Plus never sees identities even with the switch on; excluded/blocked/unverified likers are still hidden.
- [ ] **Step 2: Run** → FAIL on the new cases.
- [ ] **Step 3: Implement** a single `reveal` boolean replacing `plus` in the identity gate (keep `plus` for `expiresAt`). Read her gender from the `myProfile` document already loaded.
- [ ] **Step 4: Run** the integration tests and `npm test` → PASS.
- [ ] **Step 5: Commit** `Likes list: free for women when acceptFlow is on`.

### Task 5: App screens for Accept and the pay-to-message prompts

**Files:**
- Modify: `apps/muse-mobile/src/screens/LikesGalleryScreen.tsx` (Accept / Not now on each card when `acceptable`), `apps/muse-mobile/src/components/LikesYouRow.tsx`, `apps/muse-mobile/src/screens/ChatScreen.tsx` (replace the one `sendLocked(...)` call with `sendLockedFor(...)` fed by `useSendPolicy`; the existing `ChatAccessCard` already is the man's "get premium or unlock" prompt and stays untouched), `apps/muse-mobile/src/screens/MatchesScreen.tsx` (dismissible woman offer card on a new match when not Plus: "See who likes you and be seen first with Paire Plus"; dismissal remembered per match in `localStorage` with try/catch)
- Test: `apps/muse-mobile/src/__tests__/` component tests next to the existing ones for these components (follow their style; find with `ls apps/muse-mobile/src/__tests__ | grep -i "likes\|chataccess\|matches"`)

**Interfaces:**
- Consumes: `fetchLikesYou(): LikesYouResult` with `acceptable`, `acceptLike(targetUid)`, `fetchSendPolicy()`, `sendLockedFor`.
- Produces: hook `useSendPolicy()` in `apps/muse-mobile/src/hooks/useSendPolicy.ts` (react-query key `["send-policy"]`, refetch on focus).

- [ ] **Step 1: Write failing component tests:** with `acceptable` the card shows "Accept" and "Not now" and no lock panel; Accept calls `acceptLike` once even on double tap and navigates to the new match; Not now records a pass; the chat composer is unlocked for a `freeSender` woman and still locked for a man without a pass (the existing `ChatAccessCard` is shown, unchanged); the woman offer card is dismissible and never blocks the composer; with `acceptable:false` the existing locked view is unchanged.
- [ ] **Step 2: Run** `cd apps/muse-mobile && npx jest <files>` → FAIL.
- [ ] **Step 3: Implement.** Web-only code behind `Platform.OS === "web"` or `*.web.tsx` where behavior differs; do not edit `*.native.tsx`. Copy stays warm and plain (no emojis in buttons; ₹ prices come from the server/config, not typed in).
- [ ] **Step 4: Run** the app suite + `npm run typecheck` + `npm run lint`; start emulators per `docs/web-preview.md` and check at 390 px and 1280 px with local test members: man likes → woman accepts → man sees the existing premium/unlock card → woman replies free (with `acceptFlow` and `womenSendFree` set on the emulator only via `scripts/set-runtime-flags.mjs`'s emulator path or direct `runtime/trust` write).
- [ ] **Step 5: Run `./scripts/verify.sh`** → PASS. Commit `Likes: accept screen; woman-free composer; woman's soft offer`. Add the `docs/web-changes.md` row for Piece A in a follow-up commit.

---

---

## Piece B: Sponsorship and gifts (new files; the Plus payment code is not edited)

### Task 6: Gift rules, data model and Firestore rules

**Files:**
- Create: `firebase/functions/src/lib/gifts.ts`
- Modify: `firebase/rules/firestore.rules` (new blocks only: `giftOrders/{id}` denies all client access; `gifts/{id}` readable by `fromUid` or `toUid`, no client writes)
- Test: `firebase/functions/test/gifts.test.ts`, `firebase/test/firestore.rules.test.ts`

**Interfaces:**
- Consumes: `PLUS_PASSES`, `passDays` (import only, from `lib/razorpay.ts`).
- Produces: `GIFT_PLAN_IDS = ["day","week","month"] as const`, `type GiftPlan`, `giftAmountPaise(plan: GiftPlan): number` (= `PLUS_PASSES[plan].amountPaise`), `giftDays(plan: GiftPlan): number` (= `passDays(plan)`; so `month` is 60 days, exactly as bought), `GIFT_PENDING_MS = 7 * 86_400_000`, `GIFTS_PER_DAY = 3`, `isGiftPlan(value: unknown): value is GiftPlan`; `canGift(args: { fromUid: string; toUid: string; match: { active: boolean; participants: string[] } | undefined; blocked: boolean; recipientBanned: boolean; recipientVerified: boolean; recipientExists: boolean; sentToday: number; recipientLifetime: boolean }): { ok: true } | { ok: false; reason: "no-match" | "blocked" | "unavailable" | "limit" | "already-lifetime" }`; `giftState(gift: { status: string; expiresAt: number }, now: number): "pending" | "claimed" | "declined" | "expired" | "refunded" | "void"`. Gift document fields: `fromUid, toUid, matchId, plan, amountPaise, status, createdAt, expiresAt (pending deadline), claimedAt?, startsAt?, endsAt?, previousCompExpiry?, refundId?, needsReview?`.

- [ ] **Step 1: Write failing unit tests** for `canGift` (one case per reason, plus the ok case; `sentToday: 3` → `limit`; no match, inactive match, or a participant mismatch → `no-match`), `giftDays("month") === 60`, `giftAmountPaise` equals the `PLUS_PASSES` amounts for day/week/month, `isGiftPlan("halfyear") === false`, and `giftState` for each status and for a pending gift past `expiresAt` (→ `expired`).
- [ ] **Step 2: Write failing rules tests:** a signed-in client can neither read nor write `giftOrders/*`; sender and recipient can read their own `gifts/{id}`, a third member can't, nobody can write it.
- [ ] **Step 3: Run** `cd firebase/functions && npx jest test/gifts.test.ts`; `cd firebase && npm run test:rules` → FAIL.
- [ ] **Step 4: Implement** `lib/gifts.ts` and the two rules blocks.
- [ ] **Step 5: Run** both → PASS, plus `npm run typecheck`.
- [ ] **Step 6: Commit** `Gifts: rules, plan table and eligibility (no payments yet)`.

### Task 7: Gift payment on Razorpay, replicated in new files

**Files:**
- Create: `firebase/functions/src/giftPayments.ts`; export `createGiftOrder`, `confirmGiftPayment`, `razorpayGiftWebhook` from `firebase/functions/src/index.ts` (append only)
- Test: `firebase/functions/test/giftPayments.test.ts`, `firebase/functions/integration/giftPayments.integration.test.ts` (use the same fake Razorpay setup as `chatPayments.integration.test.ts`)

**Interfaces:**
- Consumes (import only, none edited): `razorpay` from `razorpayClient`, `isRazorpayId`, `validCheckoutSignature`, `validWebhookSignature`, `paymentMatchesOrder` from `lib/razorpay`, `checkoutHost`/`requireHostedCheckout` from `lib/kraftai`, `razorpayMode` from `lib/chatAccess`, `razorpayConfigured`/`billingEnabled` from `billing`, `chatPolicy` from `chatEntitlement`, `consumeDailyQuota`, `verifiedUsers`, `requireAuth`, Task 6 helpers.
- Produces: callable `createGiftOrder({ matchId: string; plan: GiftPlan }) → { orderId; amount; currency: "INR"; keyId; description; email; name; hostedUrl }` (the same shape `createPlusOrder` returns) or throws `failed-precondition` with `reason` in `"sales-off" | "no-match" | "blocked" | "unavailable" | "limit" | "already-lifetime"`. Callable `confirmGiftPayment({ orderId, paymentId, signature }) → { status: "paid" | "pending"; giftId: string }`. HTTP `razorpayGiftWebhook`. Internal `grantGift(orderId: string, paymentId: string): Promise<{ outcome: "granted" | "duplicate" | "orphaned" | "closed"; toUid?: string }>` and `refundGiftPayment(orderId, paymentId, amountPaise, reason)` (same Razorpay refund call and error recording as the existing duplicate-pass refund, written afresh here).
- Razorpay order body: `{ amount: giftAmountPaise(plan), currency: "INR", receipt: "gift_plan_<plan>_<Date.now()>", notes: { plan, product: "gift_plan" } }`. Never a uid, match id or name in notes. Stored in `giftOrders/{orderId}` as `{ fromUid, toUid, matchId, plan, amountPaise, currency, status: "created", mode: razorpayMode(process.env.RAZORPAY_KEY_ID), createdAt }`; `toUid` is resolved on the server from `matches/{matchId}`.
- Gate: `chatPolicy().giftSales === true` and `razorpayConfigured()`; otherwise `sales-off` before any order exists. One open unpaid order per (fromUid, matchId, plan) is reused for 6 hours, so two tabs never create two charges.

- [ ] **Step 1: Write failing unit tests** for order-body building (amount, receipt prefix `gift_plan_`, `notes.product === "gift_plan"`, no uid/match in notes) and for the pure verdict logic.
- [ ] **Step 2: Write failing integration tests:** `giftSales` off → `sales-off`, no order written; a woman creates a `week` gift for her active match → Razorpay order at 9900 paise, `giftOrders` row, **no `razorpayOrders` row, no `billing`/`webPassLedger` change for her**; a non-match, a blocked pair, a banned/unverified/missing recipient, a 4th gift in a day → the matching `reason`; same order id presented to the existing `confirmPlusPayment` → `not-found`; confirm with a bad signature → `permission-denied`; confirm for a captured payment at the right amount → `gifts/{orderId}` `pending` with `expiresAt = paidAt + 7 days`, recipient push sent; confirm twice, then the webhook as well → one `gifts` doc; wrong amount/currency → `failed-precondition`, no gift; recipient deleted/banned/unmatched at capture → `orphaned` and a refund request; test-mode payment for a real (non-test-cohort) account → `rejected`; webhook with a bad signature → 401, with unknown order → 200 and nothing written.
- [ ] **Step 3: Run** `npx jest test/giftPayments.test.ts` and `npm run test:integration -- giftPayments` → FAIL.
- [ ] **Step 4: Implement** `giftPayments.ts`. The webhook handles `payment.captured` (re-read the payment, then `grantGift`) and passes `refund.processed`, `payment.refunded`, `payment.dispute.lost` to Task 8's `reverseGift`; dispute created/won/closed are logged only. Secrets: `RAZORPAY_KEY_SECRET`, `REVENUECAT_SECRET_KEY` (callables, as the Plus callables bind them), and `RAZORPAY_GIFT_WEBHOOK_SECRET` (webhook). Do not touch `razorpayWebhook`.
- [ ] **Step 5: Run** unit and integration tests, plus the existing `chatPayments`, `premiumLikesAndGrants` and `ccavenuePayments` integration tests and `npm test` → PASS with **no edits to any existing test or source file**.
- [ ] **Step 6: Commit** `Gifts: Razorpay order, confirm and webhook (gift_plan), giftSales off`.

### Task 8: Gift lifecycle: claim, decline, expire, reverse

**Files:**
- Create: `firebase/functions/src/giftLifecycle.ts`; export `claimGift`, `declineGift`, `listGifts`, `expireGifts` (scheduled, daily) from `index.ts` (append only); `reverseGift` is imported by `giftPayments.ts`
- Test: `firebase/functions/integration/giftLifecycle.integration.test.ts`, `firebase/functions/test/giftLifecycle.test.ts`

**Interfaces:**
- Consumes: Task 6 helpers, Task 7 `refundGiftPayment`, existing `syncPremium(uid)` (import only), `sendPushToUser`, `notificationCopy`.
- Produces: `claimGift({ giftId }) → { status: "claimed"; endsAt: number }`; `declineGift({ giftId }) → { status: "declined" }`; `listGifts() → { received: GiftView[]; sent: GiftView[] }` where `GiftView = { id; plan; status; counterpartName; createdAt; expiresAt; endsAt?: number }` (names come from the match snippet, never emails); `reverseGift(orderId: string, reason: "refund" | "chargeback"): Promise<void>`; pure `giftWindow(args: { now: number; billingExpiresAt: number; complimentaryExpiresAt: number; days: number }): { startsAt: number; endsAt: number }` = start at `max(now, billingExpiresAt, complimentaryExpiresAt)`.
- Claim writes the grant through the existing `complimentaryPlusGrants/{uid}` source: `{ status: "active", expiresAt: endsAt, updatedAt: now, lastSource: "gift", lastGiftId }` with `set(..., {merge:true})`, records `previousCompExpiry` on the gift, then calls `syncPremium(uid)`. `webPassBenefits` already takes the max of this source, so nothing in billing is edited.
- `reverseGift`: a never-claimed gift → status `refunded`, nothing else. A claimed gift → if `complimentaryPlusGrants/{toUid}.expiresAt === gift.endsAt` restore `previousCompExpiry` and `syncPremium`; otherwise (the owner or another gift has since changed it) set `needsReview: true` on the gift and leave the grant. A purchased pass is never changed.
- `expireGifts`: pending gifts past `expiresAt` → `expired`; pending gifts whose match is inactive, or whose recipient is missing or banned → `void`; both are refunded with `refundGiftPayment`.

- [ ] **Step 1: Write failing unit tests** for `giftWindow` (no pass → starts now; a 20-day paid pass running → starts after it; an existing complimentary expiry later than billing → starts after that) and for the revoke-condition helper.
- [ ] **Step 2: Write failing integration tests:** claim as recipient → `complimentaryPlusGrants` extended, `billing/{uid}.expiresAt` and `moderation.chatAccess.premiumUntil` move, and a man without a pass can now send under the gate; claim twice → one grant; claim by anyone but the recipient → `permission-denied`; claim after 7 days or after unmatch → `failed-precondition`; decline → refund requested, no pass; `expireGifts` handles each case above; a refund webhook after claim restores the previous expiry only when the condition holds, otherwise flags `needsReview`; recipient with a ₹399 pass bought earlier keeps that pass whole and gets the gift after it; owner `adminPremium` goodwill grants and the existing Plus integration tests still pass unchanged.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement.** Claim, decline and reverse each run in a transaction (reads first). Notify the giver on claim ("<name> accepted your gift") and the recipient on payment with `kind: "matches"` and `notificationCopy` (generic text unless previews are on).
- [ ] **Step 5: Run** unit, integration, `npm test`, `npm run lint`, `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** `Gifts: claim, decline, expire and reverse (giftSales off)`.

### Task 9: KraftAI additive entry, and the app's gift screens

**Files:**
- Modify (sibling repo `../kanoon-simplified`, additive only): `src/lib/paire.ts` (`PaireKind` gains `"gift"`; `PRODUCTS` gains `gift_plan: "gift"`; `paireCheckout` for kind `gift` resolves the plan from `notes.plan` among `day`/`week`/`month` at exactly the existing `PAIRE_PLANS` amounts and refuses any other plan or amount; `isPaireKind` accepts `gift`; the return URL carries `kind=gift`), and its tests (`gift_plan` opens at the three prices, refuses `halfyear`, `lifetime`, `chat`, a wrong amount, and still accepts every existing product exactly as before)
- Create (Paire): `apps/muse-mobile/src/services/giftService.ts` (`createGift(matchId, plan, theme)` using `leaveForHostedCheckout` and `rememberReturnChat` from the existing modules; `claimGift`, `declineGift`, `fetchGifts`), `apps/muse-mobile/src/hooks/useGiftReturn.ts`, `apps/muse-mobile/src/components/GiftSheet.tsx`, `apps/muse-mobile/src/components/GiftBanner.tsx`
- Modify: `apps/muse-mobile/src/navigation/AppStack.tsx` (add `useGiftReturn();` on the line before `useKraftaiReturn();`), the chat header menu in `ChatScreen.tsx` ("Gift premium", shown only when `fetchSendPolicy().giftSales`), `MatchesScreen.tsx` (render `GiftBanner` for a pending received gift)
- Test: KraftAI's own tests; `apps/muse-mobile/src/__tests__/giftSheet.test.tsx`, `giftReturn.test.tsx`

**Interfaces:**
- Consumes: Tasks 7 and 8 callables, `useSendPolicy` (Task 5), `leaveForHostedCheckout(order: CheckoutOrder, returnToChat?: string)` (existing, import only).
- Produces: `useGiftReturn()` reads `kraftai`, `kind`, `order`, `payment`, `signature` from the URL **without removing them**, acts only when `kind === "gift"`, calls `confirmGiftPayment`, then shows a toast ("Gift paid. They'll see it when they open Paire." / pending / failed); the existing `useKraftaiReturn` runs next, strips the parameters and ignores `kind=gift` (it returns early for kinds other than plus/chat).

- [ ] **Step 1: Write failing tests (KraftAI):** as listed above.
- [ ] **Step 2: Write failing app tests:** `GiftSheet` lists Day, Week, Month with the existing prices from `PREMIUM_PLANS`/`WEB_PREMIUM_PLANS` (import, not retyped) and calls `createGift` with the match id only; on `already-lifetime`/`limit`/`unavailable` it shows a plain message and does not redirect; `GiftBanner` Accept calls `claimGift` once even on double tap, No thanks calls `declineGift`; `useGiftReturn` with `?kraftai=paid&kind=gift&order=…&payment=…&signature=…` calls `confirmGiftPayment` exactly once, and with `kind=plus` or `kind=chat` does nothing; with `giftSales` off the chat menu has no gift action.
- [ ] **Step 3: Run** KraftAI tests (`npm test` there) and `cd apps/muse-mobile && npx jest src/__tests__/giftSheet.test.tsx src/__tests__/giftReturn.test.tsx` → FAIL.
- [ ] **Step 4: Implement** web-first; no `*.native.tsx` edits. Copy is warm and plain; never says who is paying for what in a way that implies a debt.
- [ ] **Step 5: Run** app suite, typecheck, lint, and KraftAI's tests/build; verify in the browser on local emulators (390 px and 1280 px, fictional members, fake Razorpay only, never a live key): woman gifts a week, man claims, man can send.
- [ ] **Step 6: Run `./scripts/verify.sh`** → PASS. Commit Paire files (`Gifts: gift sheet, banner and return handling`) and, separately, the KraftAI repo commit (`Paire gift_plan checkout entry`, not pushed or deployed).

### Task 10: End-to-end check and docs

**Files:**
- Create: `firebase/functions/integration/acceptAndSponsor.integration.test.ts`, `docs/accept-and-sponsor.md`
- Modify: `docs/presence-and-paid-chat.md` (append a short "Women reply free and gifts" section only), `docs/web-changes.md` (rows with hashes), `PROJECT_STATE.md` (short status). Terms/Refund copy for gifts is drafted in `docs/accept-and-sponsor.md` as **text for legal review**; the live legal pages in `apps/web` are not edited.

- [ ] **Step 1: Write the failing end-to-end integration test** (emulator, all three switches on): man likes woman → `acceptLike` → match → man (no pass) is refused by the rules → woman replies free → she buys a week gift (fake Razorpay) → he claims → he can send; then `womenSendFree` off → she loses free sending, his gift days remain; the existing Razorpay and Unlimited Chat paths behave identically before and after (assert `razorpayOrders`, `chatUnlockOrders` and `billing` unchanged by a gift).
- [ ] **Step 2: Run** → FAIL until pieces connect; fix gaps in the owning task's files, not here.
- [ ] **Step 3: Write `docs/accept-and-sponsor.md`:** switches and the order to turn them on (`acceptFlow`; `womenSendFree` then `--backfill-chat-access`; `giftSales` last, on a test cohort), rollback per switch, owner steps (add the second Razorpay webhook to `razorpayGiftWebhook` with the new secret and the events `payment.captured`, `refund.processed`, `payment.refunded`, `payment.dispute.*`; set `RAZORPAY_GIFT_WEBHOOK_SECRET`; deploy KraftAI before Paire; legal review of the gift terms text; one real low-value test payment and refund), and the exact list of existing files that were edited and why.
- [ ] **Step 4: Run `./scripts/verify.sh`** and the full emulator integration suite → PASS. Confirm with `git diff --stat <base>..HEAD -- firebase/functions/src/razorpay.ts firebase/functions/src/chatAccess.ts firebase/functions/src/billing.ts firebase/functions/src/lib/razorpay.ts apps/muse-mobile/src/hooks/useKraftaiReturn.ts` that the frozen files show **no changes**.
- [ ] **Step 5: Commit** docs and test; follow-up commit adds hashes to `docs/web-changes.md`. Do not push or deploy; report status to the owner.
