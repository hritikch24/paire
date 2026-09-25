# Muse Product Backlog (A → Z)

Last updated: 2026-01-29

This backlog is the source of truth for feature planning. Each item includes acceptance
criteria. We ship in small increments and validate on device.

## P0 — Core Reliability + Experience

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

## P1 — Trust + Retention

6) **Safety Center + Report/Block**
   - Given any profile or chat, when the user reports or blocks, then the action is confirmed and logged.

7) **Location (Opt-in)**
   - Given a user toggles location, when permission is granted, then distance and “Nearby now” appear.
   - Given permission is denied, then a clear CTA to Settings is shown.

8) **Match Management**
   - Given a user unmatches, when confirmed, then the chat closes and match becomes inactive.

9) **Notifications (stub → live)**
   - Given new message/match, when app is backgrounded, then notification is triggered (stub today).

## P2 — Differentiators

10) **Muse Now (Random chat/call)**
   - Given a user taps Muse Now, when starting random chat, then a safe, time-boxed chat begins.
   - Given a user starts a random call, then an in-app call room opens with consent required.

11) **Blind Date Mode**
   - Given blind mode is enabled, when swiping, then photos are hidden until first message.

12) **Shared Vibe Filters**
   - Given vibe filter is on, when Discover loads, then shared vibes are prioritized.

13) **Prompts & Icebreakers**
   - Given a chat starts, when suggestions appear, then they are personalized to the profile.

## P3 — Growth + Monetization

14) **Referral Links**
   - Given a user shares a link, when the recipient joins, then the referrer earns perks.

15) **Premium (Super Muse)**
   - Given premium, when swiping, then daily super likes are increased.

16) **Events / IRL**
   - Given location, when live events are nearby, then relevant cards appear in Discover.

## P4 — Analytics & Ops

17) **Analytics**
   - Track activation: onboarding completion, first like, first match, first message.

18) **Quality Dashboards**
   - Track crash-free sessions, latency p95, swipe drop-off, chat open-to-send.

## Notes
- We ship in micro-iterations with tests.
- If emulators are offline, we fall back to demo mode for QA.
