# Owner notification console

2026-10-21. Browser-only; release status is in `web-changes.md`.

## Owner workflow

Metrics (`/metrics/?key=admin`) → **Notifications**, or `/app/?admin=notifications`. Sign in with the existing enabled owner account. The link survives sign-in and onboarding and uses `/app/` history/back navigation.

The console shows registered members/browsers, explicit reminder opt-ins, their overlap, and currently eligible recipients. Preview uses the same current profile, verification, block, incognito, search, inactivity and frequency checks as delivery. It does not reserve an attempt, send a push or return recipient IDs. Up to three real eligible reminder variants are displayed, with aggregate skip reasons. These are the existing factual new-people/Garba prompts and rotating discovery invitations; the owner cannot override targets or invent match/message activity through this API.

**Send eligible reminders now** reviews the current count and asks for a deliberate Send. The server rechecks eligibility and the global reminder switch. Manual and daily runs share the two-attempts-per-seven-days/72-hour budget, opt-outs and pre-delivery reservations. At most five new manual runs per owner per UTC day are allowed. Previewing/refetching does not send. A preview can change before delivery, so its ready count is not a promise of sends.

Each manual run has a UUID retained in the owner's session storage until acknowledged. The deterministic `notificationCampaigns/{actorUid}_{requestId}` audit is created before work begins. A repeated or overlapping request for that reference returns the same record rather than starting another run. Progress summaries are written per 100-member page, with five concurrent eligibility/delivery operations. Completed, partial, stopped and failed outcomes are distinguished; `running` means completion has not been confirmed. **Check previous run** can acknowledge it without starting another send, even while automation is off. After ten minutes (longer than the function's maximum execution), an uncompleted run is acknowledged as `interrupted`. It is never replayed automatically: review partial counters/history before considering a new run. Recipient-level reservations also protect against overlap with the normal scheduler.

The history shows the last ten manual runs; seven India calendar days of attempts, push-service accepted members and reminder opens are also shown. Failed pushes and per-member check errors stay visible. Accepted means accepted by a push service, not proof that a device displayed the notification or someone read it. This console neither changes the scheduler's 18:30 IST schedule nor enables a disabled runtime switch.

**Send test to my browsers** sends a clearly labelled test only to the signed-in owner's registered browsers, regardless of any caller-supplied target. It is capped at five/day, expires after 60 seconds, and is permitted to display while Paire is focused so the owner can actually inspect it. It opens `/app/`, not a fictional chat/match. It still requires a registered, account-bound browser and browser/OS permission. It never changes reminders/preferences or sends to customers.

## Member setup

Settings → Browser notifications → **Enable reminders** combines browser registration and explicit People & events opt-in in one deliberate click. It requests browser permission only from that click, then saves `notifications.reminders=true` after registration succeeds. Existing match/message/preview choices are preserved. If permission is denied, reminders are not enabled by this action. Existing event-only controls and the separate category opt-out remain available. iPhone/iPad Home Screen requirements still apply. No existing members are enrolled automatically.

## Security and deployment

`adminGetNotificationConsole`, `adminSendReminderRun` and `adminSendNotificationTest` require `requireSupportOperator`: moderator + supportAccess in the token and current enabled Auth account, and enabled `supportOperators/{uid}`. Ordinary moderators, members, forged/revoked roles and read-only support identities are denied. Clients cannot read/write `notificationCampaigns`; no new rule allow, index, dependency, provider credential or native change is needed. Run requests accept only a valid UUID; caller copy and targets are rejected. Test targets are always the owner.

Deploy the three admin callables and `sendEngagementReminders` with the website/browser app/worker. Send and test bind the existing `WEB_PUSH_VAPID_PRIVATE_KEY`; preserve the current key pair and runtime preferences. Other match/message/native transports keep their existing behavior. The daily scheduler still sends relevant reminders automatically as subscribers complete setup; the owner console is an additional manual operation.

## Validation

Run `./scripts/verify.sh`. Integration covers live owner authorization, preview without sends/reservations, aggregate overlap, concurrent/repeated run UUIDs, shared cooldown, runtime/opt-out checks, supplied-target/copy rejection, owner-only test targets, actual support-session denial, and client collection denial. Transport tests use a simulated provider and check test labels/expiry. Browser QA is emulator-only:

- `MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/sharing-and-browser-push.cjs`: explicit one-click setup, preserved preferences, worker test display while focused, binding, sign-out, category opt-outs and reminder click routing.
- `MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/notification-console.cjs`: ordinary-member denial, Metrics → owner sign-in → read-only preview, 320/390px layout, deliberate audited run/cooldown, truthful zero real-push acceptance in the emulator, self-test feedback and Back to `/app/`.

The scripts require the isolated demo-muse UI workspace and local proxy from `web-preview.md`. All QA accounts are fictional. Real provider/device delivery is not established by a simulated broker; the owner's new test button is available for a deliberate real-device acceptance check after release. No campaign/test to a production account is necessary for release verification.

Validation passed: **556 checks** (117 app, 260 Functions unit, 52 rules, 127 integration), production build, both browser suites and a visual check of the console at 320 px. The first full integration run had one transient emulator transaction failure in the unchanged payment-concurrency test; subsequent full verification passed, including that case and interrupted-run recovery. No production accounts or push services were used for QA.

## Production release

2026-10-21: `ba7dcab` and the interrupted-run recovery `af8faba` pushed to `main`. Initial console deployment `paire-aevo7hi9l` reached Ready; final browser deployment `paire-2oqcx2tmr` (`dpl_EGfJBJQ29EAxCrt97dnaQ9cxsY8u`, source `62f6000`) is Ready and serves www.paire.in. Public reads verified Metrics → Notifications, the console/self-test/combined opt-in/Check previous run UI in the current app bundle, and the focused-test worker behavior. All three new admin endpoints rejected anonymous requests with HTTP 401 / UNAUTHENTICATED.

All four deployed handlers read back ACTIVE: `adminGetNotificationConsole` (`00001-dac`), `adminSendNotificationTest` (`00001-wus`), `sendEngagementReminders` (`00004-yax`), and final `adminSendReminderRun` (`00002-jak`, updated 10:24:01 UTC). The existing VAPID pair, reminder switch/schedule and member preferences were preserved. No Firestore rules/index deployment or native build was needed. No production member login, campaign, test notification, email or payment was performed for this release.
