# Testing Muse

`./scripts/verify.sh` runs everything below except the Maestro flows.

| Suite | Command | Covers |
| --- | --- | --- |
| App unit tests (67) | `cd apps/muse-mobile && npm run test:unit` | Age and birthday parsing, onboarding routing, Show me/preferences, friendly error messages, time formatting, match parsing (pair and Duo chats), the chat send batch (one and several recipients), chat-safety warnings, theme contrast (WCAG AA for every palette), error boundary, test-server links and addresses |
| App static checks | `npm run typecheck && npm run lint` | TypeScript strict mode; ESLint including React hooks rules |
| Functions unit tests (127) | `cd firebase/functions && npm test` | Mutual preference matching, distance and location coarsening, discovery visibility, test cohorts, ranking, Muse AI insights and writers, input validation. Also the chat-safety scanner (ordinary chat left alone, scams/threats/abuse/under-18 caught, Hinglish, look-alike and spelled-out words, AI-review limits) and Duo fit rules, invite codes and group icebreakers |
| Security rules (29) | `firebase emulators:exec --project demo-muse --only firestore,storage "npm --prefix firebase run test:rules"` | Profile validation (18+, allowed fields), privacy of profiles/private data, server-only collections (incl. `chatFlags`, `duoInvites`), message sending/editing, unread and unmatch updates, recipient-only safety warnings, Duo chats (every other member +1, no unmatch), duos and their likes readable by members only while active, reports, photo upload limits |
| Functions end-to-end (28) | `firebase emulators:exec --project demo-muse --only auth,firestore,functions,storage "npm --prefix firebase/functions run test:integration"` | Feeds respect both people's preferences and leak no private data; matches only on mutual likes; idempotent swipes; unread counts; profile snippet sync; undo; block; account deletion purge; test-cohort isolation; auto-moderation. Also likes-you and AI suggestions, chat safety (warnings, masked previews, flags, repeat-offender hiding), and the whole Duo flow: invite, confirm, decline, guess limit, deck, undo, match, group messages and warnings, group openers, leaving, deletion |
| UI flows (Maestro) | `./scripts/test-e2e.sh android` | Onboarding, discovery, chat, Vibe First, report/block progress and strict verification |

Counts as of 2026-10-10. `./scripts/verify.sh` uses its own ports (`firebase.verify.json`) and temp folder, so it's safe to run while the group's test server is up.

## Delhi NCR iteration checks

`e2e/vibe-first.yaml` covers sign-in, switching from People to Vibe first, deliberate photo reveal, resetting the reveal after a pass and undo, premium duration selection/totals, disabled purchase, a pinned back button after scrolling, and unverified status. It runs against seeded emulators: `tools/maestro/bin/maestro --device <device-id> test e2e/vibe-first.yaml`. Screenshots go to `codex-artifacts/delhi-ncr-ui/`.

Verification unit/integration tests reject malformed/expired/unbound approvals, changed photos, forged approvals and moderator claims. Rule tests check pair and all-four-member Duo contact gates, bans in preview mode, immutable snapshots and access/evaluation limits. Billing tests cover fixed expiry, sandbox rejection, signed callbacks and stale grants; AI tests cover both-party consent, payload privacy and fallback. Call tests verify cryptographic signatures, room scope, blocks and membership. This does not validate live liveness, photo authenticity detection, real store checkout/refunds/restore, real model quality or call-provider sessions. See [production setup](production-integrations.md).

## On-device checks before sharing a build
1. Build with `./scripts/android/build-test-apk.sh`.
2. Start a separate QA server (`docs/test-backend.md`, "Testing changes without touching the group's server").
3. Connect the emulator to the QA link and walk the changed screens.
4. A small helper script can act as other seeded members (create a Duo, like a pair, send a message) through the client SDK, so flows that need several people can be tested on one device.
5. Share the APK only after this pass.

## Maestro flows
`scripts/test-e2e.sh` refuses occupied ports and creates an isolated temporary function workspace. It never rewrites developer environment/secrets. It starts the Firebase emulators, builds the functions, seeds demo data (`firebase/functions/scripts/seed.js`), starts Metro in test mode (`EXPO_PUBLIC_E2E=true`, which only swaps the system photo picker for a sample photo), builds/installs the selected Android emulator or iOS simulator app and runs `e2e/*.yaml`. Run one flow with `MUSE_E2E_FLOW=chat.yaml`. The runner switches verification policy only in the guarded demo emulator, per flow. Android builds are incremental; `MUSE_E2E_SKIP_BUILD=true` explicitly reuses an existing binary. iOS uses Xcode/CocoaPods and a selected simulator.

## Screenshots
`e2e/screenshots.yaml` captures the main screens (Welcome, Discover, full profile, Matches, Profile, Settings) for visual QA. Run it against the seeded emulators with `maestro test e2e/screenshots.yaml`. Use real, licensed photos (not the seed placeholders) for Play listing screenshots.

## Test server
`node tools/test-backend/check.js <invite link>` checks a running test server (`scripts/test-backend.sh`) end to end through the tunnel, using a throwaway account it deletes afterwards. It confirms that sign-in, queries, functions, live connections and refresh work, and that forged tokens, admin keys, emulator admin APIs and other projects are refused. See `docs/test-backend.md`.

## Troubleshooting
If the app keeps running old code after edits, watchman has missed file changes. Run `watchman watch-del-all`, then restart Metro with `npx expo start --clear`.

## Manual checks before a release
See `QA_CHECKLIST.md`.

The verification-required UI flow is `e2e/verification-required.yaml`. Set the **emulator's** `runtime/trust.requireVerification=true` using Admin SDK first, then run Maestro. It confirms discovery is gated, unavailable capture cannot run, and safety remains reachable. Restore the emulator exception afterwards. Do not run rule tests (which clear the database), integration tests (which change policy), or these UI flows concurrently on the same emulator project.

## Browser and marketing

See `docs/web-preview.md` for reproducible builds, browser QA and production limits. Marketing layouts were checked at 1440, 390 and 320px. Browser membership checks use seeded emulators and real authenticated calls, including refresh persistence, Vibe First, chat, report/block/progress, sign-out and real photo bytes through Storage rules. The demo photos are fixtures, not evidence of liveness or authenticity.
