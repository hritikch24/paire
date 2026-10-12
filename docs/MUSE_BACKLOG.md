# Muse product backlog (A→Z, January 2026 archive)

This is the original long-range feature map, kept for reference. The current backlog and open decisions are in `docs/PRODUCT_BACKLOG.md`.

This backlog captures end-to-end product functionality and acceptance criteria. We ship in small increments.

## A→Z Feature Map (end-to-end roadmap)

### A — Account & identity
- Feature: Email/phone/social sign-in, guest mode.
- Acceptance: Users can log in/out, recover access, and guest mode has clear limits.

### B — Basics (app start)
- Feature: Welcome, onboarding chooser, permissions priming.
- Acceptance: Primary CTAs fit on small screens with no clipped content.

### C — Creation (profile build)
- Feature: Profile basics, photos, prompts, interests, preferences.
- Acceptance: Users can complete onboarding in < 60 seconds, progress saves.

### D — Discovery
- Feature: Swipe/feed with Like/Nope/Super and filters.
- Acceptance: Button and gesture parity with haptics; no jank on mid-tier devices.

### E — Engagement
- Feature: Daily prompts, streaks, and light nudges.
- Acceptance: Prompt surfaces appear once/day and can be dismissed.

### F — Filters & preferences
- Feature: Distance/age/language/vibe preferences.
- Acceptance: Filters update the feed within one refresh and persist.

### G — Growth loops
- Feature: Referral invites, shareable moments, friend onboarding.
- Acceptance: Share flows open native share sheets and generate deep links.

### H — Haptics & micro-interactions
- Feature: Subtle haptics for core actions.
- Acceptance: Like/Match/Undo haptics trigger once per action.

### I — Identity & verification
- Feature: Optional photo/video verification.
- Acceptance: Verification badge renders across profile and discovery cards.

### J — Joy (match moment)
- Feature: Match celebration and message starter.
- Acceptance: Overlay appears after mutual-like and is dismissible.

### K — KPIs & analytics
- Feature: Funnel tracking + retention cohorts.
- Acceptance: Events fire for onboarding steps, swipes, matches, chats.

### L — Localization
- Feature: Hindi + regional language support.
- Acceptance: Language selection fully localizes onboarding and prompts.

### M — Matching engine
- Feature: Ranking and fairness logic.
- Acceptance: Feed respects filters; no duplicate profiles within a session.

### N — Notifications
- Feature: Push for match/message + quiet hours.
- Acceptance: Pushes sent for key events and can be muted.

### O — Offline & resilience
- Feature: Graceful offline states and retry.
- Acceptance: Network errors show clear CTAs and no blank screens.

### P — Payments & premium
- Feature: Subscriptions, boosts, supers, rewinds.
- Acceptance: Premium unlocks are consistent across app surfaces.

### Q — Quality gates
- Feature: Crash reporting + performance tracing.
- Acceptance: Crash-free sessions > 99.5%; p95 screen load tracked.

### R — Reporting & block
- Feature: Report/block with evidence capture.
- Acceptance: Report removes the user from feed and blocks chat.

### S — Safety & consent
- Feature: Safety center, date check-ins, consent prompts.
- Acceptance: Check-in flow works end-to-end with reminders.

### T — Trust signals
- Feature: Badges for verification, mutual friends, shared communities.
- Acceptance: Trust badges render consistently on cards and profiles.

### U — UX accessibility
- Feature: Dynamic type, large tap targets, talkback labels.
- Acceptance: Primary flows usable at 1.3x font scale.

### V — Voice & video
- Feature: 1:1 + group calls with safety gates.
- Acceptance: Calls are free, no recording, and show safety notice.

### W — Well-being
- Feature: Time limits, break reminders, respectful use nudges.
- Acceptance: Users can set limits and get gentle reminders.

### X — eXperiments
- Feature: Feature flags and A/B testing.
- Acceptance: Flags can be enabled/disabled without app update.

### Y — Yield/monetization
- Feature: Pricing tests, value messaging, upgrade modals.
- Acceptance: Upsell copy is visible but non-blocking.

### Z — Zero-trust privacy
- Feature: PII minimization and secure storage.
- Acceptance: No PII in logs; tokens stored securely.

## P0 — Core User Value (must work now)

### Welcome + Auth
- Feature: Welcome screen with Login, Create Account, Explore as Guest.
- Acceptance:
  - Given the app is opened, when the user taps any CTA, then they reach the correct next step without crashes.
  - Guest path reaches Discover within 2 taps.

### Onboarding
- Feature: Guided onboarding (profile basics → photos → interests → safety).
- Acceptance:
  - Given a new user, when they complete fields and tap continue, then progress is saved and they can resume.
  - All onboarding screens remain fully visible/scrollable on small devices.

### Discovery Feed
- Feature: Swipe cards with Like/Nope/Super.
- Acceptance:
  - Given the user taps Like/Nope/Super, then the card animates off-screen and the next card appears.
  - Given a swipe gesture, the same result occurs with haptics.
  - Given the end of the stack, a friendly empty state appears with a Refresh CTA.

### Match Moment
- Feature: Lightweight match celebration.
- Acceptance:
  - Given a mutual-like (or stubbed match), a match overlay appears with “Say hi” and “Keep swiping”.
  - Guest mode shows a “Create account to chat” guardrail.

### Chat (Gated)
- Feature: Chat access only after match.
- Acceptance:
  - Given no matchId, chat input is disabled and a gating message is shown.
  - Given a matchId, messages send and appear in the thread.

### Safety & Reporting
- Feature: Report/Block actions in Chat and Profile.
- Acceptance:
  - Given a report/block, the action completes and the user is removed from the feed.

## P1 — Quality + Growth (next)

### Profile Quality
- Feature: Photo guidance + prompts + profile completeness meter.
- Acceptance:
  - Given <3 photos or empty bio, user sees clear completion prompts.

### Discovery Performance
- Feature: Image prefetch + smooth animations.
- Acceptance:
  - Swipes remain smooth (no visible jank) on mid-tier Android.

### Notifications
- Feature: New match/message notifications.
- Acceptance:
  - Given a new message, a push notification is queued and delivered.

### Verified Profiles
- Feature: Photo/video verification.
- Acceptance:
  - Given verification, a badge is shown across profile surfaces.

### Anti-Harassment
- Feature: Message filters + consent nudges.
- Acceptance:
  - Given unsafe language, user is warned before sending.

## P2 — Retention + Monetization

### Premium Features
- Feature: Boosts, Super Muse packs, undo, advanced filters.
- Acceptance:
  - Given premium, features unlock and are applied to discovery.

### Social Proof + Events
- Feature: Local events, shared groups, curated drops.
- Acceptance:
  - Given a city, user sees relevant events and can RSVP.

### Voice/Video Calls
- Feature: 1:1 + group calls with safety prompts (free via Jitsi/meet.jit.si by default).
- Acceptance:
  - Given a match, user can start an audio or video call from chat.
  - Given a group call link, multiple matches can join the same room.
  - Calls are free, no recording; a clear safety notice is shown before joining.

## India-first Trust + Safety (priority across P0/P1)

### Safer First Meet
- Feature: Date check-in + share-a-plan (optional) with trusted contact.
- Acceptance:
  - Given a user schedules a first meet, they can share venue/time and enable timed check-ins.
  - Given a missed check-in, the app prompts the user and offers quick support actions.

### Language + Culture Fit
- Feature: Multilingual onboarding + prompts (Hindi + regional languages).
- Acceptance:
  - Given language selection, all onboarding prompts/localized strings display correctly.
  - Users can filter by shared languages.

## System & Ops (ongoing)

### Analytics
- Feature: Funnel tracking + cohort retention.
- Acceptance:
  - Events fire for onboarding steps, swipes, matches, chats.

### Reliability
- Feature: Error tracking + performance dashboards.
- Acceptance:
  - Crash-free sessions > 99.5% in release builds.

### Privacy
- Feature: PII minimization + encrypted tokens.
- Acceptance:
  - No PII in logs, tokens stored securely.
