# Paire: accept likes, man pays to message, sponsorship

Status: draft for owner review (2026-10-25). Scope: Paire (paire.in, web). Android/iOS untouched.
Everything ships behind switches that stay **off** until the owner says go. See `docs/presence-and-paid-chat.md` and `docs/kraftai-checkout.md` for the systems this builds on. **All payments use the existing Razorpay setup** (owner, 2026-10-25).

## Intent (what the owner asked)

1. When a man sends a woman a like, she can **accept** it. Accepting creates the match.
2. After a match the **man is asked for premium** to send messages. The existing offers (Plus passes and the ₹49 Unlimited Chat unlock) stay exactly as they are.
3. Women also see premium offers at match time, but are not blocked.
4. If one person has premium and the other doesn't, either can **sponsor (gift) premium** to the other, in both directions.

**Owner constraint (2026-10-25): the existing Razorpay setup is frozen** (not even a line or word changes; no new plans, prices or boost). Gifts replicate the Plus payment flow in new files under the label `gift_plan`, at the existing prices; KraftAI gets at most one additive catalog entry. Decisions made with the owner: Paire only; **the man must pay and the woman replies free** (the owner delegated the remaining calls; the recommended option applies to *all* of a woman's chats, including existing ones, once the switch is on).

## Today (verified in code)

- Likes: `swipe` creates a match only when the other person already liked (`swipes.ts`). Who-liked-me (`getLikesYou`) is Plus-only.
- Sending: `firestore.rules` `maySend` → `paidSendAllowed`: sender needs `moderation.chatAccess.unlimited` or `premiumUntil > now` (mirrored by the server from `chatUnlocks` / `billing`). Live since 2026-10-17, both sexes, no grace.
- Passes (`lib/razorpay.ts` `PLUS_PASSES`): day ₹35, week ₹99, month ₹399 (30 + 30 bonus days = 60 days), halfyear ₹799, lifetime ₹1,499. Unlimited Chat ₹49 once. Web checkout: Razorpay, hosted on kraftai.in (see `docs/kraftai-checkout.md`).

## Pieces (build in this order; each gets its own plan)

### A. Accept flow and woman-free replies  (`acceptFlow`, `womenSendFree`)

- **Accept screen.** With `acceptFlow` on, `getLikesYou` returns a free, un-locked "Likes for you" list **for women** only (photo, name, age, note, shared interests; same exclusions, verification and block filtering as today). Men keep the Plus-locked list.
- **Actions.** *Accept* calls a new `acceptLike({ targetUid })`: it re-checks the incoming like, verification, blocks and bans in one transaction, then creates the match through the same code path `swipe` uses (a shared helper extracted from `swipes.ts`, so there is one place that creates matches). *Not now* reuses the existing pass (`nope`). Swiping a liker back on Discover still matches instantly.
- **Who may accept.** Only the recipient of a pending like, and only a woman recipient in the free list. Men can still match by swiping.
- **Gate.** With `womenSendFree` on, the server mirrors `moderation.chatAccess.freeSender = true` for members whose profile gender is woman (and clears it when off). `paidSendAllowed` in the rules gains `|| (policy.get('womenSendFree', false) == true && access.get('freeSender', false) == true)`, so switching it off takes effect at once. The app learns the effective value from a new read-only `getSendPolicy` callable, so the purchase code is not edited. No extra document read. `chatAccess.ts` (`entitled`) and the app's `utils/chatAccess.ts` get the same term (parity tests already exist). Applies to all of a woman's chats, past and future.
- **Man's prompt.** In a chat he can't send in, the existing `ChatAccessCard` (Plus pass or the ₹49 unlock) is shown unchanged.
- **Woman's prompt.** A dismissible card on the new match: "See who likes you and be seen first with Paire Plus". It never blocks sending.

### B. Sponsorship / gifts (`giftSales`)

- **Who/what.** Either person in an **active match** can gift the other a **Day, Week or Month** pass: the existing plans at the existing prices (₹35, ₹99, ₹399 for 60 days). A woman can sponsor a man's messaging; a man can sponsor a woman's premium perks. Gifting never reveals the giver's payment details.
- **Payment (replicated, nothing edited).** `createGiftOrder({ matchId, plan })` creates a Razorpay order exactly as `createPlusOrder` does (server price, INR, hosted Checkout on kraftai.in) with `notes {plan, product: "gift_plan"}` and receipt `gift_plan_<plan>_<ts>`. The recipient is resolved on the server from the match. It is stored in its own `giftOrders/{orderId}` (never `razorpayOrders`), confirmed by a new `confirmGiftPayment` (signature check, then re-read from Razorpay) and a second webhook, `razorpayGiftWebhook`, with its own secret. Existing callables and the existing webhook are untouched and ignore gift orders.
- **KraftAI.** kraftai.in only opens products it knows, so it gets one additive entry: `gift_plan` for day/week/month at the existing prices, returning `kind=gift` so the existing return handler ignores it and a new `useGiftReturn` hook confirms it.
- **Claim.** On confirmed payment a `gifts/{orderId}` doc is `pending` and the recipient is notified: "Priya gifted you a week of Paire Plus". They tap **Accept gift** (`claimGift`), which extends their access through the existing `complimentaryPlusGrants` source: the gift starts when their current pass ends, and `syncPremium` mirrors it to the chat gate. They may **decline**. A gift unclaimed after **7 days**, or whose match ends, is **refunded automatically** through Razorpay. Nothing is redeemable for cash and gifts aren't transferable.
- **Abuse limits.** Max 3 gifts sent per member per day; no gifts to blocked, banned or unverified members or deleted accounts (a payment for a recipient who has since gone is refunded); not for a recipient with lifetime access.
- **Refunds/chargebacks.** A refund or lost dispute after the recipient claimed restores their previous complimentary expiry only if the gift is still the last extension; otherwise it is flagged for the owner. A purchased pass is never changed.
- **Audit.** `giftOrders` and `gifts` are kept after account deletion for accounting, like the other order collections.

## Switches and rollout

- New fields in `runtime/trust` (merged by `scripts/set-runtime-flags.mjs`, dry-run by default): `acceptFlow`, `womenSendFree`, `giftSales`. All default **false**; missing = off. `giftSales` also needs the existing payment-provider variables.
- Deploying changes nothing. Order when approved by the owner: `acceptFlow` → `womenSendFree` (then run the chat-access backfill so the rules see the flag) → `giftSales` (test cohort first, after the second Razorpay webhook and KraftAI entry are live).
- Rollback is switch-off for each piece; no data is lost.
- Needs the owner before going live: adding the second Razorpay webhook and its secret, deploying KraftAI first, legal review of Terms/Refunds for gifts and the 7-day refund, and a live payment test (already pending in `PROJECT_STATE.md`).

## Testing

- Unit: access model (`freeSender` in `maySend`, web and server parity), gift plan table (same prices and days as Plus), gift state machine (pending → claimed / declined / expired / refunded), gift limits.
- Security rules: a woman with `freeSender` can send without a pass; a man cannot; the flag cannot be written by clients; gift docs are server-only.
- Integration (emulators): like → woman accepts → match → man blocked from sending → woman or he gets a gift → claimed → man can send; accept races (double tap), blocked/banned/unverified accepts rejected.
- Browser pass on local emulators only (`docs/web-preview.md`), at phone and desktop widths. No production accounts, no real payments.
- `./scripts/verify.sh` green before each commit; each commit logged in `docs/web-changes.md`.

## Out of scope

Native apps, any change to existing Razorpay code, plans or prices, a new Monthly plan, a priority boost, auto-renewing subscriptions, money transfers between members, Verity (`us/`).
