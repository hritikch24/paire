# CCAvenue payments

Unlimited Chat (₹49 once) and Paire Plus passes (₹20 / ₹99 / ₹299) can be paid through **CCAvenue** on the web: cards, UPI, netbanking and wallets. It sits next to the existing methods (UPI into paire.in@ybl, and the Razorpay code that's switched off) and is **off** until you turn it on.

Web only. The Android/iOS apps are unchanged.

## How a payment works

1. **`createCcavenueOrder`** (callable). The server picks the product and price, binds the order to the caller and records `ccavenueOrders/{orderId}` (`PA` + 14 characters, `mode` test/live, `status: created`). It encrypts the request with the working key and returns it. The browser then form-POSTs it to CCAvenue's payment page. This is a full-page redirect, so the member leaves the app for a moment.
2. **CCAvenue → `https://www.paire.in/pay/ccavenue/` → `ccavenueResponse`** (HTTPS function). After paying or cancelling, CCAvenue form-POSTs `encResp` to that address on paire.in (CCAvenue only accepts the website its keys are registered for), and `vercel.json` forwards it to the function. The function reads only the order id, settles the order (step 4) and returns the browser to `MUSE_APP_URL?ccavenue=<orderId>` with a 303 redirect. The URL carries no result.
3. **Back in the app** (`hooks/useCcavenueReturn.ts`). The app calls `confirmCcavenueOrder`, shows one message (paid / still confirming / not charged / contact support), reopens the chat the payment started from, and brings back the composed message, which is kept in `sessionStorage` for that tab only. Sending still takes a tap on Send.
4. **Settling** (`settleCcavenueOrder`). Only CCAvenue's **order status API** counts. The call is server to server and authenticated with the access code and working key. The order is granted only when the API reports it `Successful`/`Shipped` for this exact order id, amount and INR. The redirect response, the browser and the client are never trusted, so a forged or replayed "Success" unlocks nothing.

| CCAvenue says | What happens |
|---|---|
| `Successful` / `Shipped`, right amount | Unlimited Chat: `chatUnlocks/{uid}` (`source: "ccavenue"`). Plus: the pass queues after any running pass (`webPassLedger`). The order becomes `paid`. Exactly once. |
| `Awaited` / `Initiated` | Pending ("your bank is still confirming"). **Check payment status** asks again. A second tab gets `pending` instead of a second order. |
| `Aborted`, `Unsuccessful`, `Failure`, … | The order is `failed`. Nothing changes and nobody is charged. |
| Wrong amount or currency, unknown state | Never granted. `mismatchAt` is recorded for support. |
| `Refunded` / `Auto-Reversed` / `Chargeback` | Ends only what this order bought (`refunded` / `chargeback`). A Plus refund recomputes the pass queue. |
| Paid, but the account already owns Unlimited Chat | The order becomes `duplicate` and is **refunded automatically** through the refund API. |
| Paid, but the account was deleted | The order becomes `orphaned` and is refunded. |
| Test-environment payment for a real account | The order becomes `rejected`. Test money only ever buys for test-cohort accounts. |

An unpaid order is reused for 6 hours: reopening settles the earlier order first. If both of two tabs pay anyway, the second payment is refunded. Automatic refunds that fail are written to `refundError` on the order, so support can finish them by hand.

Records: `ccavenueOrders/{orderId}` is server-only (`firestore.rules`) and kept after account deletion, like the other payment records. Member admin lists these orders, and `/metrics` counts paid ones in Plus and Unlimited Chat revenue.

## Turning it on

Everything below needs you. Nothing deploys or switches on by itself.

1. **Merchant account.** CCAvenue must approve a merchant account **for Paire** (paire.in, dating). The keys must be registered for `https://www.paire.in` (the return address is `https://www.paire.in/pay/ccavenue/`). Enable the order status and refund APIs for the access code.
2. **Secret** (once, before the next functions deploy):
   ```
   firebase functions:secrets:set CCAVENUE_WORKING_KEY --project muse-352ba
   ```
   Until you have a key, enter `disabled`. The new functions declare this secret, so the deploy asks for it if it's missing.
3. **`firebase/functions/.env`** (see `.env.example`):

   | Variable | Meaning |
   |---|---|
   | `MUSE_CCAVENUE_ENABLED=true` | Deploy-time kill switch. |
   | `CCAVENUE_ENV=test` or `live` | Must match the keys. Orders from the other environment are never confirmed with them. |
   | `CCAVENUE_MERCHANT_ID`, `CCAVENUE_ACCESS_CODE` | From the CCAvenue dashboard (API keys page). |
   | `MUSE_CCAVENUE_LIVE=true` | **Explicit approval to take live money.** Without it, `CCAVENUE_ENV=live` can't open a single checkout. |
   | `MUSE_BILLING_SANDBOX=true` | Needed to sell in `test`. Outside the emulator, test payments only unlock `moderation/{uid}.cohort = "test"` accounts. |
   | `CCAVENUE_RESPONSE_URL` | Optional. Overrides the return address (default: `/pay/ccavenue/` on `MUSE_APP_URL`'s site). |
   | `MUSE_APP_URL` | Optional. Where members land afterwards (default `https://www.paire.in/app/`). |
   | `MUSE_BILLING_ENABLED` | Existing. Plus is only sold while this is on. |

4. Deploy: `firebase deploy --only functions,firestore`, then deploy the website and browser app (Vercel).
5. **Runtime switch:** `node scripts/set-runtime-flags.mjs --project muse-352ba --ccavenue-sales on --confirm`. Roll back instantly with `--ccavenue-sales off`. Payments already taken still confirm, and refunds still apply.
6. **Sandbox first.** Use `CCAVENUE_ENV=test` and CCAvenue's test keys on test-cohort accounts: a successful payment, a cancelled one, a pending one, a refund from the dashboard, and two tabs. Then switch to the live keys with `MUSE_CCAVENUE_LIVE=true`.
7. **Legal copy** (Terms §4, Refunds, Privacy, the pricing pages) now names CCAvenue (Infibeam Avenues Limited). Have it checked along with the rest of the legal review, and deploy the site together with the functions.

**CCAvenue replaces direct UPI.** CCAvenue takes UPI too and confirms it automatically, so while CCAvenue sales are on, direct UPI to paire.in@ybl (`upiSales`) is no longer offered for new orders, whatever its switch says. UPI orders already paid and submitted stay pending until a moderator confirms them in **Settings → UPI payments to confirm**. If CCAvenue is switched off, direct UPI comes back (if `upiSales` is still on). The site, Terms, Refund and Privacy copy now describe CCAvenue.

## Tests

- `firebase/functions/test/ccavenue.test.ts`: encryption checked against an OpenSSL reference vector, the request format, response parsing and every status verdict.
- `firebase/functions/integration/ccavenuePayments.integration.test.ts`: runs in-process against the Firestore emulator with a fake CCAvenue test API. Covers server price and owner, forged and replayed responses, other people's orders, wrong amounts, pending then paid, automatic duplicate refunds, chargebacks, test money for real accounts, Plus passes and their refunds, and sales or billing switched off.
- `apps/muse-mobile/__tests__/chatAccess.test.ts`: drafts survive the redirect.

**Not yet verified:** a real CCAvenue sandbox or live run (this needs merchant credentials), CCAvenue's exact status strings for every bank, and the browser round trip against CCAvenue's real payment page.

## Payment recovery (2026-10-18)

A production status lookup returned `status=1`, `Access_code: Invalid Parameter` (51407). This is an API credential/authorization failure, not evidence that a customer wasn't charged. The backend now throws a verification error for that response, leaves the checkout unconfirmed, and lets the member retry/contact support. Merchant API credentials/authorization still need correction; no checkout or status result is fabricated to work around this.

For an explicitly owner-authorized recovery, the server can honor an audited `supportPlusGrants/{uid}` record (`status: active`, finite `startsAt`/`expiresAt`, reported amount, owner confirmation source, reason and covered checkout ids). These records have no client write or read access. `webPassExpiry` includes the grant so refreshing premium or chat doesn't erase it. The billing cache, pass queue and chat mirror are updated together with the recovery/audit record. The advertised ₹299 month includes the current bonus month (60 days total).

The gateway orders stay unconfirmed until CCAvenue verifies them. On the first subsequently verified paid order covered by a matching active recovery, settlement attaches that order to the existing dates and marks the support grant reconciled; it does not add a second pass. Refunds then operate on the verified order normally. Member admin distinguishes the owner recovery from gateway payments and labels unverified checkouts as unconfirmed. Account deletion removes the grant; the separate financial support audit remains for reconciliation. Activation email sends are explicitly owner-directed, use the existing Resend service and store the returned email id on the grant to prevent repeats.

Verification: `./scripts/verify.sh` passed 500 tests, including rejected credentials, recovery refresh persistence, one-time reconciliation, later refund and client denial for support grants. Production account recovery is an owner-authorized operation, not a QA login or a new charge.

Released in `b8ef459` / `b47be2a`: 15 affected Functions deployed successfully, Vercel is live, and the live admin bundle check passed. A production callback reconciliation confirmed the same CCAvenue 51407 rejection; merchant API authorization remains unresolved. The requested customer recovery was applied with a separate owner-confirmed audit, and Resend reported its activation email from `noreply@paire.in` delivered. Actual gateway orders remain unconfirmed; no gateway payment status was invented. Restore working status API credentials/authorization and verify from the production backend before considering automatic activation repaired.
