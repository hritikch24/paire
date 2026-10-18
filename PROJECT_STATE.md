# Muse: project state

Last updated: 2026-10-18

## Legal pages for India, US, UK and Canada (2026-10-18)
- Terms, Privacy, Refunds and Safety expanded; new `/privacy-choices/`, `/copyright/` and `/accessibility/` pages. The Meta Pixel loads only after a visitor allows it (never with Global Privacy Control).
- **Needs you:** set the `PAIRE_*` legal details in Vercel, a lawyer's review, and the other items in `docs/legal-compliance.md` (company, DMCA agent, UK/EU representatives if you market there).

## Verified badge and verified price (2026-10-18)
- **7-day pass: ₹119, or ₹99 for photo-verified members.** The server picks the price per member when the order is created (`PLUS_PASSES.week.verifiedAmountPaise`, `plusPricePaise`, `photoVerified(uid)` in `trust.ts`) for CCAvenue, UPI and Razorpay; `getPremiumStatus` returns the member's `prices` and `photoVerified`. Day (₹20) and month (₹299, 60 days) are the same for everyone.
- **Verified badge** (web): a blue "✓ Verified" on Discover cards, Vibe first cards, full profiles and your own profile. The Plus screen shows "Verified price" (₹119 struck through) or "₹99 if you verify your photos ›".
- Site, content pages, llms.txt, Terms, Refunds and README show ₹119 / ₹99 verified. **Needs a functions deploy** with the web deploy.

## Monthly offer: buy 1 month, get 1 month free (2026-10-18)
- The ₹299 month pass runs **60 days** when bought on the web (`PLUS_PASSES.month.bonusDays = 30` in `firebase/functions/src/lib/razorpay.ts`; set it to 0 to end the offer). Store passes in the app are unchanged.
- The web pushes monthly: it's selected first on the Plus screen with a "Buy 1 month, get 1 month free · SAVE 75%" ribbon and per-day prices for every plan (₹5, ₹14, ₹20 a day); the end-of-Discover offer leads with "Get 2 months · ₹299" and still mentions the ₹20 day pass. Website pricing, content pages, llms.txt, Terms and Refunds describe the offer.
- **Needs a functions deploy** (`firebase deploy --only functions`) for the extra 30 days to be granted, in the same go as the web deploy.

## Site review and new Discover features (2026-10-17)
- Full browser review on emulators (`docs/qa-2026-10-17.md`): sign-up, onboarding, Discover, matches, chat, profile and Plus at phone and desktop sizes. Fixed the "4× the likes" claim (it's 10×), the README's free like count and a cut-off Discover header line; the empty-Discover browser test follows the Plus offer.
- **Hold to Super Like** (web): hold the heart until the ring fills. **Lucky spin** (web): spins through your cards and brings one to the top (names only, nothing sent). **Dating vibe quiz** at `/vibe-quiz/`: shareable, no sign-up, nothing leaves the browser.

## See everyone again with Paire Plus (2026-10-17)
- **Free members** who have seen everyone in their range get a Paire Plus offer on the web instead of "You're all caught up" (with "Expand search" still there).
- **Plus members** go straight on: once everyone new is seen, the feed brings back the people they passed on (never likes, matches or blocks), and they can like them this time. A pass bought from the prompt opens this up immediately. Server: `getDiscoverFeed({ revisit })` (Plus only) and second-look swipes in `swipe`. Tests: `integration/revisitFeed.integration.test.ts`.

## CCAvenue payments (2026-10-17)
- **Web payments move to CCAvenue** (UPI, cards, netbanking, wallets) for Unlimited Chat (₹49) and Paire Plus passes. The server prices and owns each order and grants only after CCAvenue's order status API confirms it. Duplicates and payments for deleted accounts are refunded automatically; refunds and chargebacks end what the order bought. Members return to the chat they paid from with their draft kept. Details: `docs/ccavenue.md`.
- **Replaces direct UPI:** while CCAvenue sells, UPI to paire.in@ybl isn't offered for new orders; already-submitted UPI payments are still confirmed by moderators. Site, Terms, Refunds and Privacy copy name CCAvenue.
- **Return address:** `https://www.paire.in/pay/ccavenue/`, which `vercel.json` forwards to the `ccavenueResponse` function (CCAvenue only accepts the site its keys are registered for).
- **Switches:** `MUSE_CCAVENUE_ENABLED`, `MUSE_CCAVENUE_LIVE`, `CCAVENUE_ENV`/keys in the functions `.env`, the `CCAVENUE_WORKING_KEY` secret, and `runtime/trust.ccavenueSales` (`--ccavenue-sales on|off`).
- **Validation:** CCAvenue unit tests (encryption checked against OpenSSL) and emulator tests against a fake CCAvenue API. Not yet verified with a real CCAvenue payment.
- **Needs you:** one real ₹49 payment and refund on www.paire.in, CCAvenue's order status and refund APIs enabled for the access code, a regenerated working key (the current one was shared in a chat), and legal review of the updated copy.

## Presence and paid chat (2026-10-17, LIVE; payments since moved to UPI, then CCAvenue: see above)
- **Live since 2026-10-17 01:29 IST** (owner's request): presence on; sending needs Plus or Unlimited Chat (**₹49** once) with no grace period for older chats; live ₹49 sales on the current Razorpay key. Deployed: Firebase functions, rules and indexes, plus Vercel. Change log: `docs/web-changes.md`.
- Not yet verified with a real payment. Make one real ₹49 purchase and refund it from the Razorpay dashboard to confirm the live path, and add the `payment.dispute.*` webhook events.
- **Activity-based presence:** online only while a foreground session had a meaningful interaction within 2 minutes (configurable) and its heartbeat lease holds; multi-tab and multi-device; matches only; "Show when I'm active" hides it everywhere, including discovery. Off until `runtime/presence.enabled`.
- **Paid sending:** your own Paire Plus or Unlimited Chat (₹49 once, account-wide, no expiry) to send; reading and safety free. Enforced in the Firestore rules for the whole send batch. Unlimited Chat via Razorpay with server verification, signed webhooks, duplicate auto-refunds, refunds and chargebacks. Gate, sales and live charges are separate switches, all off.
- **Validation:** `verify.sh` passes (app 105, functions 219, rules 49, end-to-end 64). Payments are tested against a fake Razorpay test-mode API; no real sandbox or production payment has been made.
- **Needs you:** a Razorpay merchant account approved for Paire (the current live key is shared with another project), legal review of Terms/Refunds/Privacy, the existing-conversation policy and announcement date, and the dispute webhook events. Full list: `docs/presence-and-paid-chat.md`.

## Paire and Garba Nights (2026-10-12)
- **Name: Paire** (domain **paire.in**), formerly Chitthi. Tagline "Find your Paire." (the hero line under it: "Every love story starts with a note."). Logo: a paper aeroplane folded from a love note, with a heart cut out of its top wing (`tools/generate_brand_assets.py` makes every icon, the splash wordmark, the site icons, the link preview and the Play graphic). Feature names: Super Like, Paire AI, Paire Plus, Interests; a like can carry a note. Internal IDs are unchanged. Website variables are now `PAIRE_*` (the old `CHITTHI_*` names still work as a fallback).
- **Garba Nights**, a free Discover edition for Navratri (open 1–20 October 2026). Members pick the nights they're going to Garba or Dandiya (Settings, or the sheet behind the "🪔 Garba Nights" chip). Up to 4 nights each; the edition needs location and shows only people within 50 km going on at least one of the same nights. Cards say how many nights you share ("Going on 2 of your Garba nights"), never which ones, so nobody can read a schedule. Paire AI openers mention a shared Garba night. The landing page has a Garba section that hides itself after Dussehra. Next year: add the season to `firebase/functions/src/lib/garba.ts` and `apps/muse-mobile/src/data/garba.ts`.

## Rename and web payments (2026-10-11)
- **Razorpay web checkout for Paire Plus.** The server prices the order, Checkout opens, the signature is verified and the payment re-read from Razorpay, then the pass is granted once. A signed webhook handles late captures and refunds, and passes queue instead of overlapping. Store and web passes combine in `billing/{uid}`.
- **Website ready for payment-gateway review:** Refund & cancellation and Contact pages, a payments section in the Terms, business details filled from `PAIRE_*` variables, a web manifest and icons, a social share image, and a sitemap when indexing is on.
- Photo verification is required (`runtime/trust.requireVerification=true`, set 2026-10-13) through Paire's own free selfie check (`selfie.ts`); Didit takes over automatically if it is ever configured. `scripts/set-trust-policy.mjs` changes the policy. Email confirmation is always required.
- **Launch steps and every variable:** `docs/launch-web.md`. Validation: `verify.sh` passes (app 72, functions 146, rules 33, end-to-end 32).

## India v2 (2026-10-11)
Product review and build: Indian dating-app problems → solutions → pricing, in `docs/product/india-v2-plan.md`.
- **Men and women only.** "Show me" is Men, Women or Both, defaulting to the opposite gender.
- **Sparks:** likes can carry a screened note, which opens the chat on a match. Notes and Super Muses lead "Likes you".
- **Privacy & control (free):** notes-only likes, "I'll message first", incognito, private photos until match, same intentions only, "Speaks my language". All enforced on the server or in the rules.
- **Indian basics:** height, languages, education, work, religion (optional, never caste), diet, drinking, smoking. Plus a "Marriage-minded" intention.
- **Close kindly** instead of ghosting.
- **Fair limits and pricing:** free 25 likes and 1 Super Muse a day, the same for everyone. Muse Plus is ₹20/day, ₹99/week or ₹299/month (100 likes, 5 Supers, priority likes; never auto-renews).
- **Web on Vercel:** `apps/web` plus root `vercel.json`. Setup is in `docs/vercel.md`.
- **Validation:** `verify.sh` passes (app 72, functions 140, rules 33, emulator end-to-end 32), including fixes from an independent review. The browser flow (notes-only → note → likes gallery → like back → spark in chat → first move) was checked in Chrome against the emulators.
- **Still needs you:** a Vercel account (import the repo), adding the Vercel domain to Firebase Auth authorized domains, deploying the Firebase backend (Blaze), store prices in Play Console, and, for web payments, a Razorpay merchant account.

## Summary
The India-first UI and server integration paths are implemented and locally tested. Live provider setup and acceptance testing are still required before public launch. See [production integration setup](docs/production-integrations.md).

## Delhi NCR product iteration (2026-10-10)
- Muse remains the working name. Miltaa, Aarzo and Roohio remain suggestions subject to clearance; see `docs/product/brand-shortlist.md`.
- Redesigned welcome/discovery, deliberate Vibe-first reveal, safety entry points and notification privacy by default. NCR emulator fixtures now use Delhi, Gurugram, Noida and Faridabad; the app remains open to other locations.
- Didit hosted live check, signed callback, immutable photo generations, mandatory server/rules gates and moderator review endpoints/tool are implemented. Every photo needs human review after liveness; changing photos or approval expiry requires a new check. Live capture stays unavailable without provider configuration. Automated biometric erasure and account deletion paths need live-provider QA.
- RevenueCat native purchase + server validation, signed reconciliation and fixed-duration pass expiry are implemented. Free limits remain 100 likes/3 Super Muses per day; valid Premium increases these to 300/10 without resetting spent usage. ₹20/day is requested; ₹119/week and ₹399/month remain proposals. Live checkout stays unavailable without store/provider setup.
- AI vibe matching is an explicit opt-in for both people. Only fixed catalog choices are sent to Claude, with mutual preferences/safety filtering first and rules fallback. Vibe scores are sorting hints, not probabilities. Live model output still needs evaluation.
- Calls now require an authenticated active match and a room-specific, five-minute JaaS token; anonymous predictable room access is removed.
- Local validation details are in `docs/testing.md`. Android and iOS simulator builds are verified; live verification, store checkout and call-provider sessions remain untested.

## Done
- **Backend (Cloud Functions):** server-side discovery with mutual gender/age/distance preferences, swipes and matching (a match only on a real mutual like), daily limits, blocking, report auto-moderation, account-deletion cleanup, including provider erasure requests, push notifications for matches and messages, and test cohorts for Play review/QA.
- **Security rules:** validated profiles (18+), private data owner-only, profiles visible only to active matches, messages can't be forged or edited, nothing can be sent after an unmatch or block, photo uploads limited to images under 10 MB.
- **App:**
  - Redesigned auth with password reset and terms consent.
  - Six-step onboarding: 18+ birthday check, gender and Show me, photos, about, Muse Cards, rapid questions, pledge.
  - Swipe deck, real match moment, live matches and chat with read receipts.
  - Report/block/unmatch, settings with discovery preferences, working account deletion.
  - Safety Center with a real check-in reminder, and dark mode.
- **Engagement features:**
  - Two-step sign-up (name, birthday, gender/show me → interests), with photos, location and notifications offered afterwards one tap at a time.
  - Muse AI: a compatibility score and reasons ("You both love Soundscape and Frame") on every card and profile, icebreakers in new chats, bio ideas. Free built-in writer by default; Claude when an API key is configured.
  - Free "Likes you" list with instant match on like-back, "Your turn" on stalled chats, and an invite flow when the feed runs dry.
  - Private "open to a one-night stand" flag, revealed only on a mutual opt-in and used for matching.
  - Message and match notifications: server push via FCM, plus in-app alerts when push isn't set up.
  - New logo and brand ("There's a muse for everyone."), one typeface and type scale across the app.
  - Muse AI chat safety: scam, abuse, threat and under-18 warnings in chat, hidden abusive messages, and server-only flags for moderators with auto-hide for repeat offenders (see `docs/safety.md`).
  - 7 colour themes in light and dark, plus a System/Light/Dark mode (Settings → Appearance).
  - Duos: double dates with a friend (Discover → Duos). You invite with a code and confirm your friend, match with another pair, then chat as four in a group chat. The casual flag is never used there.
  - Likes gallery: "See everyone who likes you" opens a full-screen photo gallery with one-tap like-back.
- **Play policy:** no fake profiles or fake matches; photo picker with no media permission; approximate location only; no background location; backups disabled; privacy policy, terms, community guidelines and account-deletion pages (Firebase Hosting).
- **Build:**
  - Native config lives in `app.config.js` (`android/` is generated).
  - Release builds are signed with the upload key (`plugins/withAndroidReleaseSigning.js`).
  - Dependencies match Expo SDK 54 (`expo-doctor`: 18/18).
  - A signed `.aab` and `.apk` built and verified on 2026-09-26 (upload-key signature, versionCode 4, targetSdk 36, no restricted permissions).
- **Group testing without Firebase billing:** "Muse Test" (a separate app that installs beside the Play version) talks to Firebase emulators on your Mac through a free Cloudflare tunnel. A gateway blocks the emulators' admin keys and forged tokens, and the invite page offers the app download and a one-tap connect. See `docs/test-backend.md`.
  - Verified on an Android emulator through a real tunnel: connect by link and by paste, sign in, discover, a real match, chat, photo upload and display. When the tunnel restarted with a new link, the app reconnected without signing in again. `tools/test-backend/check.js` passes all 28 security and function checks.
- **Validation (2026-10-10):** 67 app unit tests, 127 backend unit tests, 29 security-rule tests and 28 emulator integration tests (251 total). App/backend static checks, functions compilation and Android/iOS simulator builds pass. Marketing and browser account/chat/report/photo/verification checks pass in Chrome; native regression results and launch limits are in `docs/qa-2026-10-10.md`. Live providers remain untested.

## Before launch (needs you)
0. Choose the public app name before the first Play upload (`docs/product/naming.md`), and answer the open product decisions in `docs/PRODUCT_BACKLOG.md`.
1. Firebase: Blaze plan, Email/Password sign-in, confirm the Firestore region, add `google-services.json`, then run `firebase deploy`.
2. Replace the `[PLACEHOLDERS]` on the legal pages and set `EXPO_PUBLIC_SUPPORT_EMAIL`.
3. Create the upload key: `./scripts/android/create-upload-keystore.sh`.
4. Play Console: listing, data safety, content rating, 18+ audience, a reviewer account in the test cohort, and a closed test with 12 testers for 14 days.

Full steps: `docs/RELEASE.md`. Run `./scripts/release-preflight.sh` to see what's left.

## Known limitations and next steps
- **iOS:** simulator build, onboarding and discovery/matching are verified. Full chat automation is unresolved; Vibe First, reports and verification gating still need iOS acceptance testing. Production signing/push and real-device testing remain pending. Generate/update native config with Expo prebuild and CocoaPods.
- **In-app calls:** off until 8x8 JaaS credentials and server-issued tokens are configured and tested (`EXPO_PUBLIC_CALL_DOMAIN=8x8.vc`).
- **Muse Now (random chat):** removed. Building it for real needs matchmaking and moderation.
- **Suggested next:** crash reporting (Sentry or Crashlytics), App Check, live photo-verification acceptance testing, automated content screening, a moderator dashboard/appeals, and geohash-based discovery once the user base is large.

## Product docs
Market strategy, costs, the Duos PRD and the naming review are in `docs/product/`. The current backlog is `docs/PRODUCT_BACKLOG.md`.

## Web and moderation follow-up (10 October 2026)

Marketing and the shared browser dating app are published owner-private through Sites at https://muse-delhi-ncr.soundlemon8.chatgpt.site . See `docs/web-preview.md` and `docs/product/marketing-launch.md`. Muse is retained until a brand decision. Miltaa/Aarzo/Roohio are research finalists, with clearance still pending. Developer legal drafts use Hritik Chaudhary; the eventual owned domain/inbox/address have not been invented.

Reports now use authenticated submission, server snapshots, stable retries, private member progress and a moderator-claim CLI with immutable audited decisions. Auto-moderation preserves bans/reviews. QA uses isolated emulator copies and never overwrites developer environment/secrets. Compatible dependency updates remove critical findings; residual high/moderate advisories are recorded in the QA report and remain a launch review item.
