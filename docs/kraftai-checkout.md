# Razorpay Checkout on kraftai.in

Paire's web payments (Paire Plus ₹29 / ₹99 / ₹299 and Unlimited Chat ₹49) go through **KraftAI's Razorpay account**, which is registered for kraftai.in. So Razorpay Checkout opens on kraftai.in, not on paire.in. Everything else stays here: Paire's server creates every order and confirms every payment with Razorpay before granting.

New Razorpay orders require `KRAFTAI_CHECKOUT_URL=https://kraftai.in`. Missing or invalid settings refuse checkout; the browser app never opens inline Razorpay Checkout on paire.in.

## Flow

```
paire.in/app ── createPlusOrder / createChatUnlockOrder ──▶ Razorpay order (notes.product, notes.plan)
     │  checkout.hostedUrl = https://kraftai.in/?order=order_…
     ▼
kraftai.in/?order=…          internal rewrite to the validated checkout; browser stays at /
     ▼
kraftai.in/pay/checkout       fetches the order from Razorpay; opens Checkout only if it's a supported
     │                        order, unpaid, INR, at exactly the validated app price
     ▼  Razorpay Checkout (redirect mode, name "KraftAI")
kraftai.in/pay/checkout/callback checks Checkout's signature and that it's the same order
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

The former `kraftai.in/paire` page is retired and redirects to the homepage. App order validation still uses its own price table; website builder credit plans are a separate product and never substitute for app purchases. The tables:

- Paire: `PLUS_PASSES` (`firebase/functions/src/lib/razorpay.ts`), `CHAT_UNLOCK` (`config.ts`), and `KRAFTAI_PUBLISHED_PAISE` (`lib/kraftai.ts`). `test/kraftai.test.ts` fails if they drift apart.
- KraftAI: `PAIRE_PLANS` in `kanoon-simplified/src/lib/paire.ts`.

Change a price in all of them together and deploy KraftAI first. From 2026-10-21, new day passes cost ₹29. Previously issued server-created ₹20 day orders remain accepted by hosted Checkout at their original quoted amount; other products and amounts still require the current catalog price. Paire confirms existing orders against their stored amount, so historical orders and revenue are unchanged.

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
| `RAZORPAY_PLUS_NAME` | `KraftAI Plus` |
| `RAZORPAY_CHAT_NAME` | `KraftAI Unlimited Chat` |
| `RAZORPAY_PLUS_DAY_LABEL` | Optional full Razorpay description for the day plan |
| `RAZORPAY_PLUS_WEEK_LABEL` | Optional full Razorpay description for the week plan |
| `RAZORPAY_PLUS_MONTH_LABEL` | Optional full Razorpay description for the month plan |
| `RAZORPAY_CHAT_LABEL` | Optional full Razorpay description for Chat |
| `KRAFTAI_CHECKOUT_NAME` | `KraftAI` (hosted checkout) |

For example, `PAIRE_PLUS_NAME="Premium"` changes the generated labels to
`Premium · 1 day`, `Premium · 7 days`, etc. Full-label overrides take precedence;
leave them unset if they should follow future name changes. Blank values fall
back to defaults and surrounding whitespace is trimmed. KraftAI's pricing page
uses the UI labels; its payment page uses the payment descriptions. Muse's own browser app keeps its existing UI copy.

To show `Paire Plus` in our UI but send `KraftAI Plus` to Razorpay, set
`PAIRE_PLUS_NAME="Paire Plus"` and `RAZORPAY_PLUS_NAME="KraftAI Plus"` in both
projects. Likewise, set `RAZORPAY_CHAT_NAME="KraftAI Unlimited Chat"` for Chat.
The Razorpay popup also shows the Razorpay description to buyers. Without a
Razorpay override, descriptions default to KraftAI Plus / KraftAI Unlimited Chat,
independently of the app labels. `RAZORPAY_*_LABEL` takes precedence over `RAZORPAY_*_NAME`.
`PLUS_PASSES.razorpayLabel` and `CHAT_UNLOCK.razorpayLabel` feed the order
response; KraftAI's `PAIRE_PLANS.razorpayDescription` feeds hosted Checkout.
New Razorpay notes use `kraftai_plus` or `kraftai_unlimited_chat` and never include the member uid. Ownership remains in Firestore. Legacy product IDs remain accepted for old payments. Hosted entry, checkout and callback URLs contain no app brand. The public pricing and legal pages still describe the actual product.

Restart local dev servers after changes. For production, redeploy KraftAI and
`createPlusOrder` / `createChatUnlockOrder`. These are deployment settings, not
live runtime switches. The Muse browser app and marketing copy keep their own names.

Internal entitlement IDs, plan IDs, receipt prefixes, prices, durations and webhook addresses stay the same. Old order metadata and callbacks remain valid. Merchant display settings do not change Razorpay's
registered merchant or bank-statement identity, or the site's legal ownership text.

## Browser and request boundaries

- The app navigates with a `no-referrer` anchor. `/pay/start` also sends a `Referrer-Policy: no-referrer` redirect for cached clients. `/pay/paire` is now only a legacy redirect.
- The actual payment page is `/pay/checkout`; it renders KraftAI names and passes only the payment description, amount and generic detail to the client. The app return URL is resolved by the callback server, not embedded in checkout props.
- Checkout and callback responses use `Referrer-Policy: no-referrer`. New callbacks use `/pay/checkout/callback`; the old callback remains accepted for existing windows.
- Server Razorpay requests explicitly allow only merchant authentication/content headers and a `KraftAI/1.0` user agent; browser cookies and referrers are not forwarded.
- App cookies are scoped by the browser to their real domain. Razorpay controls its own cookies, scripts, requests and telemetry. Browser origin headers remain truthful; this does not spoof an origin, erase historical orders, or change the registered business, webhook configuration or public product disclosures.
- A legacy chat order that is still settling is reconciled before a new order can be created. An untouched unpaid legacy order can be replaced with a current KraftAI order; historical payments remain claimable/refundable.

For this routing/metadata migration, deploy KraftAI before the app/backend. Deploy
`createPlusOrder`, `confirmPlusPayment`, `createChatUnlockOrder`, `confirmChatUnlock`,
`getChatAccess` and `razorpayWebhook` so all Razorpay requests and refund paths use
the updated merchant metadata/headers. Future name-only changes still need just
the two creation functions plus the KraftAI deployment.

## Turning it on (owner)

1. **Razorpay account.** Ask Razorpay support to add Paire (paire.in, online dating passes) as a product of the KraftAI account. They review the business behind every payment; selling an undisclosed business through an account risks a freeze of the whole account, KraftAI's own sales included. Share the actual app and its pricing with them; website builder plans do not describe app purchases.
2. **KraftAI (Vercel).** Deploy `kanoon-simplified` with the root payment rewrite first. Older `/pay/start` and `/pay/paire` links redirect to the root payment URL. It uses the existing `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. `PAIRE_APP_URL` is optional (default `https://www.paire.in/app/`).
3. **Paire functions.** Set `KRAFTAI_CHECKOUT_URL=https://kraftai.in` in `firebase/functions/.env`, then `firebase deploy --only functions`.
4. **Webhook.** In the Razorpay dashboard, make sure `razorpayWebhook` (Paire's function URL) is a webhook with `payment.captured`, `refund.processed`, `payment.dispute.*` and `RAZORPAY_WEBHOOK_SECRET`.
5. **Sales switches** (unchanged by this work): Plus needs `MUSE_BILLING_ENABLED` and `runtime/trust.razorpayPlusSales` (on unless set to false); chat needs `MUSE_CHAT_UNLOCK_ENABLED`, `MUSE_CHAT_UNLOCK_LIVE` and `runtime/trust.unlockSales` (`scripts/set-runtime-flags.mjs`; run it without changes to print the current state). Whatever Razorpay checkout is open when step 3 deploys moves to kraftai.in. With CCAvenue also on, the Plus screen uses Razorpay as the main button.
6. **Legal copy.** Terms, Refunds and Privacy name CCAvenue/Razorpay today. Add that payments are taken by KraftAI and show as KraftAI on bank statements (fewer "unknown merchant" chargebacks).
7. **One real payment** of ₹29 and a refund from the dashboard, then check the pass appears and ends.

## Hosting identity and lifetime catalog (2026-10-23)

The live KraftAI checkout project is `hritikchaudhary016-4858s-projects/myaiproductss`, **not** Team-Rockstar (which hosts Paire). Inspect the live domain/project before linking a local checkout; selecting a missing project name in the wrong team can create an empty project with no production environment. GitHub `main` is connected to the existing live project. Checkout counterpart `9ffd3f7` adds `lifetime` at 149900 paise (₹1,499 once), with no duration. Paire must deploy the matching catalog and entitlement code before offering it. See `docs/lifetime-plus.md`.

## Offer update (2026-10-24)

Current web quotes: ₹399/month (60 days with the bonus), ₹20/day, ₹1,499 lifetime; secondary ₹99/week and `halfyear` ₹799/180 days, plus the existing ₹49 messaging-only unlock. Old ₹29 day and ₹299 month server orders stay valid at their exact historical quotes. Catalog matching and deployment order are documented in `docs/plus-offers.md`. Do not edit old paid orders or reprice their recorded receipts.
