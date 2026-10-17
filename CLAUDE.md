# Working on Paire: read this first

These are the owner's standing instructions for any AI assistant working in this repository (Claude, Codex, Cursor, and others). They override older notes in other docs.

## Web only, for now (owner, 2026-10-17)

Paire is **web-focused**: the live product is https://www.paire.in (the website, plus the browser app at `/app/`). Native Android and iOS work is paused until the owner says otherwise.

**Do not change Android or iOS.** That means:
- `apps/muse-mobile/android/`, `apps/muse-mobile/ios/`
- native settings in `apps/muse-mobile/app.config.js`, `apps/muse-mobile/plugins/`, `apps/muse-mobile/eas.json`
- `*.native.ts(x)` files, and native-only flows such as RevenueCat/Play billing (`nativeBillingAvailable`), push setup, and Maestro native E2E (`e2e/*.yaml`, `scripts/test-e2e.sh`)
- `scripts/android/`, and APK/AAB builds, Play Console or store listings

**What you may change:**
- `apps/web/`: the marketing site, SEO content, legal pages and build script
- `apps/muse-mobile/src/`: this is also the **browser app's** source (Expo web export). Change it for the web. Where web and native would behave differently, put web-only code behind `Platform.OS === "web"` or in a `*.web.tsx` file, and leave native behaviour as it is. Don't spend time on native QA.
- `firebase/` (functions, rules, indexes, tests), `docs/`, `scripts/` (except `scripts/android/`)

Verify with `./scripts/verify.sh`. For browser checks, use local emulators only (`docs/web-preview.md`). Never use production accounts or real payments.

## Log every web change

Every commit that changes the web product (site, browser app, backend or rules it uses, legal copy) gets an entry in **[`docs/web-changes.md`](docs/web-changes.md)**: date, commit hash, a short summary, and its deploy status (pushed / Vercel deployed / Firebase deployed). After you commit, add the hash. A follow-up commit for the log entry is fine. Keep entries short and newest first.

## Deploying

- The Vercel project is now connected to GitHub (owner, 2026-10-17): a push to `main` deploys the website and browser app to production, and other branches get preview deployments. Push to `main` only what is ready to go live.
- Website and browser app by hand: `npx vercel deploy --prod --scope team-rockstar`, then `node apps/web/scripts/indexnow.mjs`.
- Backend: `firebase deploy --only functions,firestore` (project `muse-352ba`).
- Deploy only when the owner asks. Record each deploy in `docs/web-changes.md`.

## Before touching payments, presence or chat

Read `docs/presence-and-paid-chat.md` and, for web payments (now CCAvenue), `docs/ccavenue.md`. Paid sending, Unlimited Chat sales and presence are behind runtime switches that are **off**. Don't turn them on, and don't enable live charges, without the owner's explicit go-ahead. Production charges need a Razorpay merchant account approved for Paire itself; the current live key is shared with another project.

## Other docs

`README.md` (overview), `PROJECT_STATE.md` (state), `docs/launch-web.md` (web launch and variables), `docs/architecture.md`, `FIX_LOG.md` (detailed history).
