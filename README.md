# Paire

"Find your Paire." Live at paire.in. Formerly Chitthi, and before that the working name Muse; internal IDs (`com.muse.app`, Firebase `muse-352ba`, folder names) are unchanged.

Paire is a dating app for adult men and women (18+), built for India: women set the rules, men get a fair chance. It launches with a Delhi NCR focus while remaining open elsewhere. Members sign up in two quick steps and pick interests (music, film, craft…). Profile-based vibe ranking sorts people whose preferences match their own and explains shared choices. They can explore photo cards or Vibe-first cards, see who liked them for free, and chat after a mutual like, with optional AI icebreakers.

Also in the app:
- **Sparks:** add a note to any like. Notes lead "Likes you" and open the chat if you match.
- **Garba Nights** (Navratri): pick your Garba nights and meet people dancing on the same nights. Free for everyone.
- **Privacy & control (free):** notes-only likes, "I'll message first", incognito, private photos until match, same intentions only, "Speaks my language".
- **Indian basics:** height, languages, education, work, religion (optional, never caste), diet, drinking, smoking.
- **Close kindly:** a polite goodbye instead of ghosting.
- **Vibe first:** read personality and intentions, then deliberately reveal a photo before deciding.
- **Paire Plus:** ₹20/day, ₹99/week, ₹299/month passes (100 likes, 5 Super Likes, priority likes, and messaging when paid chat is on; never auto-renews). Free is 10 likes and 1 Super Like a day. Web payments go through CCAvenue (UPI, cards, netbanking, wallets; `docs/ccavenue.md`), which replaces the earlier direct-UPI and Razorpay checkouts; the Android app uses Play billing via RevenueCat. Each is behind its own switch (`docs/launch-web.md`).
- **Photo-verification status:** server-derived approval status and education. Didit capture, immutable snapshots, moderator review and strict server/rule gates are implemented; live provider activation/testing are pending.
- **Muse AI chat safety:** warns about scams, threats and abuse, and hides abusive messages.
- **My reports:** private progress, server-bound evidence and moderator review, with report/block retry protection.
- **Paid sending (off until switched on):** sending messages needs your own Plus or **Unlimited Chat** (₹49 once, all current and future matches, no expiry); reading, matching and safety stay free. **Presence (off until switched on):** "Online" and approximate "Active 3 h ago" for matches, from real activity, with a setting to hide it. See `docs/presence-and-paid-chat.md`.
- **Browser dating:** shared accounts, discovery, chat, profiles and safety in the responsive web app.
- **Duos:** double dates with a friend, with a four-person group chat.
- **Likes gallery:** a full-screen gallery of everyone who liked you.
- **Themes:** seven colour themes in light and dark.

The public name is still to be decided; see `docs/product/brand-shortlist.md`. The private website preview is https://muse-delhi-ncr.soundlemon8.chatgpt.site — review build, with public launch/provider/legal setup pending. Build and browser QA: `docs/web-preview.md`. Latest evidence and limits: `docs/qa-2026-10-10.md`.

| Part | Where | Stack |
| --- | --- | --- |
| Mobile app | `apps/muse-mobile` | Expo SDK 54, React Native 0.81, Tamagui, React Navigation, Zustand, TanStack Query |
| Website + browser app (Vercel) | `apps/web`, `vercel.json` | Landing page, legal pages and the Expo web export at `/app/` (`docs/vercel.md`) |
| Older Sites preview | `apps/muse-site` | Owner-private preview (superseded by `apps/web`) |
| Backend | `firebase/functions` | Cloud Functions (Node 22): discovery, swipes/matching, safety, account deletion, push |
| Security rules | `firebase/rules` | Firestore + Storage rules, with tests |
| Legal pages | `firebase/hosting` | Privacy policy, terms, guidelines, account deletion (Firebase Hosting) |
| E2E flows | `e2e` | Maestro |

The app and the functions are standalone npm projects, each with its own lockfile. The root folder has no dependencies.

## Setup
```
./scripts/bootstrap-macos.sh              # one-time toolchain (watchman, firebase-tools, maestro…)
(cd apps/muse-mobile && npm ci)
(cd firebase/functions && npm ci)
(cd firebase && npm ci)                   # rules test tooling
cp apps/muse-mobile/.env.example apps/muse-mobile/.env
```
Android builds need JDK 17 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`).

## Run locally against the Firebase emulators
```
npm --prefix firebase/functions run build
firebase emulators:start --project demo-muse          # auth, firestore, functions, storage
npm --prefix firebase/functions run seed:emulator     # demo members, password Password123!
cd apps/muse-mobile && npx expo run:android
```
Seeded logins: `muse+alexa@example.com`, `muse+jules@example.com` (already matched), `muse+dev@example.com`, `muse+casey@example.com`, `muse+kai@example.com`, and `muse+onboard@example.com` (no profile yet).

The `android/` and `ios/` folders are generated from `app.config.js` (`npx expo prebuild`). Change native settings in `app.config.js` or a config plugin in `plugins/`, never by hand.

## Test with your group (free)
Share the app with friends on their own phones, with no Firebase bill: your Mac runs the backend and a free Cloudflare tunnel makes it reachable.
```
./scripts/android/build-test-apk.sh        # "Muse Test" app → dist/Muse-Test.apk
./scripts/test-backend.sh                  # prints an invite link to share
```
See `docs/test-backend.md` (what testers do, resetting passwords, limits, and how the gateway keeps the emulators safe to expose).

## Tests
```
./scripts/verify.sh                        # lint, typecheck, unit, rules and functions end-to-end tests
E2E_PLATFORM=android ./scripts/verify.sh   # plus Maestro UI flows on an emulator
```
See `docs/testing.md`.

## Release
`./scripts/release-preflight.sh` lists what is missing; `docs/RELEASE.md` walks through Firebase, signing, building the `.aab` and Play Console.

## Docs
- `docs/product/india-v2-plan.md`: India v2 problems → solutions → pricing (current product plan)
- `docs/launch-web.md`: **web launch order and every environment variable** (Firebase, Razorpay, Vercel)
- `docs/presence-and-paid-chat.md`: presence, the paid-chat gate, Unlimited Chat payments, switches, migration and rollout
- `docs/ccavenue.md`: CCAvenue payments (Unlimited Chat and Plus): flow, keys, switches, rollout and tests
- `docs/vercel.md`: deploying the web app on Vercel
- `docs/product/delhi-ncr-direction.md`: research, issues/solutions, naming, safety/verification, matching, pricing, design and launch requirements.
- `docs/architecture.md`: data model, backend flows, security
- `docs/RELEASE.md`: Google Play release playbook
- `docs/safety.md`: moderation and trust & safety operations
- `docs/testing.md`: test suites and how to run them
- `docs/test-backend.md`: the free test server for your group
- `docs/design-system.md`: themes, type and components
- `docs/PRODUCT_BACKLOG.md`: what's next and open decisions
- `docs/product/market-strategy.md`: India-first market review, launch plan and getting traffic
- `docs/product/costs.md`: Play and Firebase costs, and developer-account options
- `docs/product/duos-prd.md`: Duos (double dates with a friend) PRD
- `docs/product/naming.md`: app name review
- `PROJECT_STATE.md`: what's done and what needs you; `FIX_LOG.md`: change history

Production trust, billing and AI setup: [integration guide](docs/production-integrations.md). These integrations require provider/store configuration and live QA before launch.
