# Member admin and support access (web)

Sign in at `/app/` with a moderator account, then Settings → Member admin. Browse Women/Men or find a member by their exact email or Firebase uid, including accounts that have not finished their profile. Details show profile/photos, account status and payments. Settings → UPI payments to confirm remains the payment review queue.

Owner support access is a separate permission, deliberately not given to every moderator. On a member detail page, enter a 10–500 character reason or support ticket reference and choose **View as member**. A separate tab opens the actual browser application with that member's profile, settings, feed, likes, matches and chats. The banner identifies the member, the read-only restriction, the 15-minute expiry and Exit. The original admin tab stays signed in. Refreshing the support tab ends its local session; open another from the admin panel. Recent support sessions and an End session button appear on the member detail page.

## Authorization and data access

The server requires both `moderator: true` and `supportAccess: true`, checks the current Auth account (including disablement and current claims), and requires `supportOperators/{adminUid}.enabled == true`. Starting access also requires an admin sign-in within the last 15 minutes; older sessions must sign out and back in. Regular members and moderators without support permission cannot mint credentials. Staff accounts cannot be targets.

Each session uses its own `support_<sessionId>` Firebase identity, never the member's Auth identity. Tokens stay in memory and pass only through an origin- and window-checked `postMessage` exchange; no credential is put in a URL or browser storage. The support tab uses a separate named Firebase app with memory-only authentication. The member's password, sessions, sign-in timestamps and credentials are untouched.

Firestore reads resolve the member uid from server-created claims and an active server-only session record. Every database write and every Storage request using a support credential is denied. Photos already shown through download URLs keep working as they do for members. `requireAuth` rejects support credentials by default, including attempts to reach destructive or moderator functions. Only reviewed read endpoints opt in through `requireReadAuth`, which checks expiry, live revocation and uid binding. Billing reads use cached entitlements without reconciling payments; support browsing does not consume the member's quotas, update presence/location/last-active, repair profile data or mark chats read. This means it can diagnose access problems but cannot reproduce sends, swipes, purchases, uploads or credential changes. Cached billing can differ from a fresh provider reconciliation.

Session audits record the admin uid, member uid, reason, start/expiry/end time; they do not copy chat contents or tokens. A daily cleanup deletes expired disposable Auth identities and audits older than 365 days (bounded batches of 200 per run). Server checks and rules refuse expired/revoked sessions regardless of cleanup. Read data already displayed or copied cannot be recalled; the UI removes its view on exit, expiry, revocation check or loss of connection. Disabling an operator's document revokes all their support sessions; the provisioning script does this before removing the claim.

## Rollout

Deployment does not automatically grant any member or moderator the separate owner support permission. Notify existing members of the Terms/Privacy support-access change before enabling access, as the current policy promises. Limit access to member-requested troubleshooting and record the related concern; a Terms clause alone is not a blanket justification to browse private conversations.

When the owner requests rollout, deploy the backend **with rules and indexes first**, then the website/browser app. Do not deploy only the token-minting functions with older database rules. The runtime service account needs the Firebase Auth permissions used here and permission to sign custom tokens (`iam.serviceAccounts.signBlob`); provider signing errors cause the audited session to be ended without returning a credential. The emulator tests do not verify production IAM. Wait for the composite indexes to be ready.

To grant the chosen owner account after rollout, first inspect a dry run with existing admin credentials:

```sh
node scripts/set-support-access.mjs --project muse-352ba --email <owner-email> --access on
```

Add `--confirm` to apply. To revoke, use `--access off --confirm`. This changes only the support claim and live support-operator record, preserves other claims and leaves moderator permission intact on revocation. Sign out/in to refresh the menu. Production grants must be explicitly requested by the owner; no accounts are granted access automatically.

## Validation (2026-10-17)

`./scripts/verify.sh` passed: 105 browser-app unit tests, 219 Functions unit tests, 52 security-rule tests and 76 backend integration tests. The website/browser export builds with `node apps/web/scripts/build.mjs`.

The emulator-only browser test is `e2e/support-admin.cjs`. After starting an isolated `demo-muse` UI emulator workspace and Metro as described in `docs/web-preview.md`, run:

```sh
MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/support-admin.cjs
```

It seeds fictional users, grants only the fictional Dev account support access, and checks email lookup, separate gender lists, chat inspection without read receipts, the original admin login after refresh, server revocation, memory-only support refresh, unfinished onboarding and Exit. It never uses production accounts or payments. The production service account's token-signing IAM and live index readiness remain deployment checks.


## Production deployment (2026-10-17)

Admin backend commit `5bb698e` and mobile browser layout commit `8958b5c` are deployed. Firebase Functions, Firestore rules/indexes and Storage rules deployed successfully; the three new indexes are READY. The runtime service account has token-signing access to itself. The owner selected `hritikchaudhary016@gmail.com`; only that account received the separate support permission and enabled operator record. Sign out and back in before opening Settings → Member admin → a member → View as member.

Vercel production deployment: https://paire-duvt2hpfe-team-rockstar.vercel.app, aliased to https://www.paire.in. The live app bundle includes the new layout and support controls; the public Terms and Privacy pages include support-access disclosures. Anonymous support-session requests return HTTP 401. IndexNow accepted all 39 URLs (HTTP 200). No production member sessions were opened and no real payment was tested. Existing payment configuration was preserved.

The latest full verification passed 452 tests. `e2e/discovery-layout.cjs` passed at 320×568, 360×660, 390×844, 430×932, 740×360 and 1440×900, checking a viewer with no photos, card height, reachable controls, touch scrolling without accidental swipes, Pass/Undo, notes, Vibe first, Duos and profile navigation. The admin browser regression and Garba night selection/editing also passed against isolated emulators. Screenshots are generated under `/tmp/muse-discovery-qa` by the layout test. Physical Safari/keyboard/browser-toolbar behavior was not tested.

The public legal templates still have an existing postal-address placeholder; no address was invented. Deployment publishes the disclosures but does not send members an email or a separate policy notice automatically.
