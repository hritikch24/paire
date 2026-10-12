# Muse web preview

The marketing website and browser dating application are in `apps/muse-site`. Published as an **owner-private** Sites preview at https://muse-delhi-ncr.soundlemon8.chatgpt.site . This is a review build, not an open public dating launch. Muse remains the working name; developer Hritik Chaudhary is recorded, while the future domain, support inbox and public address remain pending.

## What is implemented

The responsive landing page introduces Delhi NCR first, Vibe First, free matching/messaging/safety and optional fixed-duration premium. Its Sunday-vibe interaction is labelled a demo. ₹20/day is the founder's requested premium price; ₹119/week and ₹399/30 days are proposals, labelled accordingly. It makes no fictional active-member claims, testimonials, store links or waitlist submissions. Brand alternatives and a draft launch plan are in product/brand-shortlist.md and product/marketing-launch.md.

`/app/` contains the actual Expo browser export with shared Firebase accounts, matching, chat, profiles, verification gates, reporting and settings. Browser auth uses local browser persistence; forms bridge DOM input events, dialogs/menus support keyboard interaction, and the desktop panel constrains photo grids/carousels. Native Firestore uses Firebase's RN transport with Fetch streaming disabled; web keeps its browser transport. Photo uploads re-encode to JPEG, strip EXIF and send real authenticated bytes through Storage rules. Generated/edited photos do not become verified through upload.

## Build and review

From `apps/muse-site`, run `node scripts/sync-browser-source.mjs` after mobile changes, then `npm run build`. The sanitized source snapshot permits the Site to build independently; no native folders, environment files, signing files or server secrets are copied. The build installs its locked browser dependencies when missing, exports the browser app and assembles marketing/legal routes in `dist/`. `npm run preview` serves http://127.0.0.1:4173 . The build explicitly disables emulator/E2E/test-server mode and leaves unconfigured purchases/calls off. Preview robots rules disallow indexing.

The website uses the existing `.openai/hosting.json` project ID; do not register a replacement Site. Source and artifacts are published through the Sites helper, in an isolated nested Git repository. The parent application's existing staged/unstaged work is preserved.

## Browser QA

Use an **isolated** demo-muse UI emulator workspace on ports 9099/8080/5001/9199, prepared with `scripts/prepare-qa-emulators.cjs <fresh /tmp/muse-uiqa.XXXXXX> --default-ports`. It needs compiled functions and a Java version supported by the installed Firebase CLI. The helper copies functions/rules and disables provider secrets only in its temporary directory; it does not alter the developer's environment files. Refuse occupied ports and never use the group's shared test server.

Start Metro from `apps/muse-mobile` with `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true`, `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1`, `EXPO_PUBLIC_FUNCTIONS_REGION=us-central1`, `EXPO_PUBLIC_E2E=false`, `EXPO_PUBLIC_TEST_SERVER=false`. **E2E must be false for the real-byte photo upload test.** Keep the marketing preview on port 4173. Install/use Playwright plus Chrome and run from the monorepo:

```sh
MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/web.cjs
```

`NODE_PATH` is only an example for this Mac's existing Playwright installation; alternatively set `MUSE_PLAYWRIGHT_MODULE` to its installed module path. The script requires loopback URLs, seeds fictional members, submits a real emulator report/block, sends a message, uploads the app icon as a test image, checks refresh persistence and switches only the guarded emulator trust policy. It must not run alongside native flows, rule tests or integration tests on the same emulator. Production-export checks exercise assets/forms without submitting real accounts.

Evidence and limits are in qa-2026-10-10.md. Automated browser checks use Chrome; other browser engines, production CORS/auth-domain settings, assistive technology and real-phone usability still need acceptance testing.

## Public-launch requirements

Finalize the brand, owned domain/mailbox and public legal/contact details. Deploy the matching backend/rules/indexes deliberately after provider setup and acceptance testing; no production Firebase deployment was performed in this iteration. Add the web origin to Firebase Auth authorized domains and validate authenticated Storage CORS. A private Sites audience does not make Firebase endpoints private.

Live Didit capture/callback/review/erasure, paid store transactions, configured AI/calls, production push/signing and remaining dependency advisories are unresolved. Setup is documented in production-integrations.md. Web check-in notifications/push and browser checkout are unavailable; the browser can read server premium status. Fixed-duration web passes need a separately integrated payment provider with signed server validation, refunds and legal/product review. Browser verification opens the hosted capture in the same tab to avoid popup blockers; return to Muse and refresh status. No badge is issued from a client return URL.
