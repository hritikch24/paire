# Accept a like, women reply free, and gifted Plus

Built on branch `feat/accept-and-sponsor` (2026-10-25/26). Local only: not pushed, not deployed. **Every switch is off**, so with nothing turned on Paire behaves exactly as before. Design: `docs/superpowers/specs/2026-10-25-accept-and-sponsor-design.md`.

## What it does

1. **Accept a like.** With `acceptFlow` on, a woman sees who liked her for free (a man's own "who liked me" list stays Plus-only) and can press **Accept** on a like or Super Like. The server (`acceptLike`) makes the match at once, with the same match document and "It's a match" push as a mutual swipe. Accepting is not a swipe: it uses none of her daily likes. Two taps or two tabs make one match. A like left over after a block, unmatch, ban or lost verification never matches.
2. **Women reply free.** With `womenSendFree` on, a woman sends free in all her chats, past and future. A man still needs Plus or Unlimited Chat to send. The Firestore send rule gets one extra OR term: the sender's mirror (`moderation/{uid}.chatAccess.freeSender`, set by `syncChatAccess` from her profile's gender) while the switch is on. `getSendPolicy` (read-only) tells the app the three switches and whether the caller sends free. Reading, receiving and safety actions were always free. **While the switch is on, a member's gender can't be changed by the client** (the rules refuse it); support changes it.
3. **Gifted Plus.** With `giftSales` on, a member can gift a match **1 day, 1 week or 1 month** of Plus (the existing passes at their existing prices: ₹35, ₹99, ₹399; the month is 60 days, as bought). Rules: an active match, not blocked, a verified and unbanned recipient who doesn't already have Lifetime, at most **3 gifts sent per member per day**. The recipient sees a banner on Matches and chooses **Accept gift** or **No thanks**. Nothing is granted until they accept. An unclaimed gift expires after **7 days** and is refunded; a decline, an ended match, or a recipient who is gone or banned also refunds. No cash value, no transfer, no cash-out.

How a gift is paid and delivered:

- It replicates the Plus flow (`docs/kraftai-checkout.md`). `createGiftOrder` makes the Razorpay order on Paire's server (INR, the plan's existing price, receipt `gift_plan_<plan>_<ts>`, notes `{plan, product: "gift_plan"}`, never a uid). Checkout opens on kraftai.in. `confirmGiftPayment` checks the signature, re-reads the payment from Razorpay and checks it matches the order before anything is recorded. A signed webhook finishes payments the browser never reported.
- Gift orders live only in `giftOrders/{orderId}` (server-only), never in `razorpayOrders`, so Plus accounting, revenue and the existing `razorpayWebhook` (which ignores orders it doesn't know) are untouched. The member-readable record is `gifts/{id}` (sender and recipient may read it; only status, plan, ids and dates).
- `claimGift` adds the days through the **existing complimentary-pass source** (`complimentaryPlusGrants/{uid}`, already read by `webPassBenefits`), starting when the recipient's current access ends, then runs the existing `syncPremium`. Nothing in billing was edited. A bought pass is never shortened.
- `declineGift`, the daily `expireGifts` sweep (04:15 IST) and `listGifts` complete the lifecycle. A claimed gift is taken back (`reverseGift`) when Razorpay refunds the payment or the giver loses a dispute.
- A gift already paid for can always be claimed, declined, refunded or expire, **even with `giftSales` off**.

## The three switches

All live in Firestore `runtime/trust`, default false, missing = off. `paid chat` itself (`enforcePaidChat`) is a separate, already-live switch; `womenSendFree` and gifts only matter while it is on.

| Switch | Command | Effect when on |
|---|---|---|
| `acceptFlow` | `--accept-flow on` | Women see likers free and can Accept. |
| `womenSendFree` | `--women-send-free on` | Women send free in every chat; gender locked for clients. |
| `giftSales` | `--gift-sales on` | "Gift premium" appears in chats and new gift orders open. |

## Order to turn them on

Run each with `node scripts/set-runtime-flags.mjs --project muse-352ba ... --confirm` (admin credentials; without `--confirm` it only prints what it would change; `--status` shows the current values). Do not skip ahead.

1. Deploy first (owner's call, nothing deployed yet): functions, rules and indexes (`firebase deploy --only functions,firestore`), then the web app. KraftAI is deployed before any gift sale (see the checklist below). All switches stay off.
2. **`--accept-flow on`.** Check with two test-cohort logins: a man likes a woman, she accepts, they match.
3. **`--backfill-free-sender --confirm`**, then review. Run it once without `--confirm` to see the counts ("Would mirror freeSender for N of M women"). It mirrors `freeSender` for every woman and clears the flag for anyone who is no longer one. **Review the members before the next step: gender is self-declared.** A man can pick "woman" at signup and would send free once `womenSendFree` is on. Check recent female signups, and remember that clients can't change gender while the switch is on, so fix mistakes first.
4. **`--women-send-free on`.** Check with a test woman (sends free) and a test man (still needs a pass). Announce it first if it changes what members expect.
5. **`--gift-sales on`, last,** and only after the Razorpay and KraftAI steps below. Start with the test cohort (the server only lets test-cohort accounts use test money outside the emulator, and a real account's payment needs the live key to be approved for Paire; see `docs/presence-and-paid-chat.md`).

## Rollback, per switch

- `--gift-sales off`: no new gift orders and the menu item disappears. Gifts already paid for still claim, decline, expire and refund. Nothing is lost.
- `--women-send-free off`: women need Plus or Unlimited Chat to send again, immediately (the rules read the switch). Gender can be edited again. The `freeSender` mirror flags are harmless while off. **Gift days already claimed stay.**
- `--accept-flow off`: `acceptLike` refuses, women's likes list is Plus-only again. Matches already made stay.
- Everything: `--accept-flow off --women-send-free off --gift-sales off`. No messages, matches or purchases are removed.

## Owner checklist: Razorpay and KraftAI

Gifts need a second Razorpay webhook, and KraftAI needs a small additive change. **The KraftAI change is on the sibling repo `../kanoon-simplified`, branch `feat/paire-gift-plan`, commit `ca5eeba`. It is not pushed or deployed.** It adds `gift_plan` for plan ids `day`, `week`, `month` at exactly the existing `PAIRE_PLANS` amounts (returning `kind=gift` to the app) and a relay at `/pay/notify/gift`. Existing products, prices and tests there are untouched.

1. **Set `PAIRE_FUNCTIONS_URL`** in KraftAI's Vercel environment: the Firebase functions base URL, no trailing slash. The relay forwards the webhook body unchanged to Paire's `razorpayGiftWebhook` and answers **503 until this is set**.
2. **Deploy KraftAI first,** before the Razorpay webhook is added and before Paire's gift sales go on. Razorpay disables a webhook that keeps failing for about 24 hours, so the URL must already work.
3. **Add the second webhook** in the Razorpay dashboard (Settings, Webhooks), URL `https://kraftai.in/pay/notify/gift`. Events: `payment.captured`, `refund.processed`, `payment.refunded` and `payment.dispute.*`. Use the **same webhook secret value as the existing Plus webhook**: `razorpayGiftWebhook` binds the existing `RAZORPAY_WEBHOOK_SECRET`, and no new secret exists or is needed. The existing Plus webhook is not changed.
4. Deploy Paire's functions (`razorpayGiftWebhook` is a new function).
5. **One real low-value test payment and refund** on the approved merchant account (the day pass, ₹35), claimed by a test recipient, then refunded from the Razorpay dashboard. Confirm the gift shows "Taken back" for the recipient and the refund is recorded on the order. Do this before opening gifts to anyone else.
6. Legal review of the gift terms below. The live Terms, Refund and Privacy pages in `apps/web` were **not** edited.

## What the buyer and Razorpay see

Gift checkout uses the Plus wording: the buyer pays on kraftai.in, the Razorpay window says "KraftAI" and the same plan description a Plus buyer sees (for example "KraftAI Plus" with the plan label). Razorpay's dashboard shows an INR order for the plan's price with receipt `gift_plan_<plan>_<ts>` (for example `gift_plan_week_1793000000000`) and notes `{plan: "week", product: "gift_plan"}`. No member id or name is in the order. The bank statement line is whatever the merchant account is registered as, as for Plus.

## Existing files that were edited, and why

Everything else in `git diff --stat e048aea..HEAD` is a new file (gift/accept functions and libs, new components, hooks, services, tests and docs). Edited files that existed before:

- `firebase/functions/src/lib/chatAccess.ts`: three new fields in the parsed policy (`acceptFlow`, `womenSendFree`, `giftSales`), a `freeSender` field on the mirror type and one extra term in the send-gate function. No existing value changes.
- `firebase/functions/src/chatEntitlement.ts`: `syncChatAccess` also writes the `freeSender` mirror (from gender); no existing value changes.
- `firebase/functions/src/swipes.ts`: uses the shared match-creation helper (`lib/matchDoc.ts`) that `acceptLike` also uses; behaviour identical.
- `firebase/functions/src/likes.ts`: the likes list is free for a woman when `acceptFlow` is on and returns `acceptable`.
- `firebase/functions/src/index.ts`: exports the new functions.
- `firebase/rules/firestore.rules`: one extra OR term in `paidSendAllowed`; the gender lock on user updates (while `womenSendFree` is on); new `giftOrders` (no client access) and `gifts` (sender and recipient read, no client writes) blocks.
- `firebase/rules/firestore.indexes.json`: one index for the 3-a-day gift count (`giftOrders` by `fromUid`, `createdAt`).
- `firebase/functions/test/chatAccess.test.ts`: the two `parseChatPolicy` default expectations list the three new switches (still false). The only existing test edited. `firebase/test/firestore.rules.test.ts` only gained tests.
- `scripts/set-runtime-flags.mjs`: `--accept-flow`, `--women-send-free`, `--gift-sales`, `--backfill-free-sender`; `scripts/verify.sh` also runs the script tests.
- Browser app (`apps/muse-mobile/src`): `LikesYouRow.tsx`, `LikesGalleryScreen.tsx`, `MatchesScreen.tsx`, `ChatScreen.tsx` (Accept buttons, women's free composer, the gift menu item and banner, web only), `MatchMoment.tsx` (a free-sending woman sees no pay copy), `EditProfileScreen.tsx` and `Chip.tsx` (gender choice disabled while the lock applies), `discoveryService.ts` (`acceptLike`, `acceptable`), `AppStack.tsx` (one new hook call, `useGiftReturn`, before the existing return hook).
- `docs/web-changes.md`, `docs/superpowers/plans/2026-10-25-accept-and-sponsor.md`: log and plan.

### No existing Razorpay or price file changed

Verify with this command; it must print nothing:

```
git diff --name-only e048aea..HEAD -- firebase/functions/src/razorpay.ts firebase/functions/src/razorpayClient.ts firebase/functions/src/chatAccess.ts firebase/functions/src/billing.ts firebase/functions/src/ccavenue.ts firebase/functions/src/upiPayments.ts firebase/functions/src/lib/razorpay.ts firebase/functions/src/lib/kraftai.ts firebase/functions/src/lib/checkout-products.ts firebase/functions/src/lib/payment-names.ts firebase/functions/src/config.ts apps/muse-mobile/src/services/billingService.ts apps/muse-mobile/src/services/chatAccessService.ts apps/muse-mobile/src/hooks/useKraftaiReturn.ts apps/muse-mobile/src/screens/PremiumScreen.tsx apps/muse-mobile/src/components/ChatAccessCard.tsx apps/muse-mobile/src/utils/chatAccess.ts apps/muse-mobile/src/config/premium.ts
```

The end-to-end test `firebase/functions/integration/acceptAndSponsor.integration.test.ts` also asserts that `razorpayOrders`, `chatUnlockOrders` and `chatUnlocks` have no new or changed document, and that a gifting woman gets no `billing` document, across the whole accept, reply, gift, claim and switch-off story.

## Known limits (tell the owner and, where it affects buyers, the terms)

- **A gifted Month gives 60 days of Plus but not unlimited regular likes.** A bought Month does. Gifts add days through the complimentary source, which `webPassBenefits` treats as Plus access without the bought-pass like benefit.
- **A pass bought after a gift is claimed makes a later reversal ineffective.** Access is the maximum of the expiries (inherited model), so if the giver is later refunded after the recipient bought their own longer pass, the reversal finds the grant no longer ends where the gift put it and flags the gift for review instead of shortening anything. Likewise a refunded earlier purchased pass keeps its days through the gift's end.
- **Any refund takes back the whole gift,** even a partial one, as the existing refund policy does for Plus and Unlimited Chat.
- **The 3-a-day gift limit is soft.** Only paid gifts count, so a member can have several unpaid checkouts open; the existing 20-a-day order quota caps it.
- **Refund failures on decline or expiry are not retried automatically,** except that the daily sweep retries refunds stuck on orders that were orphaned or rejected, and gifts marked for refund by a crash. A refund that Razorpay rejects is recorded on the order (`refundError`) for support. Watch `giftOrders` for `refundError`, `needsReview` and `refundDue`.
- **Support sessions can see a woman's likers when `acceptFlow` is on** (the likes list is free for her, and support reads it as her).
- **The giver's notification is generic when previews are off** ("Your gift was accepted."); with previews on it carries the recipient's first name.
- **UPI late completion:** if the buyer closes the window or the return says "The payment didn't go through, and you weren't charged", a UPI payment can still complete a little later. The webhook then delivers the gift and the recipient sees it, with no further action from the giver. The toast wording does not say this.
- Closing the gift sheet during checkout and reopening it can start a second unpaid order for the same gift (an open one is reused for 6 hours on the server, and per-day limits apply).
- Gender is self-declared (see step 3 above).
- Gifts are web-only: the menu item, banner and return handling are behind `Platform.OS === "web"`. Android and iOS were not touched.

## DRAFT: Terms and Refund wording for legal review

Text only. Not published. The live Terms, Refund and Privacy pages in `apps/web` are unchanged and need legal review before `giftSales` goes on.

> **Gifts.** You can buy a Paire Plus pass (1 day, 1 week or 1 month, at the price shown) as a gift for someone you are matched with. The gift is delivered to them as a notification and is theirs to accept or decline. A gift has no cash value, can't be exchanged for money, and can't be transferred or redeemed by anyone else.
>
> **If a gift isn't accepted.** If the person declines, or hasn't accepted within 7 days, or the match ends, or they can no longer receive it, we refund the amount you paid to the original payment method. Refunds are issued by our payment processor and can take several working days to reach you.
>
> **If a gift is accepted.** Once accepted, the pass starts when the recipient's current Plus access ends and the recipient can't return it for a refund. [Owner and legal to confirm: whether the giver can still be refunded after acceptance. Today a refund issued by Razorpay takes the gift back.]
>
> **Refunds and chargebacks.** If a payment for a gift is refunded, in full or in part, or a chargeback or dispute is decided against us, the whole gift ends and any days not yet used are taken back. This does not shorten a pass the recipient bought themselves.
>
> **Limits.** You can send up to 3 gifts a day. We may refuse or cancel a gift to protect members, to prevent fraud or abuse, or where a match has ended or a member has been blocked, in which case you are refunded.
