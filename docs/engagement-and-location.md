# Browser reminders and location

2026-10-18. Web only. Match/message notifications remain event-driven. A separate **People & events** switch in Settings explicitly opts into discovery and seasonal reminders; missing/false means off, including every existing account. Enabling the category does not bypass browser permission. The compact setup prompt leads to Settings without opening a permission dialog. Profile also links to these controls.

## Reminder rules

- Daily scheduler check at **18:30 Asia/Kolkata**, on every weekday. The per-member inactivity and frequency limits below still apply.
- At most **two attempts in a rolling seven days**, at least **72 hours apart**. Failed sends also consume an attempt, preventing repeated retries. Members active in the last 24 hours or absent for more than 30 days are skipped.
- A discovery reminder requires an unswiped eligible profile fitting the recipient's own search preferences. A genuinely new profile (created since the last visit/reminder and within seven days) gets the factual new-people copy; an older eligible profile gets one of five rotating invitations to explore and send a thoughtful like. No copy invents a like, message, match or guaranteed outcome. The scan is bounded to the first 100 indexed candidates. No eligible result means no message.
- Garba reminders require chosen nights tonight/tomorrow, approximate location refreshed in the last seven days, and an eligible person within 50 km sharing one of those nights. At most one attempt per season. No dates, names, profile photos or private preference details appear in the push.
- Current profiles/settings and verification are checked after the discovery index scan. Blocks, previous swipes, test cohorts, incognito and the recipient’s search preferences apply. Hidden, unverified, disabled and staff recipients are skipped. Opt-out is checked again before sending.
- A transaction reserves each attempt before the network request, preventing overlapping scheduled runs from duplicating it. These reminders use browser subscriptions only; native notification behavior is unchanged.

The push opens the appropriate People/Garba edition, checks the receiving account, and records one open per latest reminder. A notification is a route back to the app, never a claim that someone liked or messaged the recipient. No emails, fabricated activity, blanket marketing send or new payments are involved.

## Operation and measurement

`runtime/notifications.remindersEnabled === true` is required. Missing/false is off. Set this deliberately when the backend and browser app are released; set false to stop scheduled reminders. Existing per-member consent is never backfilled. `notificationReminders/{uid}` stores the opt-in queue, last two recent attempts, latest reminder id/type/open and the last Garba season attempted. Account deletion removes it. The settings trigger mirrors opt-in; browser registration repairs a missed mirror. Both collections remain server-only under existing default-deny rules.

The scheduler binds the existing `WEB_PUSH_VAPID_PRIVATE_KEY`; preserve its existing key pair. Deploy `sendEngagementReminders`, `recordReminderOpen`, `onUserSettingsWritten`, `registerWebPush`, `getMetrics`, `deleteAccount`, `onAuthUserDeleted` and Firestore rules before the browser release. The dashboard adds registered browsers, reminder attempts, member reminders accepted by a push service, and reminder opens over seven India calendar days. Push service acceptance is not proof of device display, reading or increased retention. Compare reminder opens and returning-member activity over time; a causal retention claim needs a controlled experiment.

For an owner-requested run, `node scripts/run-engagement-reminders.mjs --project muse-352ba` prints aggregate browser/opt-in overlap and scheduler status without sending. Add `--confirm` to invoke the existing scheduled job once. The script does not enrol members, bypass checks, enable a disabled job/switch, fabricate activity or change customer matches. With no overlapping audience it sends nothing. Browser notification settings distinguish a saved People & events preference from a connected browser, and explain the missing step.

The 2026-10-21 pre-release snapshot had five registered browsers across five members and three reminder opt-ins, **zero** with both. This is not a failed-delivery count: none was eligible for reminder transport. New match/message pushes continue to use their own event preferences. Random-pair matching and message notification acceptance tests use only fictional demo-muse accounts and a mocked delivery transport; no customers are randomly matched.

## Location behavior

Location was already optional and used for mutual distance preferences and local Garba matching. On the web it now uses the browser's own Geolocation API with a 12-second timeout, five-minute maximum cache age and no high-accuracy request. Coordinates are rounded to two decimals before storage, roughly a 1 km grid. Other members receive rounded distances, never coordinates. There is no new reverse-geocoding provider, background tracking, IP-based inference or proof of a person's physical identity/location. The profile city is edited separately.

Only an explicit Use/Refresh click can prompt. Foreground refresh reads only previously granted permission; one-time/expired permissions do not cause surprise dialogs. A same-cell position is refreshed at most daily to keep its timestamp useful. Settings explains the active state, last refreshed date, browser permission recovery and manual Refresh. Turning location off clears the saved point. Browsing without it remains available; distance limits cannot reliably exclude profiles without known positions.

## Research and product choice

- [Chrome/web.dev permission guidance](https://web.dev/articles/permissions-best-practices): context and a deliberate action before asking for access. This supports an inline setup action and explicit settings choices.
- [MDN Web Push best practices](https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices): useful, timely notifications and easy opt-out. This supports real eligibility checks, a separate reminder preference and frequency limits.
- [Geolocation API options](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition): finite timeout, cache control and permission checks. This fixes the browser's unbounded location wait without adding more tracking.
- [WebKit's iOS/iPadOS Web Push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/): a Home Screen web app and a deliberate permission action. The additional product improvement is an **Add Paire to Home Screen** control/guide in Settings, with a native browser installation prompt where supported and clear manual steps elsewhere.
- [Firebase scheduled functions](https://firebase.google.com/docs/functions/schedule-functions): scheduled invocations can overlap. Reservation transactions protect the reminder budget.

The current priority is making real connections easier to resume and measuring that behavior. A useful next experiment is a small, optional first-conversation prompt chosen from shared interests after a match; Paire already has suggested openers, so validate whether members use those before building another overlapping feature.

## Validation

Use `./scripts/verify.sh` and the isolated browser QA described in `web-preview.md`. The reminder tests cover explicit consent, inactivity, frequency, stale/hidden/blocked/incognito profiles, current preferences, Garba season/location rules, overlapping scheduler runs and recipient-bound open deduplication. Browser QA uses fictional accounts and a mocked push broker. Actual provider delivery and physical-device behavior require opted-in devices and are not claimed by emulator tests.

Validation passed: **498 automated checks** (109 app, 239 Functions unit, 52 rules, 98 integration). The browser suite passed sharing, account binding, explicit reminder opt-in/opt-out, reminder routing/open measurement, rounded location, refresh/disable/permission recovery, and the Home Screen guide at 320 px. Discovery regression passed six viewport sizes, touch scrolling, Pass/Undo, note composition, Vibe first and Duos.

## Production release

Commit `2554ff4` pushed to `main`; seven Functions and Firestore rules deployed to `muse-352ba`. GitHub-triggered Vercel deployment `paire-447zpzozs-team-rockstar.vercel.app` reached Ready and serves `www.paire.in`. The live smoke check passed the browser bundles, reminder worker routing, privacy copy, dashboard and anonymous-call refusal. The scheduled function is Active with the existing public/private VAPID pair configured, its Cloud Scheduler job is Enabled at `30 18 * * *` / `Asia/Kolkata`, and `runtime/notifications.remindersEnabled` was explicitly enabled after the website check. No existing members were enrolled and no manual campaign was sent. The initial production snapshot had two registered browsers and zero reminder attempts.

## Navigation and reminders release (2026-10-21)

Owner-requested sequence completed: navigation (`96ff04c`), reminder improvements (`086ded5`), then build/push/deploy from `5c9ebcc`. Full verification passed **549 checks** (117 app, 259 Functions unit, 52 rules, 121 integration), including real reciprocal swipes between random fictional users, message-event recipient routing and ended-match/system-note suppression. Final app lint/typecheck/unit checks, production export, 45 generated-page home-link checks, mobile browser Back/Forward/shared-link/sign-out acceptance and mocked-broker push/privacy/opt-in/routing acceptance passed. No customer accounts were used for QA.

Vercel `paire-dq1y36wjn` (`dpl_AMggZLs1Q3uvjRhhtWPvMucqX2us`) reached Ready. Public reads confirmed `/app/` home links on the landing, pricing, legal, auth and metrics pages, plus the browser navigation/back fallback and notification setup status in the current app bundle. Firebase `sendEngagementReminders` is ACTIVE (`sendengagementreminders-00003-vog`, updated 06:31:14 UTC); its existing job remains ENABLED at `30 18 * * *` / `Asia/Kolkata`. No new rules, native build, credentials or runtime-switch changes were needed. IndexNow returned 200 for 40 URLs.

The explicitly requested production send operation was run with `--confirm`. It found five browser registrations and three reminder opt-ins, with **zero overlapping members**, so it deliberately sent **zero** reminders and did not invoke a pointless scheduler run. No consent/preferences, customer matches, payments or emails changed. Future eligible, opted-in browsers can receive the daily-checked reminders within the existing two-per-week/72-hour cap. Real physical-device/provider delivery remains unverified; the successful browser tests used a simulated broker.
