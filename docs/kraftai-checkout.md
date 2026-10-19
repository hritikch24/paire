# Razorpay Checkout on kraftai.in

Paire's web payments (Paire Plus ₹20 / ₹99 / ₹299 and Unlimited Chat ₹49) go through **KraftAI's Razorpay account**, which is registered for kraftai.in. So Razorpay Checkout opens on kraftai.in, not on paire.in. Everything else stays here: Paire's server creates every order and confirms every payment with Razorpay before granting.

Off until `KRAFTAI_CHECKOUT_URL` is set. Unset, Checkout opens in the page on paire.in as before.

## Flow

```
paire.in/app ── createPlusOrder / createChatUnlockOrder ──▶ Razorpay order (notes.product, notes.plan)
     │  checkout.hostedUrl = https://kraftai.in/pay/paire?order=order_…
     ▼
kraftai.in/pay/paire          fetches the order from Razorpay; opens Checkout only if it's a Paire
     │                        order, unpaid, INR, at exactly kraftai.in's published price
     ▼  Razorpay Checkout (redirect mode, name "KraftAI")
kraftai.in/pay/paire/callback checks Checkout's signature and that it's the same order
     │  303
     ▼
paire.in/app/?kraftai=paid&kind=plus|chat&order=…&payment=…&signature=…
     │  useKraftaiReturn → confirmPlusPayment / confirmChatUnlock (signature + Razorpay re-read + uid check)
     ▼
granted once (razorpayWebhook covers closed tabs and late UPI captures)
```

- **No shared secret between the sites.** The Razorpay order is the hand-off: only a holder of the key can create one, and kraftai.in reads it straight from Razorpay. kraftai.in stores nothing and grants nothing.
- **Cancelled / failed** returns come back as `?kraftai=cancelled|failed`; the app checks once more (a UPI payment can finish after the window closes) and says what happened.
- **Drafts and the chat** a payment started from come back with the member (sessionStorage, this tab), as with CCAvenue.

## Prices must match on both sites

kraftai.in publishes the plans at `kraftai.in/paire` and refuses any order at another amount. The tables:

- Paire: `PLUS_PASSES` (`firebase/functions/src/lib/razorpay.ts`), `CHAT_UNLOCK` (`config.ts`), and `KRAFTAI_PUBLISHED_PAISE` (`lib/kraftai.ts`). `test/kraftai.test.ts` fails if they drift apart.
- KraftAI: `PAIRE_PLANS` in `kanoon-simplified/src/lib/paire.ts`.

Change a price in all of them together and deploy KraftAI first.

## Changing payment display names

Names are configured in `firebase/functions/src/lib/payment-names.ts` and mirrored
in `kanoon-simplified/src/lib/payment-names.ts`. Set matching environment values in
`firebase/functions/.env` and KraftAI's Vercel environment (`.env.local` locally):

| Variable | Default |
|---|---|
| `PAIRE_PLUS_NAME` | `Paire Plus` |
| `PAIRE_CHAT_NAME` | `Paire Unlimited Chat` |
| `PAIRE_PLUS_DAY_LABEL` | UI: `<Plus name> · 1 day` |
| `PAIRE_PLUS_WEEK_LABEL` | UI: `<Plus name> · 7 days` |
| `PAIRE_PLUS_MONTH_LABEL` | UI: `<Plus name> · 1 month + 1 month free` |
| `PAIRE_CHAT_LABEL` | UI: `<Chat name> · one-time ₹49 unlock` |
| `RAZORPAY_PLUS_NAME` | Optional separate Plus name for Razorpay |
| `RAZORPAY_CHAT_NAME` | Optional separate Chat name for Razorpay |
| `RAZORPAY_PLUS_DAY_LABEL` | Optional full Razorpay description for the day plan |
| `RAZORPAY_PLUS_WEEK_LABEL` | Optional full Razorpay description for the week plan |
| `RAZORPAY_PLUS_MONTH_LABEL` | Optional full Razorpay description for the month plan |
| `RAZORPAY_CHAT_LABEL` | Optional full Razorpay description for Chat |
| `PAIRE_CHECKOUT_NAME` | `Paire` (direct checkout) |
| `KRAFTAI_CHECKOUT_NAME` | `KraftAI` (hosted checkout) |

For example, `PAIRE_PLUS_NAME="Premium"` changes the generated labels to
`Premium · 1 day`, `Premium · 7 days`, etc. Full-label overrides take precedence;
leave them unset if they should follow future name changes. Blank values fall
back to defaults and surrounding whitespace is trimmed. KraftAI's pricing and
payment pages use the UI labels. Muse's own browser app keeps its existing UI copy.

To show `Paire Plus` in our UI but send `KraftAI Plus` to Razorpay, set
`PAIRE_PLUS_NAME="Paire Plus"` and `RAZORPAY_PLUS_NAME="KraftAI Plus"` in both
projects. Likewise, set `RAZORPAY_CHAT_NAME="KraftAI Unlimited Chat"` for Chat.
The Razorpay popup also shows the Razorpay description to buyers. Without a
Razorpay override, descriptions inherit the corresponding UI labels, including
full-label overrides. `RAZORPAY_*_LABEL` takes precedence over `RAZORPAY_*_NAME`.
`PLUS_PASSES.razorpayLabel` and `CHAT_UNLOCK.razorpayLabel` feed the direct
checkout payload; KraftAI's `PAIRE_PLANS.razorpayDescription` feeds hosted Checkout.
Razorpay still receives the stable Paire product IDs and page/callback addresses;
these display-name settings do not hide or change the underlying product.

Restart local dev servers after changes. For production, redeploy KraftAI and
`createPlusOrder` / `createChatUnlockOrder`. These are deployment settings, not
live runtime switches. The Muse browser app and marketing copy keep their own names.

Product IDs (`paire_plus`, `paire_unlimited_chat`), plan IDs, receipt prefixes,
prices, durations, order/refund processing, URLs and webhook addresses stay the
same when a name changes. Merchant display settings do not change Razorpay's
registered merchant or bank-statement identity, or the site's legal ownership text.

## Turning it on (owner)

1. **Razorpay account.** Ask Razorpay support to add Paire (paire.in, online dating passes) as a product of the KraftAI account. They review the business behind every payment; selling an undisclosed business through an account risks a freeze of the whole account, KraftAI's own sales included. `kraftai.in/paire` is the page to point them at.
2. **KraftAI (Vercel).** Deploy `kanoon-simplified` with `/pay/paire`. It uses the existing `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. `PAIRE_APP_URL` is optional (default `https://www.paire.in/app/`).
3. **Paire functions.** Set `KRAFTAI_CHECKOUT_URL=https://kraftai.in/pay/paire` in `firebase/functions/.env`, then `firebase deploy --only functions`.
4. **Webhook.** In the Razorpay dashboard, make sure `razorpayWebhook` (Paire's function URL) is a webhook with `payment.captured`, `refund.processed`, `payment.dispute.*` and `RAZORPAY_WEBHOOK_SECRET`.
5. **Sales switches** (unchanged by this work): Plus needs `MUSE_BILLING_ENABLED` and `runtime/trust.razorpayPlusSales` (on unless set to false); chat needs `MUSE_CHAT_UNLOCK_ENABLED`, `MUSE_CHAT_UNLOCK_LIVE` and `runtime/trust.unlockSales` (`scripts/set-runtime-flags.mjs`; run it without changes to print the current state). Whatever Razorpay checkout is open when step 3 deploys moves to kraftai.in. With CCAvenue also on, the Plus screen uses Razorpay as the main button.
6. **Legal copy.** Terms, Refunds and Privacy name CCAvenue/Razorpay today. Add that payments are taken by KraftAI and show as KraftAI on bank statements (fewer "unknown merchant" chargebacks).
7. **One real payment** of ₹20 and a refund from the dashboard, then check the pass appears and ends.
