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
7. **Legal copy.** Terms §4, the Refund policy and the Privacy policy (service providers) currently say web payments go by UPI to paire.in@ybl. Add CCAvenue (Avenues India Pvt Ltd) as a payment processor before taking live payments.

When CCAvenue is on alongside UPI, the app shows UPI first, with **Pay by card, netbanking or wallet** as a second button. When CCAvenue is the only method, it becomes the main button.

## Tests

- `firebase/functions/test/ccavenue.test.ts`: encryption checked against an OpenSSL reference vector, the request format, response parsing and every status verdict.
- `firebase/functions/integration/ccavenuePayments.integration.test.ts`: runs in-process against the Firestore emulator with a fake CCAvenue test API. Covers server price and owner, forged and replayed responses, other people's orders, wrong amounts, pending then paid, automatic duplicate refunds, chargebacks, test money for real accounts, Plus passes and their refunds, and sales or billing switched off.
- `apps/muse-mobile/__tests__/chatAccess.test.ts`: drafts survive the redirect.

**Not yet verified:** a real CCAvenue sandbox or live run (this needs merchant credentials), CCAvenue's exact status strings for every bank, and the browser round trip against CCAvenue's real payment page.
