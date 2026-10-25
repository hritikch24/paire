# Paire: accept likes, man pays to message, sponsorship

Status: draft for owner review (2026-10-25). Scope: Paire (paire.in, web). Android/iOS untouched.
Everything ships behind switches that stay **off** until the owner says go. See `docs/presence-and-paid-chat.md` and `docs/kraftai-checkout.md` for the systems this builds on. **All payments use the existing Razorpay setup** (owner, 2026-10-25).

## Intent (what the owner asked)

1. When a man sends a woman a like, she can **accept** it. Accepting creates the match.
2. After a match the **man is asked for premium** to send messages. **Monthly is the preferred offer**; also offer 2 months, week, day, and a priority option.
3. Women also see premium offers at match time, but are not blocked.
4. If one person has premium and the other doesn't, either can **sponsor (gift) premium** to the other, in both directions.

Decisions made with the owner: Paire only; **the man must pay and the woman replies free** (the owner delegated the remaining calls; the recommended option applies to *all* of a woman's chats, including existing ones, once the switch is on).

## Today (verified in code)

- Likes: `swipe` creates a match only when the other person already liked (`swipes.ts`). Who-liked-me (`getLikesYou`) is Plus-only.
- Sending: `firestore.rules` `maySend` → `paidSendAllowed`: sender needs `moderation.chatAccess.unlimited` or `premiumUntil > now` (mirrored by the server from `chatUnlocks` / `billing`). Live since 2026-10-17, both sexes, no grace.
- Passes (`lib/razorpay.ts` `PLUS_PASSES`): day ₹35, week ₹99, month ₹399 (30 + 30 bonus days = 60 days), halfyear ₹799, lifetime ₹1,499. Unlimited Chat ₹49 once. Web checkout: Razorpay, hosted on kraftai.in (see `docs/kraftai-checkout.md`).

## Pieces (build in this order; each gets its own plan)

### A. Accept flow and woman-free replies  (`acceptFlow`, `womenSendFree`)

- **Accept screen.** With `acceptFlow` on, `getLikesYou` returns a free, un-locked "Likes for you" list **for women** only (photo, name, age, note, shared interests; same exclusions, verification and block filtering as today). Men keep the Plus-locked list.
- **Actions.** *Accept* calls a new `acceptLike({ targetUid })`: it re-checks the incoming like, verification, blocks and bans in one transaction, then creates the match through the same code path `swipe` uses (a shared helper extracted from `swipes.ts`, so there is one place that creates matches). *Not now* reuses the existing pass (`nope`). Swiping a liker back on Discover still matches instantly.
- **Who may accept.** Only the recipient of a pending like, and only a woman recipient in the free list. Men can still match by swiping.
- **Gate.** With `womenSendFree` on, the server mirrors `moderation.chatAccess.freeSender = true` for members whose profile gender is woman (and clears it when off). `paidSendAllowed` in the rules gains `|| access.get('freeSender', false) == true`. No extra document read. `chatAccess.ts` (`entitled`) and the app's `utils/chatAccess.ts` get the same term (parity tests already exist). Applies to all of a woman's chats, past and future.
- **Man's prompt.** In a chat he can't send in: "Get premium to message her". Month is pre-selected (see B). Existing `ChatAccessCard` is reused.
- **Woman's prompt.** A dismissible card on the new match: "See who likes you and be seen first with Paire Plus". It never blocks sending.

### B. Plan ladder and Priority boost

Existing prices and keys are **not changed** (existing orders and webhooks keep working). Additions:

| On screen | Key | Days | Price | Note |
|---|---|---|---|---|
| **Month** (default, "Most popular") | `monthly` (new) | 30 | ₹249 | proposed; needs a new entry in KraftAI's hosted-checkout catalog |
| 2 months | `month` (existing) | 30 + 30 bonus | ₹399 | relabelled; best per-day value |
| Week | `week` | 7 | ₹99 | unchanged |
| Day | `day` | 1 | ₹35 | unchanged |
| Priority boost (add-on) | `boost` (new) | 1 | ₹49 | proposed; priority placement only, no messaging; needs a new entry in KraftAI's hosted-checkout catalog |
| More: 6 months / lifetime | `halfyear`, `lifetime` | | ₹799 / ₹1,499 | unchanged, under "More plans" |

- All prices are server-side only (`PLUS_PASSES` in `lib/razorpay.ts` plus the mirrored checkout product table). The two new prices are **proposals for the owner to confirm**.
- `boost` stacks on `billing` like other passes but sets only a priority window (`priorityUntil`), so it never grants messaging or like limits. `limitsFor` reads it for ordering.
- Per-day prices stay shown on every plan.

### C. Sponsorship / gifts (`giftSales`)

- **Who/what.** Either person in an **active match** can gift the other a **Day, Week or Monthly** pass (new gift sizes; no lifetime/boost gifts). A woman can sponsor a man's messaging; a man can sponsor a woman's premium perks. Gifting never reveals the giver's payment details.
- **Flow.** `createGiftOrder({ matchId, plan })` (server prices it, binds `fromUid`, `toUid`, plan; client amounts ignored) → a Razorpay order for the plan's normal Plus product and price (so the hosted kraftai.in checkout needs no change), stored in `giftOrders/{orderId}` and never in `razorpayOrders` → on confirmed payment a `gifts/{id}` doc is created `pending` and the recipient is notified: "Priya gifted you a week of Paire Plus".
- **Claim.** The recipient opens it and taps **Accept gift** (`claimGift`), which transactionally adds the pass to *their* `billing` and mirrors `chatAccess`. They may **decline**. A gift unclaimed after **7 days** (or if the match ends) is **refunded automatically** through the existing refund path. Nothing is ever redeemable for cash and gifts are not transferable.
- **Abuse limits.** Max 3 gifts sent per member per day; no gifts to blocked/banned/unverified members or to deleted accounts (an order for a deleted recipient is refunded, as `orphaned` is today); a gift can't be bought for someone who already has an active pass of equal or longer remaining time (the app says so before payment).
- **Refunds/chargebacks.** A refunded or charged-back gift order revokes the recipient's added days only if that gift added them, mirroring the Unlimited Chat revoke logic.
- **Audit.** `giftOrders` and `gifts` are kept after account deletion for accounting, like the other order collections.

## Switches and rollout

- New fields in `runtime/trust` (merged by `scripts/set-runtime-flags.mjs`, dry-run by default): `acceptFlow`, `womenSendFree`, `giftSales`. All default **false**; missing = off. `giftSales` also needs the existing payment-provider variables.
- Deploying changes nothing. Order when approved by the owner: `acceptFlow` → `womenSendFree` (then run the chat-access backfill so the rules see the flag) → plan ladder visible → `giftSales` (test cohort and sandbox first).
- Rollback is switch-off for each piece; no data is lost.
- Needs the owner before going live: confirming the two new prices, legal review of Terms/Refunds for gifts and the 7-day refund, and a live payment test (already pending in `PROJECT_STATE.md`).

## Testing

- Unit: access model (`freeSender` in `maySend`, web and server parity), plan table (days/prices/boost doesn't grant messaging), gift state machine (pending → claimed / declined / expired / refunded), gift limits.
- Security rules: a woman with `freeSender` can send without a pass; a man cannot; the flag cannot be written by clients; gift docs are server-only.
- Integration (emulators): like → woman accepts → match → man blocked from sending → woman or he gets a gift → claimed → man can send; accept races (double tap), blocked/banned/unverified accepts rejected.
- Browser pass on local emulators only (`docs/web-preview.md`), at phone and desktop widths. No production accounts, no real payments.
- `./scripts/verify.sh` green before each commit; each commit logged in `docs/web-changes.md`.

## Out of scope

Native apps, auto-renewing subscriptions, money transfers between members, men-only/women-only pricing differences beyond the send gate, Verity (`us/`).
