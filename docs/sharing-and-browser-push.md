# Profile sharing, return metrics and browser notifications

Web release, 2026-10-17. Free accounts have 10 likes and 1 Super Like per UTC day; Plus remains 100 likes and 5 Super Likes. Existing usage is retained, so someone who already used 10 likes today has none left until reset. This is a trial to assess with return and matching activity, not evidence of improved retention.

## Profile links

Profile → Share my profile copies or shares `https://www.paire.in/app/?profile=<uid>`. Every member has a stable uid; the link identifies a profile without authorizing its contents. Sign-in, email confirmation and onboarding happen first, with the link retained. Self links open Preview. Other profiles use `getSharedProfile`, which checks current mutual eligibility, visibility, cohorts, verification, blocks, prior swipes and incognito. Private photos remain hidden. Unavailable profiles show a generic unavailable screen. The app carries noindex and anonymous visitors receive no profile content or personalized social preview.

## Returning members

The metrics dashboard has separate counts for returning activity and explicit sign-ins in the last 24 hours and 7 days. A return must occur at least 24 hours after account creation. Returning activity uses profile `lastActiveAt`, so a persistent session can count; members who hide activity can be absent. Explicit sign-ins use Firebase Auth `lastSignInTime`, never token refresh. Staff, test, disabled and disposable support accounts are excluded from these return counts. Counts are a recent snapshot, not a full session history or a cohort retention rate.

## Browser notifications

Profile → Browser notifications, or Settings → Browser notifications. The member must press Enable notifications and grant browser permission. No automatic permission prompt, marketing blast, fabricated activity or scheduled re-engagement campaign. Existing match/message/Duo events deliver to opted-in browsers. Each browser can turn them off, and account preferences independently control messages, matches and previews. Personal previews are off unless explicitly enabled.

Uses the standards-based Push API and `web-push`, alongside the unchanged Android FCM transport. `paire-push-sw.js` has no fetch handler and caches no member data. It stores only an account binding in its own IndexedDB store, drops pushes for other accounts, suppresses duplicates while Paire is focused and opens the intended chat/Duo on click. Notification destinations recheck the current uid and normal chat authorization. Sign-out clears the binding, closes displayed alerts and unsubscribes. A returning opted-in account reconnects without another permission prompt; another account must opt in separately. Support views cannot register or receive browser alerts.

Subscriptions live in server-only `webPushSubscriptions`, with validated browser-service endpoints and encryption keys. Registration rebinds a browser to its current account, caps it at 10 subscriptions per account and rate-limits registration. 404/410 subscriptions and deleted-account records are removed. Payloads expire after one hour and chat events collapse by topic. Browser settings, OS restrictions, connectivity and provider availability can affect delivery. iOS/iPadOS requires a supported Home Screen web app and a deliberate permission gesture.

### Credentials and deployment

- `WEB_PUSH_VAPID_PUBLIC_KEY` in Functions `.env`; public, returned by an authenticated callable.
- `WEB_PUSH_VAPID_PRIVATE_KEY` in Firebase Secret Manager. Keep the same key pair for existing subscriptions. Never put the private key in Vercel, client code or Git.
- Bound to `swipe`, `onMessageCreated`, `acceptDuoInvite`, `answerDuoRequest`, `leaveDuo` and `duoSwipe`. Deploy these functions with the new subscription/config/profile functions, metrics, allowance and account-deletion updates before the website.
- No extra Firebase rules grants: the subscription collection stays server-only. No billing, presence, paid chat or sales switches are changed.

**Production release (2026-10-17):** commit `a35663c` is on `main`. Firebase Functions deployed successfully to `muse-352ba` (14 functions, including the VAPID secret bindings); the VAPID public key is configured and the private key remains in Secret Manager. The Vercel production build was promoted to `www.paire.in` after Firebase was ready. The live smoke check confirmed the profile sharing and notification bundles, 10-like pricing copy, service worker response and authenticated callable protection. Real browser push-provider delivery has not been exercised; see the validation note below.

### Validation

`./scripts/verify.sh`: 460 tests passed (105 app, 224 Functions unit, 52 rules, 79 integration). Covers ten/eleven-like enforcement, current profile privacy, endpoint validation, subscription ownership, support restrictions, preview privacy and expired subscriptions.

For browser QA, start isolated demo-muse emulators and emulator-configured Metro as in `web-preview.md`, then:

```sh
MUSE_WEB_QA=demo-muse node scripts/web-qa-proxy.cjs
MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/sharing-and-browser-push.cjs
```

This uses fictional accounts and a mocked push broker. It checks link handoff through sign-in, copying the correct link, explicit permission, worker binding/display/suppression, disabling, sign-out, returning opt-in and a different account. It never creates real push subscriptions or sends to real devices. Real Chrome/Firefox/Safari broker delivery and physical-device behavior remain acceptance checks after members opt in. Implementation follows [WebKit's Web Push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) and the [web-push library](https://github.com/web-push-libs/web-push).
