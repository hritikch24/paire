# Muse — QA Checklist (Smoke + Regression)

## Test Environments
- **Prod smoke:** Install `~/Downloads/Muse-android-production.apk` on an emulator/device with working DNS.
- **Local E2E:** `./scripts/test-e2e.sh android` (uses Firebase emulators + Maestro flows).

## Latest Automation Status
- 2026-01-03: `./scripts/test-e2e.sh android` passed onboarding, discovery, match, and chat flows on emulator.
- 2026-01-04: `./tools/run_all.sh` passed typecheck, unit tests, debug build, and connected tests.
- 2026-01-04: Release APK rebuilt after removing `uploadType` from photo upload; device smoke pending.
- 2026-01-05: E2E flows pass on emulator when run per-flow (onboarding, onboarding-full, discovery, match, chat, chat-two-users).
- 2026-01-06: Release APK rebuilt with prod Firebase config + corrected Storage bucket; device smoke pending for signup/login and photo upload.
- 2026-01-06: Added auth diagnostics (alert + network probe) to capture device error on signup/login.
- 2026-01-06: Auth diagnostics now show Firebase config values on-screen to confirm correct project in release.
- 2026-01-06: Auth buttons forced enabled; empty fields now trigger validation alert (tap detection check).
- 2026-01-06: Dedicated Sign Up screen added; Create account now routes to signup flow.
- 2026-01-07: Auth flow reverted to standard sign-in/sign-up forms with confirm password validation.
- 2026-01-07: `./tools/run_all.sh` passed typecheck, unit tests, debug build, and connected tests.
- 2026-01-07: Release APK rebuilt (JDK 17) and copied to `~/Downloads/Muse-android-production.apk`.
- 2026-01-07: `./tools/run_emulator_and_smoke.sh` installed debug APK + captured logcat (`artifacts/2026-01-05_16-42-45-smoke/`).
- 2026-01-07: Release APK rebuilt after auth flow adjustments and reinstalled on device.
- 2026-01-07: Release APK rebuilt with new photo upload path (uploadString + getDownloadURL) and reinstalled on device.
- 2026-01-07: Release APK rebuilt with REST upload (FileSystem uploadAsync) to avoid ArrayBuffer/Blob issues and reinstalled on device.
- 2026-01-05: Updated onboarding/profile screens to be scrollable on small devices; reduced Discover card height for compact layouts.
- 2026-01-05: Replaced yellow theme with plum/rose palette; tab bar + splash updated.
- 2026-01-05: `./tools/run_all.sh` passed typecheck, unit tests, debug build, and connected tests.
- 2026-01-06: `MUSE_SMOKE_USE_RELEASE=true ./tools/run_emulator_and_smoke.sh` installed release APK on emulator-5554 and captured logcat (`artifacts/2026-01-06_00-04-07-smoke/`).
- 2026-01-06: Onboarding E2E now bypasses Firestore writes in E2E mode to avoid emulator/network hangs.
- 2026-01-06: `./tools/run_all.sh` passed typecheck, unit tests, debug build, and connected tests (`artifacts/2026-01-06_01-36-02/`).
- 2026-01-06: `./tools/run_emulator_and_smoke.sh` installed debug APK + captured logcat (`artifacts/2026-01-06_01-37-04-smoke/`).
- 2026-01-06: `./scripts/test-e2e.sh android` completed onboarding, discovery, match, and chat flows (warnings only for optional "Not Now" taps).

## Smoke Checklist (Must Pass)
### 1) Install + Launch
- App installs successfully
- App launches without “Unable to load script”
- No crash in first 60 seconds

### 2) Auth
- Sign up (email/password + confirm password) succeeds
- Sign in (existing user) succeeds
- Sign out returns to Auth screen

### 3) Onboarding
- Profile step validates name + age
- “Continue” advances through steps reliably (no stuck buttons)
- “Looking for” selections appear and persist
- Interests list scrolls and “Continue” remains reachable on small screens
- Rapid Questions screen loads after interests and saves selections
- Safety confirm toggles and enables “Enter Muse”

### 4) Photos
- “Add photo” opens picker (onboarding)
- Selecting a photo shows a preview bubble
- “Continue” persists photoUrls and proceeds
- Profile → “Edit photos” opens picker and saves updates

### 5) Discover
- Shows at least one profile card when multiple users exist
- Like/Nope/Super buttons respond
- “Today’s Spark” prompt card is visible
- Blind Date toggle hides/reveals photos on the card
- Rapid Questions appear on Blind Date cards when available

### 6) Matches + Chat
- Mutual “Like” creates a match
- Match appears in Matches tab
- Match row shows other user name + avatar (not placeholder)
- Chat opens with matched user name in header; sending a message works
- Second account sees the message

## Regression Checklist (Run Before Shipping)
### Navigation + Layout
- Bottom tabs are always tappable on Android gesture+3-button navigation
- Chat input stays visible with keyboard open and on devices with large bottom insets
- Profile photo reel is swipeable and indicators update correctly
- “Looking for” chips render on profile cards and swipe deck when set

### Data Integrity
- Profile edits persist (bio/city)
- Edit profile Save/Cancel buttons remain visible on small screens (scrollable)
- Settings persist (discoverable toggle)
- Swipes are not duplicated; deck refreshes when exhausted

### Error Handling
- Auth failure shows a user-visible message
- Firestore/Storage failures show a user-visible message (no silent empty states)

## Known Gaps (Non-blocking for MVP)
- “Report” list isn’t exposed in UI; filtering reported users depends on rules/code (should not break Discover even if read is denied).
- Notifications toggle is currently local-only (no backend).
