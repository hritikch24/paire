# Accept likes, man pays to message, sponsorship: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let women accept likes for free, make the man's premium the key to messaging (women reply free), add a Month/2-month/Week/Day/boost plan ladder, and let either match partner gift the other a pass, all behind switches that stay off.

**Architecture:** Extend the existing paid-chat model (`lib/chatAccess.ts`, the `maySend` rules, the `moderation.chatAccess` mirror) with a gender-derived `freeSender` term and three new `runtime/trust` switches. Matches are created by one shared helper used by `swipe` and a new `acceptLike`. Plans and the boost extend `PLUS_PASSES` and the CCAvenue order kinds. Gifts are a new `giftOrders` + `gifts` pair whose claimed gifts feed `webPassBenefits` as one more source, so `billing/{uid}` and the chat mirror update through the existing `syncPremium`.

**Tech Stack:** Firebase Cloud Functions (TypeScript, Jest), Firestore rules (Jest + emulator), Expo/React Native Web app (`apps/muse-mobile/src`), Razorpay (checkout hosted on kraftai.in, sibling repo `../kanoon-simplified`), `scripts/set-runtime-flags.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-25-accept-and-sponsor-design.md`

## Global Constraints

- Paire only. Do **not** touch `apps/muse-mobile/android/`, `ios/`, native config in `app.config.js`, `plugins/`, `eas.json`, `*.native.ts(x)`, RevenueCat/Play billing, `scripts/android/`, or `us/` (Verity).
- New switches in `runtime/trust`, all default **false**, missing = off: `acceptFlow`, `womenSendFree`, `giftSales`. Do not turn any on, change a live switch, or run a real payment. Browser checks use local emulators only.
- Existing prices and plan keys are unchanged: `day` ₹35 (3500 paise), `week` ₹99 (9900), `month` ₹399 (39900, 30 + 30 bonus days), `halfyear` ₹799, `lifetime` ₹1,499, Unlimited Chat ₹49.
- New (proposed) prices: `monthly` 30 days ₹249 (24900 paise); `boost` 24 hours ₹49 (4900 paise). Prices exist only server-side (`PLUS_PASSES` etc.); client amounts are ignored.
- Gifts: sizes `day`, `week`, `monthly` only; active match required; max 3 gifts sent per member per day; unclaimed gift expires after 7 days and is refunded; recipient can decline; no cash-out; no transfer.
- Women free to reply applies to all of a woman's chats (past and future) once `womenSendFree` is on.
- Accepting a like uses no daily like quota. A man's own "who liked me" list stays Plus-only.
- Every web-product commit gets a row in `docs/web-changes.md` (date, hash, summary, deploy status "not pushed"); commit the log row in a follow-up commit. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage explicit paths only (never `git add .`; keep untracked `.claude/` and `docs/marketing/*` out).
- **All payments use the existing Razorpay setup** (`docs/kraftai-checkout.md`): Paire's server creates every order, Checkout opens on kraftai.in, and access is granted only after Paire re-reads the payment from Razorpay (confirm callable plus the signed `razorpayWebhook`). Do not add CCAvenue or UPI paths. Switch `razorpayPlusSales` (already in `runtime/trust`) gates the new sales too.
- kraftai.in only opens orders that match its catalog (`PAIRE_PLANS` in `../kanoon-simplified/src/lib/paire.ts`; Paire's copy is `KRAFTAI_PUBLISHED_PAISE` in `lib/kraftai.ts`, and `test/kraftai.test.ts` fails if they drift). That is a **separate repo**: changing it, and deploying KraftAI before Paire, needs the owner's go-ahead. Only two new catalog entries are required (`monthly` and `boost`); gifts reuse the existing `plus` entries.
- Read `docs/presence-and-paid-chat.md`, `docs/kraftai-checkout.md` and `docs/ccavenue.md` (for background only) before Tasks 1, 6, 7 and 8.
- `./scripts/verify.sh` must pass before the last commit of each piece (A, B, C).

## Review Focus

- A man's stale like after she blocks/unmatches/bans him, or after he is unverified: Accept must fail with "no longer available" and create no match (Task 3).
- Double-tapping Accept or two tabs accepting at once: exactly one match, one notification (Task 3).
- A woman whose profile gender is missing or changed to man: `freeSender` must be false, never granted by a stale mirror (Task 1).
- `womenSendFree` turned off again: women lose free sending at once without clearing the mirror (rules read the switch) (Task 1).
- A gift to someone who deleted their account, got banned, or unmatched before paying/claiming: refund, never a pass (Task 8).
- A refunded or charged-back gift after the recipient claimed it: only that gift's days are revoked; their own purchased passes are untouched (Task 8).
- A boost bought by a non-Plus member must never unlock messaging, the likes list, or higher like caps (Task 6).

---

## Piece A: Accept flow and woman-free replies

### Task 1: Switches and the `freeSender` access term

**Files:**
- Modify: `firebase/functions/src/lib/chatAccess.ts` (ChatPolicy, parseChatPolicy, ChatAccessMirror, entitled/maySend), `firebase/functions/src/chatEntitlement.ts` (`syncChatAccess`), `firebase/functions/src/chatAccess.ts` (`ChatAccessStatus`, `chatAccessStatus`), `firebase/rules/firestore.rules:359-368` (`paidSendAllowed`), `apps/muse-mobile/src/utils/chatAccess.ts` (`sendLocked`), `apps/muse-mobile/src/services/chatAccessService.ts` (`ChatAccess` type), `scripts/set-runtime-flags.mjs`
- Test: `firebase/functions/test/chatAccess.test.ts`, `firebase/test/firestore.rules.test.ts`, `apps/muse-mobile/src/__tests__/` (the existing chatAccess util test file; find with `grep -rl sendLocked apps/muse-mobile/src/__tests__`)

**Interfaces:**
- Produces: `ChatPolicy` gains `acceptFlow: boolean; womenSendFree: boolean; giftSales: boolean` (parse: `=== true`, default false). `ChatAccessMirror` gains `freeSender?: boolean`. `maySend(policy, access, chatCreatedAt, now)` returns true when `policy.womenSendFree && access?.freeSender === true` (and the gate is enforced). `ChatAccessStatus` gains `freeSender: boolean` (effective: switch on AND mirror true). App `ChatAccess` gains `freeSender: boolean`; `sendLocked` returns false when `access.freeSender`.
- `syncChatAccess` sets `freeSender = users/{uid}.gender === "woman"` in the mirror (compare it in the "only write when changed" check; a missing mirror with `freeSender` false still writes nothing).

- [ ] **Step 1: Write failing tests.** In `chatAccess.test.ts`: `parseChatPolicy({})` has all three new switches false; `maySend` with enforced gate, `womenSendFree:true`, `{freeSender:true}` → true; same with `womenSendFree:false` → false; `{freeSender:false}` → false (a man with no pass). In `firestore.rules.test.ts`: with `enforcePaidChat:true`, an active-match sender whose `moderation.chatAccess.freeSender` is true can create the message + match-preview batch only when `runtime/trust.womenSendFree` is true; a sender without it is refused; a client can't write `moderation/{uid}.chatAccess`. In the app util test: `sendLocked({enforced:true, freeSender:true, ...})` → false.
- [ ] **Step 2: Run to confirm failure.** `cd firebase/functions && npx jest test/chatAccess.test.ts`; `cd firebase && npm run test:rules` (needs emulators; use `./scripts/verify.sh` recipe in `docs/presence-and-paid-chat.md` or the `emulators:exec` line there); `cd apps/muse-mobile && npx jest <file>`. Expected: FAIL on the new assertions.
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
- Modify: `apps/muse-mobile/src/screens/LikesGalleryScreen.tsx` (Accept / Not now on each card when `acceptable`), `apps/muse-mobile/src/components/LikesYouRow.tsx`, `apps/muse-mobile/src/components/ChatAccessCard.tsx` (man's headline "Get premium to message her"; Month pre-selected; "Unlimited Chat ₹49" stays as the cheaper option), `apps/muse-mobile/src/screens/MatchesScreen.tsx` (dismissible woman offer card on a new match when not Plus: "See who likes you and be seen first with Paire Plus"; dismissal remembered per match in `localStorage` with try/catch)
- Test: `apps/muse-mobile/src/__tests__/` component tests next to the existing ones for these components (follow their style; find with `ls apps/muse-mobile/src/__tests__ | grep -i "likes\|chataccess\|matches"`)

**Interfaces:**
- Consumes: `fetchLikesYou(): LikesYouResult` with `acceptable`, `acceptLike(targetUid)`, `ChatAccess.freeSender`.

- [ ] **Step 1: Write failing component tests:** with `acceptable` the card shows "Accept" and "Not now" and no lock panel; Accept calls `acceptLike` once even on double tap and navigates to the new match; Not now records a pass; `ChatAccessCard` for a man shows "Get premium to message her" and never renders for `freeSender`; the woman offer card is dismissible and never blocks the composer; with `acceptable:false` the existing locked view is unchanged.
- [ ] **Step 2: Run** `cd apps/muse-mobile && npx jest <files>` → FAIL.
- [ ] **Step 3: Implement.** Web-only code behind `Platform.OS === "web"` or `*.web.tsx` where behavior differs; do not edit `*.native.tsx`. Copy stays warm and plain (no emojis in buttons; ₹ prices come from the server/config, not typed in).
- [ ] **Step 4: Run** the app suite + `npm run typecheck` + `npm run lint`; start emulators per `docs/web-preview.md` and check at 390 px and 1280 px with local test members: man likes → woman accepts → man sees the premium prompt → woman replies free (with `acceptFlow` and `womenSendFree` set on the emulator only via `scripts/set-runtime-flags.mjs`'s emulator path or direct `runtime/trust` write).
- [ ] **Step 5: Run `./scripts/verify.sh`** → PASS. Commit `Likes: accept screen; man's premium prompt; woman's soft offer`. Add the `docs/web-changes.md` row for Piece A in a follow-up commit.

---

## Piece B: Plan ladder and priority boost

### Task 6: `monthly` plan, `boost` product and server entitlements

**Files:**
- Modify: `firebase/functions/src/lib/razorpay.ts` (`PLUS_PASSES.monthly`: days 30, bonusDays 0, amountPaise 24900), `firebase/functions/src/lib/payment-names.ts` (`labels.monthly`, `razorpayLabels.monthly`, `labels.boost`, `razorpayLabels.boost`), `firebase/functions/src/lib/kraftai.ts` (`KRAFTAI_PUBLISHED_PAISE` gains `monthly: 24900, boost: 4900`), `firebase/functions/src/lib/checkout-products.ts` (`boost: "kraftai_priority_boost"`), `firebase/functions/src/boost.ts` (new: `createBoostOrder`, `confirmBoostPayment`, `handleBoostWebhook`, modelled on `chatAccess.ts`'s Unlimited Chat flow: Razorpay order, `boostOrders/{orderId}` record, signature + Razorpay re-read, 24 h window, idempotent, refund/chargeback ends it), `firebase/functions/src/razorpay.ts` (webhook calls `handleBoostWebhook` next to `handleChatUnlockWebhook`), `firebase/functions/src/billing.ts` (`syncPremium` also writes `boostUntil` into `billing/{uid}` from paid `boostOrders`), `firebase/functions/src/lib/premiumBenefits.ts` (`BillingSnapshot` + `boostUntil`), `firebase/functions/src/premium.ts` (`limitsFor` returns `boosted: boolean`), `firebase/functions/src/swipes.ts` (stamp `priority: true` when `limits.priority || limits.boosted`), `firebase/functions/src/upiPayments.ts` and `ccavenue.ts` (unchanged except that their create functions must still accept `monthly` via `isPlusPlan` and refuse boost and gifts)
- Modify (KraftAI repo, **needs owner OK**): `../kanoon-simplified/src/lib/paire.ts` (`PAIRE_PLANS` gains `{id:"monthly", kind:"plus", amountPaise:24900, days:30}` and `{id:"boost", kind:"boost", amountPaise:4900}`; `PRODUCTS` maps `kraftai_priority_boost` → `boost`; callback `kind=boost`), `../kanoon-simplified/src/lib/payment-names.ts`, and its tests. Deploy KraftAI first; hosted checkout keeps refusing any other amount.
- Modify (mirror): `apps/muse-mobile/src/config/premium.ts` (`PREMIUM_PLANS`/`WEB_PREMIUM_PLANS` gain `monthly` and a `BOOST` constant; web-only prices; native values unchanged)
- Test: `firebase/functions/test/razorpay.test.ts`, `kraftai.test.ts`, `premium.test.ts`, `paymentNames.test.ts`, `premiumBenefits.test.ts`; `firebase/functions/integration/chatPayments.integration.test.ts` (pattern for fake Razorpay) and a new `boost.integration.test.ts`

**Interfaces:**
- Produces: callables `createBoostOrder() → CreateResult` (same shape as `createChatUnlockOrder`), `confirmBoostPayment({orderId,paymentId,signature})`; `PLUS_PASSES.monthly` and `isPlusPlan("monthly") === true`; `passDays("monthly") === 30`; `limitsFor(snapshot)` returns `{likesPerDay, supersPerDay, priority, boosted}` where `boosted` is true while `snapshot.boostUntil > now`, independent of `priority` (so a boost never changes `likesPerDay`, `supersPerDay`, `priority` or the likes-list gate). `monthly` does **not** grant unlimited likes (`unlimitedPlan` stays `month`/`halfyear`).

- [ ] **Step 1: Write failing tests:** plan table values above; `passWindow` queues a `monthly` pass after a running one; `limitsFor({boostUntil: future})` → `priority:false, boosted:true, likesPerDay` = free cap; boost + valid Plus → both true; a Razorpay boost order confirms once (idempotent across the callable and the webhook), grants exactly 24 h, never appears in `webPassBenefits`, and refund/chargeback ends it; a ₹249 `monthly` order is created with `notes.plan:"monthly"` and `KRAFTAI_PUBLISHED_PAISE` matches the plan table; a boost for a non-verified member is refused like a Plus order; the UPI and CCAvenue create functions reject boost.
- [ ] **Step 2: Run** the listed Jest files → FAIL.
- [ ] **Step 3: Implement** per the file list. Reuse the `webPassLedger` queue only for `plus`; boosts don't queue (a second boost extends from the running one's end, computed in the settle transaction).
- [ ] **Step 4: Run** `npm test`, `npm run test:integration -- chatPayments boost`, app `npm run test:unit` → PASS.
- [ ] **Step 5: Commit** `Plans: 30-day Monthly pass and 24-hour Priority boost (Razorpay)`.

### Task 7: Plan ladder on the Premium screen and the chat prompt

**Files:**
- Modify: `apps/muse-mobile/src/screens/PremiumScreen.tsx` (order: Month pre-selected "Most popular", 2 months [the existing `month` plan, retitled "2 months"], Week, Day, "More plans" for 6 months and Lifetime, then a separate "Priority boost" card), `apps/muse-mobile/src/config/premium.ts` (`webPlan` copy: `month` label "2 months" with per-day price; `MONTH_OFFER` text becomes "2 months for ₹399"), `apps/muse-mobile/src/components/ChatAccessCard.tsx` (Month pre-selected), `apps/muse-mobile/src/services/billingService.ts` (`purchaseBoost(theme)` and `purchaseWebPass` accepting `monthly`; both end in `leaveForHostedCheckout`), `apps/web` pricing content only if it quotes plan names (grep `1 month` in `apps/web`; update copy, legal pages and `llms.txt` to match, run `node --test apps/web/test/*.test.mjs`)
- Test: app tests for `PremiumScreen` and `webPlan`; `apps/web/test`

**Interfaces:**
- Consumes: Task 6 plan keys and `BOOST`.

- [ ] **Step 1: Write failing tests:** screen lists plans in the order above; `monthly` is selected by default and its CTA names ₹249; `month` shows "2 months", ₹399, per-day price and no "buy 1 get 1 free" claim; boost card says it only moves likes up the list and gives no messaging; native Platform output is unchanged (snapshot of the native branch).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Keep `id`s stable (`month` still means the ₹399 pass).
- [ ] **Step 4: Run** app tests, typecheck, lint, web tests; browser check on the emulator at 390 px and 1280 px (no payment is completed).
- [ ] **Step 5: Run `./scripts/verify.sh`** → PASS. Commit `Premium: Month first, 2 months, week, day, boost`. Follow-up commit: `docs/web-changes.md` row for Piece B.

---

## Piece C: Sponsorship and gifts

### Task 8: Gift model, ordering, claim and refund

**Files:**
- Create: `firebase/functions/src/lib/gifts.ts` (pure rules), `firebase/functions/src/gifts.ts` (callables)
- Modify: `firebase/functions/src/razorpay.ts` (`confirmPlusPayment` and the webhook fall back to `giftOrders/{orderId}` when the order is not in `razorpayOrders`, because kraftai.in's callback reports every gift as `kind=plus`; on `paid` create `gifts/{orderId}` with status `pending`, `expiresAt = paidAt + 7 days`; on refund/chargeback mark the gift `refunded` and revoke only its days), `firebase/functions/src/billing.ts` (`webPassBenefits`: add a fourth source, `gifts` where `toUid == uid` and `status == "claimed"`, mapped to records `{status:"paid", paymentSource:"gift", plan, startsAt, expiresAt}`), `firebase/functions/src/index.ts`, `firebase/rules/firestore.rules` (`giftOrders` and `gifts`: server-only writes; a recipient or sender may read their own `gifts/{id}` fields shown in the app), `firebase/functions/src/memberAdmin.ts` or `adminPurchases.ts` (show gifts in the admin payments view)
- Test: `firebase/functions/test/gifts.test.ts`, `firebase/functions/integration/gifts.integration.test.ts`, `firebase/test/firestore.rules.test.ts`

**Interfaces:**
- Consumes: Task 1 (`giftSales`), Task 6 (`monthly`), `passWindow`/`webPassLedger` queueing.
- Produces (`lib/gifts.ts`): `GIFT_PLANS = { day, week, monthly }` referencing `PLUS_PASSES` amounts; `canGift(args: { fromUid; toUid; match: {active:boolean; participants:string[]} | undefined; recipientBlocked: boolean; recipientBanned: boolean; recipientVerified: boolean; sentToday: number; recipientRemainingMs: number; planDays: number }): { ok: true } | { ok: false; reason: "no-match" | "blocked" | "unavailable" | "limit" | "already-covered" }` (limit is `sentToday >= 3`; `already-covered` when `recipientRemainingMs >= planDays` days or the recipient has lifetime); `giftState(gift, now): "pending" | "claimed" | "declined" | "expired" | "refunded"`.
- Callables (`gifts.ts`): `createGiftOrder({ matchId, plan }) → CreateResult | {status:"unavailable"; reason}` (a Razorpay order with `notes {product:"kraftai_plus", plan}` and the plan's normal price, so kraftai.in needs no change; recorded in `giftOrders/{orderId}` with `fromUid`, `toUid`, `matchId`, never in `razorpayOrders`, so the payer's own benefits are untouched) (server resolves `toUid` from the match, never from the client); `claimGift({ giftId }) → { status:"claimed"; expiresAt:number }`; `declineGift({ giftId })` (marks `declined` and refunds); `listGifts() → { received: Gift[]; sent: Gift[] }`; scheduled `expireGifts` (daily) that marks stale pending gifts `expired`, and pending gifts whose match is no longer active `void`, and refunds both through Razorpay's refund API (the `refundUnneededPass` pattern in `razorpay.ts`).

- [ ] **Step 1: Write failing unit tests** for `canGift` (each reason) and `giftState`.
- [ ] **Step 2: Write failing integration tests** (emulators, fake Razorpay as in `chatPayments.integration.test.ts`): woman buys a week gift for her match → order `giftOrders` row, payment verified → `gifts/{id}` pending, recipient notified; recipient `claimGift` → his `billing/{uid}.expiresAt` and `moderation.chatAccess.premiumUntil` move forward, he can send; claim twice → one grant; decline → refund requested, no pass; unmatched/blocked/deleted/banned recipient at payment → `orphaned`/refund, no gift; 8 days later `expireGifts` → expired + refund; refund of a claimed gift → his days drop by exactly that gift and his own purchased pass is untouched; fourth gift in a day → `resource-exhausted`; `giftSales` off → `unavailable`.
- [ ] **Step 3: Write failing rules tests:** no client can create/update `giftOrders` or `gifts`; only sender or recipient may read a gift.
- [ ] **Step 4: Run** all three → FAIL.
- [ ] **Step 5: Implement.** Reuse the Razorpay verification (`validCheckoutSignature`, `paymentMatchesOrder`) and refund helpers; a gift order must never create or touch a `razorpayOrders` record; claim runs in a transaction that queues the pass after any running one (`webPassLedger`) then calls `syncPremium(toUid)`. Notify with `sendPushToUser` kind `"matches"` (copy: "<first name> gifted you a week of Paire Plus"; honors the previews privacy setting via `notificationCopy`).
- [ ] **Step 6: Run** unit, integration and rules suites → PASS.
- [ ] **Step 7: Commit** `Gifts: sponsor a pass for your match (giftSales switch, off)`.

### Task 9: Gift screens in the app

**Files:**
- Create: `apps/muse-mobile/src/services/giftService.ts` (`createGift(matchId, plan)`, `claimGift`, `declineGift`, `fetchGifts`), `apps/muse-mobile/src/components/GiftSheet.tsx` (plan picker: Day, Week, Monthly with prices from config; "Already covered" message when the server says `already-covered`)
- Modify: the chat screen (a "Gift premium" action in the header menu, for both sexes), `ChatAccessCard.tsx` (a secondary "Ask for a gift" is out of scope; only link to the sheet from a woman's view of a man who can't send), `apps/muse-mobile/src/screens/MatchesScreen.tsx` (a "You were gifted a week" banner with Accept gift / No thanks), settings or Premium screen (list of gifts sent and received with state)
- Test: component tests following the existing style

**Interfaces:**
- Consumes: Task 8 callables.

- [ ] **Step 1: Write failing tests:** `GiftSheet` lists three plans and calls `createGift` with the match's id (never a uid); on `already-covered` it shows the message and doesn't redirect; a pending received gift shows Accept/No thanks and calling Accept updates the chat to sendable; a woman can open the sheet for a man and a man for a woman; nothing renders when `giftSales` is off (server returns `unavailable`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** web-first, no native edits; checkout uses the existing hosted-checkout redirect and return-to-chat helpers (`leaveForHostedCheckout`, `rememberReturnChat`, `stashDrafts`) and handles `?kraftai=paid&kind=boost` on return.
- [ ] **Step 4: Run** app suite, typecheck, lint; emulator browser check at 390 px and 1280 px with fictional members (no real payment; use the fake Razorpay used by the integration tests, never a live key).
- [ ] **Step 5: Commit** `Gifts: gift sheet, claim banner and history`.

### Task 10: End-to-end check, docs and the rollout note

**Files:**
- Create: `firebase/functions/integration/acceptAndSponsor.integration.test.ts`, `docs/accept-and-sponsor.md`
- Modify: `docs/presence-and-paid-chat.md` (new switches and the `freeSender` term, "Rollout order" step), `docs/web-changes.md` (rows for B and C with hashes), `PROJECT_STATE.md` (short status), Terms/Refund copy in `apps/web` only as a **draft flagged for legal review** (gifts, 7-day refund, boost), then `node --test apps/web/test/*.test.mjs`

- [ ] **Step 1: Write the failing end-to-end integration test:** with all three switches on (emulator only): man likes woman → she `acceptLike` → match → man (no pass) can't send (rules) → woman replies (free) → she gifts him a week → he claims → he can send; then switches off → woman loses free sending, his gift days remain.
- [ ] **Step 2: Run** → FAIL until the pieces connect; fix any gaps found in earlier tasks (not here).
- [ ] **Step 3: Write `docs/accept-and-sponsor.md`:** switches, order to turn them on (`acceptFlow`, `womenSendFree` + `--backfill-chat-access`, plan ladder visible, `giftSales` on a test cohort first), rollback per switch, what needs the owner (confirm ₹249 and ₹49, legal review, one real low-value test payment and refund), and the open limits (KraftAI catalog change for `monthly` and `boost` must be deployed before Paire; gifts need no KraftAI change).
- [ ] **Step 4: Run `./scripts/verify.sh`** end to end → PASS, and the full emulator integration suite.
- [ ] **Step 5: Commit** docs and the test; then a follow-up commit adding hashes to `docs/web-changes.md`. Do **not** push or deploy; report the status to the owner.
