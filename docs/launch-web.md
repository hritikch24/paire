# Launching Paire on the web

The order below matters: the backend first, then payments, then the website. Every variable the launch needs is listed here. Step-by-step Vercel details are in `docs/vercel.md`.

## 1. Firebase backend (project `muse-352ba`)

Internal IDs (`muse-352ba`, `com.muse.app`, `muse_premium_*`) stay as they are. They are never shown to members.

1. Switch to the **Blaze** plan and set a budget alert (for example ₹1,000). Turn on **Authentication → Sign-in method → Email/Password** and **Google**. Google needs no client id in the app; only a support email in that dialog.
   - Google Cloud console (same project) → **APIs & Services → OAuth consent screen (Branding)**: app name **Paire**, the logo (`apps/web/site/icon-512.png`), your support email, and links to `/privacy/` and `/terms/` on your domain. This is what people see in the Google window.
2. Create `firebase/functions/.env` from `.env.example`:

   | Variable | Value | Notes |
   |---|---|---|
   | `FUNCTIONS_REGION` | `us-central1` (or `asia-south1`) | Must match your Firestore location and `EXPO_PUBLIC_FUNCTIONS_REGION` on Vercel. |
   | `MUSE_BILLING_ENABLED` | `true` | Turns on Paire Plus. Keep it `false` until Razorpay is approved for Paire. |
   | `RAZORPAY_KEY_ID` | `rzp_live_…` (`rzp_test_…` to rehearse) | Public key id from Razorpay → Account & Settings → API keys. |
   | `MUSE_VERIFICATION_ENABLED` | `false` until Didit is set up | See step 4. |
   | `MUSE_BILLING_SANDBOX` | `false` | |

3. Store secrets in Secret Manager with `firebase functions:secrets:set NAME`. Firebase refuses to deploy while any bound secret is missing, so set unused ones to the literal value `disabled`:

   | Secret | Value |
   |---|---|
   | `RAZORPAY_KEY_SECRET` | The key secret paired with `RAZORPAY_KEY_ID` (same variable names as your other Razorpay project). |
   | `RAZORPAY_WEBHOOK_SECRET` | A long random string; enter the same string in the Razorpay webhook (step 2.3). |
   | `ANTHROPIC_API_KEY` | Optional (Paire AI writing and safety double-checks), otherwise `disabled`. |
   | `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_WEBHOOK_SIGNING_SECRET` | `disabled` until the Android Play Store launch. |
   | `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` | `disabled` until live photo checks are set up. |
   | `JAAS_PRIVATE_KEY` | `disabled` (video calls are off). |

4. **Decide the photo-verification policy.** By default nobody can discover or message without an approved live photo check, and that check needs Didit (`docs/production-integrations.md`). Without Didit, nobody can date. For a beta without Didit, run this yourself once:
   ```sh
   gcloud auth application-default login
   node scripts/set-trust-policy.mjs --project muse-352ba --require-verification false --confirm
   ```
   Reports, chat safety, blocking and moderation still work with verification off. Switch it back to `true` once Didit works.
5. Deploy: `firebase deploy --only firestore,storage,functions,hosting`. This also creates the "Likes you", age-gap and Garba Nights indexes; check Firestore → Indexes until they all show Enabled. Garba Nights only works once its index is Enabled.

## 2. Razorpay (Paire Plus on the web)

1. **Get Paire approved.** If you reuse an existing Razorpay account, it was approved for a different business. In the Razorpay Dashboard → Account & Settings → **Website and app details**, add the Paire domain and ask support to approve it for an online dating service. Razorpay's partner terms single out "friend-finder" services for chargeback and fraud risk and call "online matchmaking" legally ambiguous, so get written approval before charging anyone. If Razorpay declines, the same server flow can be moved to Cashfree or PayU.
2. Razorpay reviews the site for these pages, which are already built: `/terms/` (with a payments section), `/privacy/`, `/refunds/` (cancellation, refund and delivery policy) and `/contact/`. They need your real details from step 3.
3. **Webhook:** Dashboard → Webhooks → Add:
   - URL: `https://<FUNCTIONS_REGION>-muse-352ba.cloudfunctions.net/razorpayWebhook` (or the `razorpayWebhook` URL that `firebase deploy` prints)
   - Secret: same as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `refund.processed`, `payment.refunded`, and for chargebacks `payment.dispute.created`, `payment.dispute.lost`, `payment.dispute.won`, `payment.dispute.closed`
4. Make sure payments are captured automatically: Account & Settings → Payment capture → **Automatic**.
5. **Rehearse with test keys first** (`rzp_test_…`, test webhook secret). Buy a 1-day pass with test UPI `success@razorpay` and check "Your pass is active". Then refund it from the Dashboard and check the pass ends. Switch to live keys only after that.

How it works: the server sets the price (₹20 / ₹99 / ₹299), creates the Razorpay order and opens Checkout. It then checks Checkout's signature and asks Razorpay that the payment really was captured for that exact order and amount. Only then does it start the pass, once. The signed webhook covers closed tabs, late UPI confirmations and refunds. Passes queue (web and store passes alike), so nobody loses days, even if two payments land at once. Any refund ends that pass. Code: `firebase/functions/src/razorpay.ts`.

Unlimited Chat (₹49 once, sending messages in every match) uses the same keys and webhook, and has its own switches (`MUSE_CHAT_UNLOCK_ENABLED`, `MUSE_CHAT_UNLOCK_LIVE`, `runtime/trust.unlockSales`). Read `docs/presence-and-paid-chat.md` before turning on paid chat or presence. Production charges need a Razorpay merchant account approved for Paire itself.

## 2b. CCAvenue (current web checkout)

Unlimited Chat and Plus are now paid through CCAvenue (UPI, cards, netbanking, wallets); it replaces direct UPI for new orders. Keys and switches: `MUSE_CCAVENUE_ENABLED`, `MUSE_CCAVENUE_LIVE`, `CCAVENUE_ENV`, `CCAVENUE_MERCHANT_ID`, `CCAVENUE_ACCESS_CODE` in the functions `.env`; the secret `CCAVENUE_WORKING_KEY`; and `runtime/trust.ccavenueSales`. The keys must be registered for `https://www.paire.in`; CCAvenue returns buyers to `/pay/ccavenue/`, which `vercel.json` forwards to `ccavenueResponse`. Full setup and rollout: `docs/ccavenue.md`.

## 3. Vercel (the website and web app)

Import the repo. `vercel.json` holds the build settings. Add these environment variables (Production and Preview):

| Variable | Required | Example | What it does |
|---|---|---|---|
| `PAIRE_SUPPORT_EMAIL` | **Yes** | `support@yourdomain.in` | Shown on the legal and contact pages and in the app's "Contact support". |
| `PAIRE_POSTAL_ADDRESS` | **Yes** | Your business address | Legal pages (IT Rules grievance contact). |
| `PAIRE_JURISDICTION_CITY` | **Yes** | `New Delhi` | Governing courts in the Terms. |
| `PAIRE_SITE_URL` | Recommended | `https://paire.in` | Absolute links, the social share image and the sitemap. Defaults to the Vercel URL. |
| `PAIRE_GRIEVANCE_OFFICER` | No | `Hritik Chaudhary` (default) | Grievance Officer name. |
| `PAIRE_GRIEVANCE_EMAIL` | No | Defaults to the support email | |
| `PAIRE_LEGAL_EFFECTIVE_DATE` | No | `1 November 2026` | Defaults to the build date. |
| `PAIRE_ALLOW_INDEXING` | At public launch | `true` | Lets Google index the site and adds the sitemap. |
| `PAIRE_GOOGLE_SITE_VERIFICATION` | For Google Search Console | the code from the HTML-tag method | Adds the ownership tag to the home page. |
| `PAIRE_BING_SITE_VERIFICATION` | For Bing Webmaster Tools | the code from the meta-tag method | Adds the ownership tag (Bing also feeds ChatGPT search). |
| `PAIRE_META_PIXEL_ID` | For Meta ads | numeric Pixel ID | Adds the Meta Pixel. |
| `EXPO_PUBLIC_FUNCTIONS_REGION` | If not `us-central1` | `asia-south1` | Must match `FUNCTIONS_REGION`. |
| `EXPO_PUBLIC_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID` | No | | Only to use a Firebase project other than `muse-352ba`. |

Variables named `CHITTHI_*` from before the rename still work, but rename them to `PAIRE_*` when convenient. Until the three required variables are set, the legal pages show a "Legal draft" banner and the build log warns you. Razorpay won't approve the site in that state.

Then:
- Vercel → Project → Settings → **Domains**: add `paire.in` and `www.paire.in`, then set the DNS records Vercel shows at your registrar.
- Firebase console → Authentication → Settings → **Authorized domains**: add `<project>.vercel.app`, `paire.in` and `www.paire.in`. Both email and Google sign-in fail on a domain missing from this list.
- Storage CORS for photo uploads from the site (command in `docs/vercel.md`).

## 4. Launch checklist
- [ ] `./scripts/verify.sh` passes.
- [ ] On the live site: "Continue with Google" opens a Google window titled Paire and lands on the birthday step; deleting that account asks for Google again.
- [ ] On the live site: sign up, finish onboarding, upload a photo, see Discover, send a like with a note, match with a second test account, and chat.
- [ ] Buy a 1-day pass with test keys and check "Your pass is active" and the 100-likes allowance. Refund it and check the pass ends.
- [ ] Live keys in, Razorpay approval confirmed in writing, and the webhook's delivery log shows 200 for a real test-mode payment.
- [ ] Legal pages show your details and no draft banner. `/refunds/` and `/contact/` load.
- [ ] Budget alert set in Google Cloud. A support inbox is monitored daily.
- [ ] Set `PAIRE_ALLOW_INDEXING=true` and redeploy when you're ready for Google.

## Mobile app (later)
The app is renamed Paire too (display name, icon, wordmark), with the package `com.muse.app` unchanged. For the Play Store, follow `docs/RELEASE.md`. Passes there go through Play billing (RevenueCat), at the same prices. Web passes and Play passes add up in one place, so a member who pays on either platform gets Plus on both.

## SEO and AI search

Content pages live in `apps/web/content/*.mjs` (rendered by `apps/web/scripts/render-pages.mjs`); adding a page there adds it to the sitemap, `llms.txt`, `llms-full.txt` and `urls.txt` automatically. After each deploy run `node apps/web/scripts/indexnow.mjs` to ask Bing and other IndexNow engines to recrawl.
