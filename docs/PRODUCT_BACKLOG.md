# Muse product backlog

Last updated: 2026-10-10. The "Now" section is current; everything under "Archive" is the original January plan, kept for reference (some of it, such as guest mode and offline demo mode, was deliberately dropped).

## Decisions waiting on you
| Decision | Recommendation | Where |
| --- | --- | --- |
| Public app name | Keep Muse until chosen; new creative shortlist: Aarzo, Miltaa, Raabta (not cleared) | `docs/product/delhi-ncr-direction.md` |
| Launch focus (decided) | Delhi NCR first; registration/discovery remain open elsewhere | `docs/product/delhi-ncr-direction.md` |
| Plus prices (decided 2026-10-11) | ₹20/24h, ₹99/7d, ₹299/30d; free 25 likes and 1 Super/day | `docs/product/india-v2-plan.md` |
| Genders (decided 2026-10-11) | Men and women only; "Show me" Men/Women/Both | `docs/product/india-v2-plan.md` |
| Optional religion field (never caste) | Yes, optional | `docs/product/market-strategy.md` |
| Keep the one-night-stand option in India | Keep (private, double opt-in, never in Duos) | `docs/product/market-strategy.md` |
| Your legal details on the policy pages, support email | Needed before launch | `docs/RELEASE.md` |

## Shipped recently
- India v2: sparks (likes with notes), privacy & control (notes-only, I'll message first, incognito, private photos, same intentions, speaks my language), Indian basics, close kindly, fair limits, new prices, web on Vercel (`docs/product/india-v2-plan.md`).
- Two-step sign-up, Muse AI matchmaking and icebreakers, free "Likes you", message notifications, new brand.
- Muse AI chat safety (scams, threats, abuse, under-18, links; English and Hinglish), with disclosure in the legal pages.
- Seven colour themes in light and dark; full "muse" wordmark on opening; transparent themed navigation bar.
- Duos: double dates with a friend and four-person group chats (`docs/product/duos-prd.md`).
- Likes gallery.

## Now (India launch, in order)
1. **Complete trust before public dating launch:** configure and acceptance-test the implemented Didit integration, immutable photo snapshots, signed callbacks, moderator reviews and mandatory gates. Staff moderation/appeals and test biometric erasure. See `docs/production-integrations.md`. No detector can guarantee every generated image is caught.
2. **Rename** once the name is chosen: display name, wordmark, legal pages. Preserve existing application IDs and Firebase registrations unless creating a separate app deliberately.
3. **Play launch basics:** Firebase Blaze in `asia-south1`, deploy, `google-services.json`, closed test with 12 testers for 14 days (`docs/RELEASE.md`).
4. **Privacy:** notification names/text are hidden by default, including legacy accounts; previews are an explicit free opt-in. Screenshot controls/contact avoidance/incognito remain future work. Photos in Vibe-first cards are covered until a deliberate reveal; this is not an anonymity guarantee.
5. **Premium integration:** configure store products and RevenueCat for the implemented native purchase/server validation paths, then test purchase, expiry, refunds and restore. Checkout remains unavailable without configuration. Confirm proposed weekly/monthly prices and unit economics.
6. **Consent:** a clear consent notice and a "withdraw consent" option in Settings (India's DPDP Act).
7. **Growth tooling:** per-creator invite links and codes, invite rewards, a city waitlist with launch gating, and a sign-ups/gender-ratio dashboard (`docs/product/market-strategy.md`).

## Next
- Hindi/Hinglish interface, then other Indian languages; Google sign-in.
- Web checkout for Plus passes with Razorpay (UPI), once a merchant account exists.
- Contact blocking (hide from my phone contacts) on Android; screenshot blocking in chat on Android.
- A moderation dashboard for reports and chat-safety flags (instead of the Firestore console).
- Photo screening (e.g. Cloud Vision SafeSearch) and Firebase App Check.

## Later / known limits
- Duo deck paging beyond the 300 most recently active pairs; `sharedVibesOnly` for Duos; spin a Duo chat off into one-to-one when two people both ask.
- Wingmate (a friend reviews your picks); Muse-hosted meetup groups after launch.
- US readiness: miles, US date format, and scam-warning notices.
- Crash reporting (Sentry or Crashlytics).

## Archive (January 2026 plan)

This backlog is the source of truth for feature planning. Each item includes acceptance
criteria. We ship in small increments and validate on device.

### P0 — Core Reliability + Experience

1) **Onboarding (≤60 seconds)**
   - Given a new user, when they open Muse, then they see Login / Create / Guest clearly.
   - Given they choose Create, when they finish profile basics, then they reach Discover without blockers.
   - Given they skip optional steps, when they tap Continue, then they can still proceed.

2) **Discovery Feed (smooth swipe + buttons)**
   - Given a profile card, when the user swipes left/right/up, then a matching animation + haptics occurs.
   - Given the Like/Nope/Super buttons, when tapped, then they trigger the same animation + haptics.
   - Given the deck is exhausted, when it ends, then an empty state with Refresh is shown.

3) **Match Moment + Chat Gating**
   - Given two users match, when the match is created, then a match moment modal appears.
   - Given the user is a guest, when they tap “Say hi”, then they are prompted to create an account.
   - Given a match ends, when a chat is opened, then it shows “Match ended”.

4) **Login / Demo / Offline**
   - Given the auth emulator is unreachable, when the demo login is used, then offline demo mode starts.
   - Given a valid account, when login succeeds, then profile loads and Discover opens.

5) **Layout Responsiveness**
   - Given small screens or large fonts, when viewing Welcome/Discover/Chat/Matches, then no CTA is clipped.
   - Given the screen is compact, when content exceeds view, then the screen scrolls safely.

### P1 — Trust + Retention

6) **Safety Center + Report/Block**
   - Given any profile or chat, when the user reports or blocks, then the action is confirmed and logged.

7) **Location (Opt-in)**
   - Given a user toggles location, when permission is granted, then distance and “Nearby now” appear.
   - Given permission is denied, then a clear CTA to Settings is shown.

8) **Match Management**
   - Given a user unmatches, when confirmed, then the chat closes and match becomes inactive.

9) **Notifications (stub → live)**
   - Given new message/match, when app is backgrounded, then notification is triggered (stub today).

### P2 — Differentiators

10) **Muse Now (Random chat/call)**
   - Given a user taps Muse Now, when starting random chat, then a safe, time-boxed chat begins.
   - Given a user starts a random call, then an in-app call room opens with consent required.

11) **Blind Date Mode**
   - Given blind mode is enabled, when swiping, then photos are hidden until first message.

12) **Shared Vibe Filters**
   - Given vibe filter is on, when Discover loads, then shared vibes are prioritized.

13) **Prompts & Icebreakers**
   - Given a chat starts, when suggestions appear, then they are personalized to the profile.

### P3 — Growth + Monetization

14) **Referral Links**
   - Given a user shares a link, when the recipient joins, then the referrer earns perks.

15) **Premium (Super Muse)**
   - Given premium, when swiping, then daily super likes are increased.

16) **Events / IRL**
   - Given location, when live events are nearby, then relevant cards appear in Discover.

### P4 — Analytics & Ops

17) **Analytics**
   - Track activation: onboarding completion, first like, first match, first message.

18) **Quality Dashboards**
   - Track crash-free sessions, latency p95, swipe drop-off, chat open-to-send.

### Notes
- We ship in micro-iterations with tests.
- If emulators are offline, we fall back to demo mode for QA.
