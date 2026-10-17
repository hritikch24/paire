# Presence and paid chat

Two features, each behind its own switch, both **off** until you turn them on:

1. **Activity-based presence**: "Online" and an approximate "Active 3 h ago" for your matches.
2. **Paid sending**: sending messages needs your own **Paire Plus** pass or **Unlimited Chat** (₹49 once, account-wide, no expiry).

**Status (2026-10-17): live in production.** ₹49 Unlimited Chat is now paid **by UPI into paire.in@ybl** (Razorpay sales for it are off; see "Unlimited Chat by UPI" below). At the owner's request, presence, the sending gate (from 01:29 IST, no grace period) and live ₹49 Unlimited Chat sales are all on. The code ships with every switch off; each was set on purpose with `scripts/set-runtime-flags.mjs` and the functions `.env`. Roll back with `--paid-chat off`, `--unlock-sales off` or `--presence off`.

## Switches and configuration

### Runtime switches (Firestore, admin-only)

Clients can't read or write `runtime/*`. Change them with `scripts/set-runtime-flags.mjs` (dry run unless `--confirm`). The paid-chat fields live in `runtime/trust` because the rules already read that document: a separate document would push four-person Duo sends past Firestore's 10-read limit. `scripts/set-trust-policy.mjs` therefore merges, and anything else that writes `runtime/trust` must too.

| Document | Field | Default (missing) | Meaning |
|---|---|---|---|
| `runtime/presence` | `enabled` | `false` | Presence is collected and shown. |
| | `idleTimeoutMs` | `120000` (2 min) | Offline after this long without a meaningful interaction. Allowed range: 10 s to 30 min. |
| | `leaseMs` | `90000` | A session lapses this long after its last heartbeat. Clients heartbeat every `leaseMs / 2` while active. Range: 10 s to 10 min. |
| `runtime/trust` (paid-chat fields, next to `requireVerification`) | `enforcePaidChat` | `false` | Master switch for the sending gate (rules and app). |
| | `enforceFrom` | `0` | Server ms when the gate starts. Use the date you announced. |
| | `legacyGraceUntil` | `0` | Chats created before `enforceFrom` can keep sending free until this time. `0` means no grace period. |
| | `unlockSales` | `false` | Unlimited Chat can be bought. This also needs the environment variables below. |

```
node scripts/set-runtime-flags.mjs --project muse-352ba --status
```

### Cloud Functions environment (`firebase/functions/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `MUSE_CHAT_UNLOCK_ENABLED` | `false` | Deploy-time kill switch for selling Unlimited Chat. |
| `MUSE_CHAT_UNLOCK_LIVE` | `false` | **Explicit approval to sell with a `rzp_live_` key.** Without it, live keys can't open a single checkout. |
| `MUSE_BILLING_SANDBOX` | `false` | Allows selling with a `rzp_test_` key. Outside the emulator, a test-mode payment can only unlock **test-cohort** accounts (`moderation/{uid}.cohort = "test"`). Real accounts can't be unlocked with test money. |
| `RAZORPAY_KEY_ID` + secrets `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | existing | Same Razorpay setup as Plus. Every order records its key's mode (`test` or `live`). A payment from one mode never confirms an order from the other. |
| `MUSE_BILLING_ENABLED` | existing | Plus (and therefore "Plus includes messaging"). Unchanged. |

### Razorpay dashboard

Keep the existing webhook (`razorpayWebhook`) and add these events: **`payment.dispute.created`, `payment.dispute.lost`, `payment.dispute.won`, `payment.dispute.closed`** (for chargebacks). `payment.captured` and `refund.processed` are already required. Unlimited Chat and Plus orders are kept in separate collections, so the same webhook serves both and can't grant one for the other.

### Indexes

`firebase/rules/firestore.indexes.json` gains one composite index: `matches(participants CONTAINS, kind, active)`, used for Duo chat presence. Deploy it with the rules (`firebase deploy --only firestore`).

## Feature 1: presence

**Definition.** A member is online while at least one of their sessions (a browser tab or app process) is:

1. in the foreground,
2. within `idleTimeoutMs` of its last meaningful interaction, and
3. within `leaseMs` of its last heartbeat.

All three are checked against server timestamps every time presence is read. Nothing waits for TTL deletion.

**What counts as activity.** Opening or foregrounding Paire, taps, clicks, wheel and touch scrolling, key presses (any text field, plus web `keydown`), touches anywhere in the app, and moving between screens. Raw `scroll` events don't count, because pages also scroll themselves. A tab or app started in the background isn't activity until it's brought forward. Only the *moment* is recorded, never what was typed or tapped. Nothing is captured outside Paire, and there are no screenshots. Interactions only update a number in memory (`services/presenceSession.ts`): no React state and no network write per event.

**Writes (`presenceBeat` callable).** A session reports `idleMs`: how long ago the last interaction was, measured on the device's monotonic clock. The server converts it to its own time, so device clocks and reconnections don't matter, and nothing queued offline can claim activity "now". A session beats when it starts, every `leaseMs/2` while the person is active, immediately when they come back after going idle (at most every 5 s), and once when it goes to the background or ends. **Heartbeats stop once the person has been idle for the timeout**, so an open tab can't keep anyone online. Repeats within 5 s are ignored server-side. Beats are numbered, so a late "active" can't override a newer "background". Up to 10 sessions are kept per member, and stale sessions are pruned.

**Storage.** `presence/{uid}` (server-only) holds `sessions.{id}` (`platform`, `foreground`, `activeAt`, `heartbeatAt`, `createdAt`) and `lastActiveAt`, which is kept separate from the heartbeat time. Members can only write their own sessions, through the callable under their own uid.

**Reads (`getPresence` callable).** The caller can ask about at most 50 people. It answers only for people the caller shares an **active** one-to-one match or Duo chat with. Blocking or unmatching ends the match, so it ends visibility too. Everyone else, hidden members, banned members and missing data all get the same answer: `unavailable`. It also re-checks each member's setting and ban, so a missed clean-up never shows anything. Online status returns `onlineUntil`, rounded down to 5 s so polling can't rebuild exact tap times. Offline status returns an approximate last-active time (5-minute steps within the hour, then hours, then days, and nothing after 30 days).

**Privacy setting.** Settings → Privacy → **"Show when I'm active"** (`settings.showPresence`, default on). It appears once presence is enabled. Turning it off:
- deletes `presence/{uid}`, and the server stores nothing more;
- removes `lastActiveAt` from the member's profile, so matches can't read it from `users/{uid}` (and takes it out again if an older app or another device writes it back);
- hides "Active today" and the matching reason on their discovery, likes and Duo cards (`discovery.presenceHidden`).

Discovery ordering still uses recency, kept server-side through `touchActivity` and **only to the hour**, so feed order and paging cursors reveal no more than that. Bans and account deletion erase presence too.

**UI.** A small green dot on one-to-one matches in the Matches list (up to 50, polled every 60 s while the tab is focused). In a one-to-one chat header: "Online" or "Active 2 h ago" (polled every 30 s). In a Duo chat header: "· 2 online". When an online window ends, the status updates by itself on a timer, without a new database event. A stale or unknown answer shows nothing rather than "Online". Presence is never used as a read receipt: "Seen" still comes only from `lastReadAt`.

**Limits.** Duo pairs' own `lastActiveAt` (which orders the Duo deck) still reflects both friends' Duo browsing. Others see someone come online after up to one poll interval (30 to 60 s). Background and close signals are best effort, so a crashed tab stays online for at most `min(idle timeout, lease)` after its last beat. Native background suspension follows the OS. Cost is about 80 `presenceBeat` calls per active member-hour, plus polling while the Matches tab or a chat is open.

## Feature 2: who may send

**One model** (`firebase/functions/src/lib/chatAccess.ts`, mirrored in `firestore.rules` and `apps/muse-mobile/src/utils/chatAccess.ts`):

```
may send = the gate is off (or before enforceFrom)
        || the sender owns Unlimited Chat
        || the sender's Paire Plus pass is still running
        || the chat was created before enforceFrom and legacyGraceUntil hasn't passed
```

- Only the **sender's** access counts. Receiving, reading, marking read, unmatching, blocking, reporting, leaving a Duo, account deletion and safety support stay free. A paying member can message someone unpaid. An unpaid recipient can read but must get Plus or their own unlock to reply.
- Payment never bypasses the existing checks, and the rules still evaluate them first: an active mutual match, participant-only access, blocks (which end the match), bans, email and photo verification, and "I'll message first".
- **Enforced in the Firestore rules** for both halves of the atomic send batch: the message create and the match preview/unread update. A lone message, a lone preview bump and a direct SDK write are all refused. A disabled Send button is only a courtesy. There is no server endpoint that writes member-authored messages. Server-authored system notices ("Riya left the chat") use the Admin SDK and keep working.
- **Rules access budget.** A four-person Duo chat already reads every member's moderation record, so the server mirrors each member's access onto `moderation/{uid}.chatAccess = { unlimited, premiumUntil }`, which the rules read anyway. The worst case (four verified members, gate on) is covered by a rules test. The sources of truth stay `chatUnlocks/{uid}` and `billing/{uid}`. Expiry is checked against `request.time`, so a Plus pass that runs out locks sending without any write.
- **Premium.** Every existing Plus benefit is unchanged, and Plus now also includes messaging while it runs. When Plus expires, sending locks unless the member also owns Unlimited Chat. Buying Plus never touches Unlimited Chat. Unlimited Chat never grants Plus's likes, priority or filters (`limitsFor` reads only `billing/{uid}`).
- **App.** `getChatAccess` returns authoritative state, refreshed on focus, when a pass expires, and after purchases. Because it's tied to the account, it follows the member to any device they sign in on.

### Unlimited Chat purchase (web, Razorpay)

| Step | What happens |
|---|---|
| Offer | Only after the member's first server-created mutual match. Also needs sales on, a confirmed email and the photo check (when required), and an account that isn't banned. Already owned: never offered or charged again. |
| `createChatUnlockOrder` | The server creates a 4,900-paise INR order for product `paire_unlimited_chat`, bound to the caller's uid, and records it in `chatUnlockOrders/{orderId}` with its Razorpay mode. Client-sent amounts, uids or products are ignored. One checkout at a time: a second tab or a retry reuses the same open order, and an order that is paid or still settling returns `owned` or `pending` instead of a new order. |
| Checkout | Razorpay Checkout shows "Paire", with description "Paire Unlimited Chat · one-time ₹49 unlock". |
| `confirmChatUnlock` | Checks the Checkout signature, the order's owner and mode, then **re-reads the payment from Razorpay**: this order, 4,900 paise, INR, `captured`, never refunded. Authorised payments are `pending`. |
| `razorpayWebhook` | The same grant from signed `payment.captured` events (closed tabs, slow UPI). Duplicate or late events are idempotent. |
| Grant | One transaction writes `chatUnlocks/{uid}` (the doc id is the uid, so one entitlement per account) and marks the order `paid`. A second captured payment on an order that's already paid (a late-captured earlier attempt) is recorded in `extraPaymentIds` and refunded. Its own refund or dispute events never touch the unlock. A second captured payment for an account that already owns it is marked `duplicate` and **refunded automatically**. A payment for a deleted account is `orphaned` and refunded. A test-mode payment for a real account is `rejected`. Bans are never changed. |
| Refund or chargeback | `refund.processed`/`payment.refunded` mark the order `refunded`. `payment.dispute.lost` marks it `chargeback`. Either way, the unlock is revoked only if *that* payment paid for it. Plus is never touched. `dispute.created` only flags the order. |
| Audit | `chatUnlockOrders` keeps every order (uid, amount, currency, product, mode, payment id, status, timestamps) and is retained after account deletion, like `razorpayOrders`. |

App states (`components/ChatAccessCard.tsx`): the two choices ("Get Paire Plus" and "Unlock unlimited chats — ₹49 once"), plus loading, pending ("Payment received… you won't be charged again" with *Check payment status*), failed, cancelled (*Check payment status*, for UPI payments that finish after the window closes) and success (a toast; the composed message stays in the box and **needs a deliberate Send**). Payment never opens by itself. Drafts survive checkout, cancellation and leaving the chat for the app session. "Close kindly" falls back to a plain unmatch for members who can't send.

**Android/iOS.** The ₹49 unlock isn't sold in the native app. Play policy would require Play Billing and a `paire_unlimited_chat` product, which aren't built. An unlock bought on the web works in the app automatically, and native members can still get Plus through the store.

## Existing members and existing conversations

Decide this before switching the gate on. The recommended policy, which the switches support:

1. **Deploying changes nothing.** The gate, sales and presence are all off.
2. **History is never removed.** Every existing conversation stays readable by both people, forever.
3. **Existing purchases are kept.** Plus passes keep every benefit and now include messaging. Run `--backfill-chat-access` before enforcement so the rules see current holders straight away (it mirrors `billing.expiresAt` as-is; only run it with `MUSE_BILLING_ENABLED=true`). (`getChatAccess` also repairs this on the next app open.) No Unlimited Chat purchases exist yet.
4. **Announce first.** Set `--paid-chat on --enforce-from <date at least 14 days out>`. Until that date sending stays free. The app shows the date in every chat and on the Plus screen, and the updated website, terms and refund policy go live with the announcement (email members yourself as well).
5. **Optional grace for existing chats.** `--legacy-grace-days 7` lets conversations that existed before the cutoff keep sending free for a week after it. Matches made after the cutoff need access from the start.
6. **After the cutoff,** unpaid members can still read, mark read, unmatch, block, report and leave Duo chats. To reply, they get Plus or Unlimited Chat.
7. **Optional goodwill grant:** to give early members Unlimited Chat, write `chatUnlocks/{uid} = { status: "active", source: "grant", grantedAt }` with the Admin SDK, then re-run the backfill. This is your call; nothing does it automatically.

**Rollback:** `--paid-chat off` makes sending free again at once. No data is lost and nobody is charged. `--presence off` stops collection and display, and the app stops beating on its next foreground.

## Rollout order

1. Deploy functions, rules and indexes (`firebase deploy --only functions,firestore`) and the web app. Every switch stays off.
2. **Presence:** `--presence on` for test accounts first, by checking with two test-cohort logins. Then leave it on.
3. **Sandbox payments:** on a staging project (or the emulator), set a `rzp_test_` key, `MUSE_BILLING_SANDBOX=true`, `MUSE_CHAT_UNLOCK_ENABLED=true` and `--unlock-sales on`. Buy with Razorpay test cards and UPI on test-cohort accounts only. Check refunds, a disputed test payment and a closed-window UPI payment.
4. **Merchant approval** (see below). Only after Razorpay approves a merchant account for Paire: put that account's live key in place and set `MUSE_CHAT_UNLOCK_LIVE=true`.
5. Announce (step 4 above), then deploy the website copy. Run `--backfill-chat-access`, then set `--paid-chat on --enforce-from …` and `--unlock-sales on`.
6. Watch `chatUnlockOrders` for `duplicate`, `orphaned`, `rejected` and `refundError`, and the functions logs for `Unlimited Chat`.

## Before charging anyone (needs you)

- **Merchant account.** `firebase/functions/.env`'s live `RAZORPAY_KEY_ID` is the same key used by the `kanoon-simplified` project. Production Unlimited Chat (and Paire Plus) payments must go through a Razorpay merchant account approved for **Paire**: business name, `paire.in` website, and dating as the declared category. They must not run under another product's account. `MUSE_CHAT_UNLOCK_LIVE` stays `false` until then.
- **Legal review** of the updated Terms §4A, the Refund policy and the Privacy policy (online status), which still contain placeholders. Also the GST treatment of the ₹49 price and Razorpay receipt settings.
- **Razorpay webhook events** for disputes (above).
- **Refund monitoring.** Automatic refunds that fail are recorded in `refundError` / `extraRefundErrors` on the order for support to finish by hand; nothing retries them yet. Any refund, full or partial, ends the unlock, as the refund policy says.
- **Calls** (`callRooms`) aren't gated by paid chat. Calls are off today; decide before enabling them.
- **Native billing** (optional): a Play product plus server support, if the unlock should be sold inside the Android app.

## Tests

- `firebase/functions/test/presence.test.ts`, `test/chatAccess.test.ts`: the presence state machine (idle, hidden, foreground, multiple sessions, crash, reconnect, clock skew, pruning, approximate last-active) and the entitlement and payment-verification rules.
- `firebase/test/firestore.rules.test.ts` ("paid chat", "presence privacy"): direct writes under the gate, Plus or unlock or expiry, paid → unpaid, read without paying, grace period, blocks, bans, verification, first-move, the Duo access budget, and clients unable to forge access or read presence.
- `firebase/functions/integration/presenceAndPaidChat.integration.test.ts`: through the Functions emulator and the client SDK. Visibility (matches only, hidden, blocked, banned), idle expiry without a new write, multi-device, logout, direct sends refused, paid → unpaid, safety actions free, system notices, and sales off.
- `firebase/functions/integration/chatPayments.integration.test.ts`: in-process against the Firestore emulator with a **fake Razorpay test-mode API**. Server price and owner, forged signatures, other people's orders, wrong amounts, currencies and environments, test money vs real accounts, pending then delayed webhook, reconcile after a closed window, idempotent webhooks, concurrent checkouts, an automatically refunded duplicate, refund vs Plus, Plus expiry vs unlock, refund before capture, chargebacks, and deleted or banned accounts.
- `apps/muse-mobile/__tests__/presence.test.ts`, `__tests__/chatAccess.test.ts`: the client session engine (no beats while idle or hidden, no write per interaction) and the send gate and drafts.

**Not yet verified:** a real Razorpay sandbox run (needs test keys), live Razorpay webhooks and disputes, native background behaviour on real Android and iOS devices, and any production behaviour.

## Unlimited Chat and Paire Plus by UPI (live)

Paid straight into Paire's own UPI ID (`MUSE_UPI_VPA`, `MUSE_UPI_PAYEE_NAME` in the functions `.env`; switch: `runtime/trust.upiSales`, `--upi-sales on|off`). There's no gateway, so payments are confirmed by a person until the bank's merchant API is connected:

1. `createUpiUnlockOrder` gives the buyer one open order with a **unique amount** (₹49.01–₹49.99, held 48 h in `upiSlots`), a reference like `K7P2M9QX`, a QR code and a `upi://pay` link. Reopening shows the same order, never a second one.
2. After paying, the buyer enters the 12-digit **UTR** (`submitUpiPayment`). Each UTR can be used once across all accounts (`upiUtrs`). The order becomes `submitted`, and the app shows "confirming your payment".
3. A moderator opens **Settings → UPI payments to confirm** (accounts with the `moderator` claim) and approves only if the amount, paise included, and the UTR appear in the bank statement. Approval writes `chatUnlocks/{uid}` (`source: "upi"`), and chat unlocks. **Reject** frees the UTR. **Revoke** ends an approved unlock after a manual refund.

Records: `upiUnlockOrders/{orderId}` (uid, amount, UTR, status, reviewer, timestamps), kept like other payment records. Refunds are made by hand from the bank or UPI app, then revoked in the app. Limits: India only (UPI); confirmation waits for a person; Google Pay can refuse `upi://` links to personal IDs, but scanning the QR still works.

**CCAvenue (2026-10-17, off).** Unlimited Chat and Plus can also be paid through CCAvenue (cards, UPI, netbanking, wallets), behind `runtime/trust.ccavenueSales` (`--ccavenue-sales on|off`) and `MUSE_CCAVENUE_ENABLED`. See `docs/ccavenue.md`.

**Paire Plus by UPI (2026-10-17).** `createUpiUnlockOrder({ plan })` sells a Plus pass the same way: the plan's price plus unique paise, and moderator approval. Approval queues the pass after any running pass (`webPassLedger`), and `webPassExpiry` counts approved UPI Plus orders. Revoke recomputes the queue. New Razorpay Plus checkouts are off (`runtime/trust.razorpayPlusSales: false`, `--razorpay-plus off`); payments taken earlier still confirm and refund.
