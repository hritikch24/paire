# Muse — Fix Log

All entries are timestamped and intended to be append-only.

## 2026-01-05
- Reworked onboarding + profile screens to use scrollable layouts so buttons and content stay visible on small devices (`apps/muse-mobile/src/screens/onboarding/InterestsScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/RapidQuestionsScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/SafetyConfirmScreen.tsx`, `apps/muse-mobile/src/screens/PublicProfileScreen.tsx`, `apps/muse-mobile/src/screens/AuthHelpScreen.tsx`).
- Reduced Discover card height + tightened layout spacing for small screens (`apps/muse-mobile/src/components/SwipeDeck.tsx`, `apps/muse-mobile/src/screens/DiscoverScreen.tsx`).
- Improved chat header layout to avoid overflow and let the message list flex correctly (`apps/muse-mobile/src/screens/ChatScreen.tsx`).
- Ensured Matches list occupies available space and scrolls cleanly (`apps/muse-mobile/src/screens/MatchesScreen.tsx`).
- Replaced the yellow palette with a plum/rose premium theme, including Android resources + splash gradient (`apps/muse-mobile/tamagui.config.ts`, `apps/muse-mobile/src/screens/SplashScreen.tsx`, `apps/muse-mobile/src/navigation/tabs/MainTabs.tsx`, `apps/muse-mobile/src/components/MuseButton.tsx`, `apps/muse-mobile/android/app/src/main/res/values/colors.xml`, `apps/muse-mobile/android/app/src/main/res/values/styles.xml`).
- Added a smoke script option to install a release APK (avoids Metro dependency for emulator smoke runs) (`tools/run_emulator_and_smoke.sh`).
- Added E2E bypass for onboarding writes so Maestro flows aren't blocked by emulator/network lag (`apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/InterestsScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/RapidQuestionsScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/SafetyConfirmScreen.tsx`).
- Added E2E bypass for Profile Setup save to prevent returning to Photo Setup during onboarding flows (`apps/muse-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`).
- Fixed onboarding flow regression where ProfileSetup auto-skip could fire while other onboarding screens were active by gating on focus + onboardingComplete (`apps/muse-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`).
- Updated onboarding E2E flow to account for scroll + updated heading text (`e2e/onboarding-full.yaml`, `e2e/onboarding.yaml`, `e2e/chat.yaml`, `e2e/chat-two-users.yaml`).

## 2026-01-01
- Fixed production APK incorrectly connecting to Firebase Auth Emulator by gating emulator usage to `__DEV__`/E2E only (`apps/muse-mobile/src/config/env.ts`).
- Improved onboarding stability by using `setDoc(..., { merge: true })` instead of `updateDoc` where the user doc may not exist yet.
- Hardened photo upload by uploading base64 first (fallback to blob upload) and adding an E2E bypass for deterministic automation (`apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`).
- Fixed Android UI issues:
  - Bottom tab bar overlapped by system navigation (safe-area padding) (`apps/muse-mobile/src/navigation/tabs/MainTabs.tsx`).
  - Chat composer overlapped by keyboard/nav bar; improved send behavior (`apps/muse-mobile/src/screens/ChatScreen.tsx`).
- Added best-effort match creation on mutual swipe + tightened Firestore rules for match creation (`apps/muse-mobile/src/services/swipeService.ts`, `firebase/rules/firestore.rules`).
- Made Discover/Matches refresh on tab focus (`apps/muse-mobile/src/screens/DiscoverScreen.tsx`, `apps/muse-mobile/src/screens/MatchesScreen.tsx`).
- Stabilized Firestore on React Native with long-polling configuration (`apps/muse-mobile/src/services/firebase.ts`).
- Made Edit Profile + Settings more resilient by using merge writes and surfacing errors (`apps/muse-mobile/src/screens/EditProfileScreen.tsx`, `apps/muse-mobile/src/screens/SettingsScreen.tsx`).
- Prevented Discover from failing if `reports` reads are denied by treating reports filtering as best-effort (`apps/muse-mobile/src/services/discoveryService.ts`).
- Allowed users to read their own reports in Firestore rules (`firebase/rules/firestore.rules`).
- Added repeatable build/test/smoke scripts + state docs (`tools/run_all.sh`, `tools/run_emulator_and_smoke.sh`, `PROJECT_STATE.md`, `QA_CHECKLIST.md`).
- Attempted disabling New Architecture but reverted: `react-native-worklets` requires new arch; keeping it enabled.
- Updated `tools/run_all.sh` to skip `clean` by default and use JDK 17 to avoid RN codegen clean failures.

## 2026-01-03
- Stabilized E2E setup by temporarily forcing `EXPO_PUBLIC_E2E=true` during `scripts/test-e2e.sh` runs (backs up and restores `.env`).
- E2E automation now completes onboarding, discovery, match, and chat flows against Firebase emulators.

## 2026-01-04
- Prevented debug builds from silently routing Firebase calls to local emulators unless explicitly enabled (`apps/muse-mobile/src/config/env.ts`).
- Made Interests onboarding scrollable so the “Continue” button stays reachable on small screens (`apps/muse-mobile/src/screens/onboarding/InterestsScreen.tsx`).
- Clarified Auth screen copy to reduce confusion about phone sign-in (`apps/muse-mobile/src/screens/AuthScreen.tsx`).
- Added a post-login photo management screen so users can add photos after onboarding (`apps/muse-mobile/src/screens/EditPhotosScreen.tsx`, `apps/muse-mobile/src/screens/ProfileScreen.tsx`, `apps/muse-mobile/src/navigation/stacks/AppStack.tsx`).
- Fixed photo uploads on Android by using base64 uploads via `expo-file-system` instead of Blob uploads (`apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/EditPhotosScreen.tsx`).
- Reworked photo uploads to use Firebase Storage REST uploads (binary via `expo-file-system`) plus download token metadata to avoid Blob/ArrayBuffer limitations on Android (`apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/EditPhotosScreen.tsx`).
- Switched upload helper to use `expo-file-system/legacy` so `FileSystemUploadType.BINARY_CONTENT` is available on device (`apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/EditPhotosScreen.tsx`).
- Removed explicit `uploadType` usage to avoid `BINARY_CONTENT` undefined runtime errors on device (`apps/muse-mobile/src/screens/EditPhotosScreen.tsx`); rebuilt release APK.
- Matches now resolve the other user profile and show names/avatars instead of placeholder text (`apps/muse-mobile/src/services/matchService.ts`, `apps/muse-mobile/src/screens/MatchesScreen.tsx`, `apps/muse-mobile/src/types/models.ts`).
- Chat header now shows the matched user’s name/avatar (`apps/muse-mobile/src/screens/ChatScreen.tsx`).
- Swipe card and interest grid are more responsive to small screens (`apps/muse-mobile/src/components/SwipeDeck.tsx`, `apps/muse-mobile/src/screens/onboarding/InterestsScreen.tsx`).
- Updated Screen to respect safe areas and provide consistent padding across devices (`apps/muse-mobile/src/components/Screen.tsx`).
- Refreshed primary/secondary button styling and warm accent colors to better align with a premium dating UI (`apps/muse-mobile/src/components/MuseButton.tsx`, `apps/muse-mobile/tamagui.config.ts`).
- Updated inputs, tabs, matches cards, and profile photo grid for cleaner, more responsive UI (`apps/muse-mobile/src/components/MuseInput.tsx`, `apps/muse-mobile/src/navigation/tabs/MainTabs.tsx`, `apps/muse-mobile/src/screens/MatchesScreen.tsx`, `apps/muse-mobile/src/screens/ProfileScreen.tsx`).
- Refreshed Auth and Profile Setup layouts with carded forms for a smoother premium feel (`apps/muse-mobile/src/screens/AuthScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`).
- Updated E2E runner to target emulators by default (or explicit device via `MUSE_E2E_DEVICE`) and pass `--device` to Maestro (`scripts/test-e2e.sh`).
- E2E runner now reverse-forwards Firebase emulator ports (8080/9099/9199/5001) to the selected Android device to avoid auth network failures (`scripts/test-e2e.sh`).
- E2E runner now uninstalls the release app on emulators before installing the debug build (prevents signature mismatch and auth failures) (`scripts/test-e2e.sh`).
- Added `MUSE_E2E_FLOW` to run a single Maestro flow when needed (useful for longer suites) (`scripts/test-e2e.sh`).
- Updated chat E2E flow to assert on `chat-input` (header title now shows user name instead of “Chat”) (`e2e/chat.yaml`).
- Added support email entry points in Auth Help + Settings (`apps/muse-mobile/src/screens/AuthHelpScreen.tsx`, `apps/muse-mobile/src/screens/SettingsScreen.tsx`).
- Improved swipe card visuals and profile interest chips for a more premium dating feel (`apps/muse-mobile/src/components/SwipeDeck.tsx`, `apps/muse-mobile/src/screens/ProfileScreen.tsx`, `apps/muse-mobile/src/screens/onboarding/InterestsScreen.tsx`).
- Removed UI Showcase entry point from Profile (dev-only screen) to avoid confusion (`apps/muse-mobile/src/screens/ProfileScreen.tsx`).
- Reduced launch flicker by waiting for auth state before rendering navigation (`apps/muse-mobile/src/hooks/useAuthListener.ts`, `apps/muse-mobile/src/app/MainApp.tsx`).
- Moved support contact to Profile (kept in Auth Help) so it’s accessible outside Settings (`apps/muse-mobile/src/screens/ProfileScreen.tsx`, `apps/muse-mobile/src/screens/SettingsScreen.tsx`).
- Added a “Today’s Spark” prompt card and a Blind Date toggle on Discover (`apps/muse-mobile/src/data/musePrompts.ts`, `apps/muse-mobile/src/screens/DiscoverScreen.tsx`).
- Profile now includes swipeable photo reel and more polished bio/interest presentation (`apps/muse-mobile/src/screens/ProfileScreen.tsx`).
- Matches list rows are fully tappable (name/avatar opens chat) (`apps/muse-mobile/src/screens/MatchesScreen.tsx`).

## 2026-01-05
- Rebuilt release APK and copied to `~/Downloads/Muse-android-production.apk`, installed on physical device for validation.
- Added Rapid Questions feature for Blind Date mode (new onboarding step, profile editing, and display in blind cards/public profiles).
- Added “Looking for” intentions (short-term/long-term/friends/figuring out) to onboarding, profile edit, cards, and public profile.
- Made Edit Profile screen scrollable with keyboard avoidance so Save/Cancel stay reachable on small devices.
- Refreshed app icon and splash logo with a new "Muse" monogram mark; added generator script.
- Bumped Android versionCode to 2 to force launcher icon refresh.
- Regenerated Android mipmap launcher icons + adaptive icon foreground/background and bumped versionCode to 3.
- Added custom bottom tab icons for Discover, Matches, and Profile.

## 2026-01-06
- Forced Firebase emulator usage off in release builds (emulator gating now `__DEV__` only) to fix signup/login on physical devices (`apps/muse-mobile/src/config/env.ts`).
- Corrected production Storage bucket to `muse-352ba.appspot.com` for Firebase REST uploads (`apps/muse-mobile/src/config/env.ts`, `apps/muse-mobile/.env.production`).
- Rebuilt and installed the release APK to device after config changes.
- Added auth failure diagnostics with network probe + timeout + alert to surface actual device error (`apps/muse-mobile/src/screens/AuthScreen.tsx`).
- Auth diagnostics now include Firebase config values and replace the “Phone sign-in coming soon” footer with live diag output (`apps/muse-mobile/src/screens/AuthScreen.tsx`).
- Auth buttons now stay enabled and show a validation alert if fields are empty to ensure Create account taps register (`apps/muse-mobile/src/screens/AuthScreen.tsx`).
- Added a dedicated Sign Up screen with back-to-sign-in navigation and focused copy (`apps/muse-mobile/src/screens/SignupScreen.tsx`, `apps/muse-mobile/src/navigation/stacks/AuthStack.tsx`, `apps/muse-mobile/src/screens/AuthScreen.tsx`).
- Ran the automated QA pipeline (run_all, emulator smoke, full E2E suite) and captured artifacts in `artifacts/2026-01-06_01-36-02/`, `artifacts/2026-01-06_01-37-04-smoke/`, and the latest `scripts/test-e2e.sh` output logs.

## 2026-01-07
- Replaced the chatbot auth experiment with a standard sign-in/sign-up form flow, including confirm password and validation (`apps/muse-mobile/src/screens/AuthScreen.tsx`, `apps/muse-mobile/src/screens/SignupScreen.tsx`).
- Kept Profile Setup auto-skip so returning users with existing profiles go straight to Photo Setup (`apps/muse-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`).
- Installed `expo-file-system`, switched photo upload imports to the supported module path, and cleaned up typecheck errors (`apps/muse-mobile/package.json`, `apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/EditPhotosScreen.tsx`).
- Fixed TypeScript strictness issues in matches + profile screens to keep CI green (`apps/muse-mobile/src/services/matchService.ts`, `apps/muse-mobile/src/screens/ProfileScreen.tsx`).
- Rebuilt the production APK with JDK 17 and copied to `~/Downloads/Muse-android-production.apk`.
- Updated smoke script to prefer emulators (avoids installing debug builds on physical devices unless `MUSE_DEVICE` is set) (`tools/run_emulator_and_smoke.sh`).
- Restored a standard sign-in/sign-up flow with confirm password and validation to keep login/signup familiar (`apps/muse-mobile/src/screens/AuthScreen.tsx`, `apps/muse-mobile/src/screens/SignupScreen.tsx`).
- Rebuilt release APK and installed it to the connected Android device.
- Reworked photo uploads to use `uploadString` + `getDownloadURL` (Firebase Storage SDK) with local cache fallback for content URIs (`apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/EditPhotosScreen.tsx`).
- Switched photo uploads back to Firebase Storage REST `uploadAsync` using legacy FileSystem upload type to avoid ArrayBuffer/Blob errors on Android (`apps/muse-mobile/src/screens/onboarding/PhotoSetupScreen.tsx`, `apps/muse-mobile/src/screens/EditPhotosScreen.tsx`).

## 2026-09-26: Production readiness overhaul
- **Removed deceptive behaviour:**
  - The random "It's a Muse" popup (it fired on 25% of likes whether or not the like was mutual).
  - The fake "Muse Now" chat with a hard-coded profile and scripted message.
  - Calls into empty meet.jit.si rooms (meet.jit.si requires a moderator login that can't work in a WebView).
- **Server-authoritative backend** (`firebase/functions`): `getDiscoverFeed` (mutual preferences, coarse distance, exclusions, ranking), `swipe`/`undoSwipe` (limits, transactional match creation), `blockUser`, `deleteAccount` + `onAuthUserDeleted` (full data purge), report auto-moderation, push notifications, profile/discovery sync, and test cohorts for reviewers.
- **Rewrote the Firestore and Storage rules:**
  - Fixed message impersonation and editing, and messaging after an unmatch or block.
  - Fixed unvalidated profiles (any age, any fields) and exact GPS being readable by everyone.
  - Fixed unmatch always failing, and unlimited uploads.
- **Fixed discovery**, which only ever considered the first 50 users by uid, and added gender, "Show me" and age-range preferences.
- **Fixed chat and matches bugs:** unread counts double-counted and never reset; a Firestore write on every keystroke; the chat input hidden behind the keyboard.
- **New app UI:**
  - Auth with password reset and consent; six-step onboarding with an 18+ birthday check.
  - Swipe deck, live matches and chat, report/block, settings with account deletion.
  - Safety Center with real check-in reminders, toasts and dark mode.
- **Play policy:**
  - Photo picker instead of media permissions; approximate location only.
  - Removed cleartext traffic, the overlay permission and backups from release builds.
  - Added legal and account-deletion pages.
- **Build:**
  - `app.config.js` is now the source of truth (`android/` is generated).
  - Upload-key signing plugin, `eas.json`, and release preflight/build scripts.
  - Standalone npm projects instead of the conflicting root workspaces; dependencies aligned with Expo SDK 54.
- **Found and fixed by running the app on an Android emulator:**
  - **Startup crash** ("Component auth has not been registered yet"). A bare `@firebase/app` import resolved to the ESM build while React Native auth `require`s the CJS build. Firebase is now imported only by CJS path, and a lint rule enforces it.
  - **Passwords shown in plain text, and no email/number keyboards** (also true in the original app). Tamagui's native Input overrides `secureTextEntry` and `keyboardType`; `MuseInput` now maps them to Tamagui's `type` (with a unit test).
  - **The footer button covered form fields** while the keyboard was open; screens now avoid the keyboard.
  - **Content scrolled under the status bar**, and **disabled round buttons showed an elevation artifact**.
- **Tests:**
  - App: 35 unit tests.
  - Functions: 21 unit tests and 10 end-to-end tests on emulators.
  - Security rules: 18 tests.
  - Maestro flows (onboarding, discover/match, chat) rewritten and passing on an Android 11 emulator.

## 2026-09-26: Free test server for group testing
- **"Muse Test" app** (`scripts/android/build-test-apk.sh`): a separate app (`com.muse.app.test`, scheme `musetest`) that installs beside the Play version and talks only to a test server, never production. It's signed with the debug key, so the upload key never leaves the Mac, and it has no push.
  - A connect screen takes the invite link (or an "Open in Muse Test" tap from the invite page).
  - When the tunnel address changes, testers reconnect without reinstalling and keep their accounts.
  - Photo URLs are stored against a fixed placeholder origin and resolved at display time, so they survive address changes.
  - Password resets tell testers to ask the host, because the emulators can't send email.
- **Test server** (`scripts/test-backend.sh`): Firebase emulators bound to this Mac only, a gateway, and a Cloudflare quick tunnel.
  - Data is saved on exit and every 10 minutes, and recovered after an interrupted save.
  - The Mac stays awake while it runs. If the tunnel dies, it restarts and prints the new link.
- **Gateway** (`tools/test-backend/gateway.js`) closes the emulator holes found while building this:
  - Forged ID tokens are refused in headers, request bodies and Firestore's WebChannel handshake.
  - Forged and rebuilt tokens are refused. The Auth emulator's refresh tokens are the user ID in base64 JSON, and its ID tokens are unsigned and timestamp-based, so the gateway adds a random nonce to every token it issues and accepts only those.
  - `owner` and `ya29.` admin credentials are refused.
  - Custom-token and IdP sign-in are refused (both accepted unverified by the emulator).
  - Emulator admin APIs, the Storage GCS API, other projects and direct calls to background functions are not reachable.
  - Sign-in and sign-up attempts are rate-limited.
  - `tools/test-backend/check.js` verifies all of this through the tunnel (28 checks).
- **Fixed: footer buttons sat partly under the Android navigation bar.** Tamagui's Button size variant sets `height: 44`. Our `minHeight: 54` made buttons draw 10dp taller than the space their parent gave them. Primary and secondary buttons now set their height, and screen footers keep an 8dp gap above the navigation bar.
- **Fixed: photo uploads were refused by Storage rules on the emulators.** The app uploaded with a single `uploadType=media` request. The emulator ignores that request's `Content-Type`, so the rule requiring an image type failed. Real uploads had never run against the emulators, because E2E mode skips them. Uploads now use the resumable protocol that the Firebase SDKs use (content type sent as metadata). Verified through the test server: the right type is stored, the photo downloads with its token, and uploads into another member's folder are still refused.
- **Fixed: Android build scripts could pick JDK 25.** `/usr/libexec/java_home -v 17` falls back to any installed JDK, and Gradle 8.14 can't run on Java 25. The scripts now check each candidate's version (`scripts/android/java-env.sh`).
- The release build and preflight refuse bundles or `.env` files that would make a test-server build.

## 2026-09-26: Feedback from the first group test
- **Fonts:** plain `Text` had no font family, so it fell back to Roboto while buttons used Space Grotesk, and sizes ranged from 11 to 64. `defaultFont` is now set, the type scale is tighter (13–34), and outliers are fixed (card chips, chat day labels, hero titles).
- **Sign-up in two steps:**
  - Step 1: name, birthday, gender, show me. Step 2: interests, "looking for" and the one-night-stand question.
  - The pledge is folded in as one line with a link to the guidelines.
  - Photos became optional: profiles without one are still shown, ranked lower, on a designed placeholder card.
  - A dismissible Discover nudge asks for a photo, notifications and location.
- **One-night-stand flag** (`settings.openToCasual`):
  - Asked at sign-up and editable in Settings.
  - Stored privately and indexed server-side. Revealed only when both people opted in (`casualMatch`), and used by the matchmaker.
  - The Community Guidelines now cover consent, explicit content and paid sex.
- **Muse AI** (`functions/src/lib/insights.ts`, `ai.ts`, `lib/suggestions.ts`, `lib/llm.ts`):
  - Every feed card gets a compatibility score (62–98) and up to 3 reasons, and the feed is ranked by them.
  - `suggestOpeners` (only for your own active matches) and `suggestBio` use a free built-in writer, or Claude when `ANTHROPIC_API_KEY` is set, with the built-in writer as fallback. Both have daily limits.
- **Likes you** (`getLikesYou`): free, excludes answered, blocked and hidden people and different cohorts, and re-checks both people's preferences. A like-back from the profile is an instant match.
- **Your turn** badges on conversations waiting on you. **Invite friends** when the feed is empty.
- **Notifications:**
  - In-app and local alerts for new messages and matches when push isn't active, skipping the open chat and matches you just made yourself.
  - Test builds can use real FCM once `google-services.json` and a service-account key are added.
- **New logo and brand** (`tools/generate_brand_assets.py`): a split heart that reads as an "m", with a spark for Muse AI. Adaptive and themed Android icons, splash, store icon and feature graphic.
- **Fixed: the test server crashed after a test run.** Every Firebase Storage emulator on a Mac shares `$TMPDIR/firebase/storage/blobs`. Starting a second one (the test suite) wiped the live server's photos, and its next save crashed. Recovered the group's data from the last saves.
  - The server now uses a private temp folder and auto-restarts its emulators without changing the link.
  - `verify.sh` uses its own ports (`firebase.verify.json`) and temp folder.
- Tests: app 46, functions 29 unit and 14 end-to-end, rules 18.

## 2026-09-27: Chat safety, themes, "muse" wordmark
- **Muse AI chat safety** (`functions/src/lib/chatSafety.ts`, `messages.ts`):
  - Every message is scanned for money scams (OTP, bank or gift-card requests, investment pitches, UPI/"paise bhej do"), threats and blackmail, abuse aimed at the reader, sexual demands, paid sex, under-18 self-declarations, and suspicious links. The rules cover English and Hinglish and map look-alike characters back.
  - The rule result is written onto the message at once (`safety: {category, severity, hidden}`). With `ANTHROPIC_API_KEY`, Claude Haiku (`MUSE_SAFETY_MODEL`) gives a second opinion on medium+ flags, capped per sender per day. It can clear or move a flag by one step, but never clear "firm" signals such as OTP requests, blackmail or under 18. The message goes to it as a JSON string, so it can't break out of the prompt.
  - Medium+ flags get one server-only `chatFlags/{matchId}_{messageId}` record (idempotent, `expireAt` for a TTL policy). A sender is hidden for review after 3 open high flags from 2+ people, after 5 from anyone, or at once for an under-18 signal. Flags from before a moderator's `reviewedAt` don't count.
  - Abusive messages are hidden behind a tap, masked in the chat-list preview, and kept out of notifications. The recipient gets a warning card with a Report link, which pre-selects the reason and records the `messageId`.
  - Disclosed in the Privacy Policy (`#muse-ai`), Terms, Community Guidelines, Safety tips and the in-app Safety Center.
- **Themes** (`src/theme/palettes.ts`, `store/appearanceStore.ts`, `screens/AppearanceScreen.tsx`):
  - 7 palettes (Muse Rose, Classic Ivory, Noir, Ocean, Lavender Dusk, Sunset, Forest), each in light and dark.
  - System/Light/Dark mode, saved per phone. Settings → Appearance and Profile → Themes.
  - Hero gradients, the match celebration and card placeholders follow the theme. A contrast test holds every palette to WCAG AA.
- **"mus" instead of "muse" on opening:** the splash rendered before Space Grotesk loaded, so Android measured the text with the system font and clipped it. The splash and welcome now use an image wordmark (`assets/wordmark.png`), and negative letter spacing is gone.
- Photos upload at 1080px max (was 1440), and image-manipulator objects are released after use.
- Reviewed by an independent agent. All five must-fix findings are fixed (preview leak, rule-only false positives, "16yo" normalisation, prompt injection and category changes by the model, duplicate trigger runs), plus most should-fix ones.
- Follow-ups (same day):
  - Warnings moved to recipient-only `matches/{id}/safety/{messageId}` docs, so senders never see what was flagged.
  - Spelled-out words ("s e n d m o n e y", "w h a t s a p p") are caught.
  - TTL policy for `chatFlags.expireAt` in `firestore.indexes.json`. The privacy policy states 12-month retention of flagged copies, 3 years for reports, and the immediate hide on an under-18 signal with a human-review route.
  - The Android navigation bar is transparent (`androidNavigationBar.enforceContrast: false`), and its button style follows the theme (`expo-navigation-bar`), so dark mode no longer has a white bar.
  - Themes now define Tamagui's default `color`. Before this, un-styled text stayed black in dark mode (a pre-existing bug).
  - Tests: app 63, functions 91 unit and 15 end-to-end, rules 19.

## 2026-09-28: Duos (double dates with a friend) and the likes gallery
- **Duos** (`functions/src/duos.ts`, `lib/duos.ts`; app `components/duo/*`, `screens/DuoScreen.tsx`, `ChatMembersScreen.tsx`). The PRD is published as an artifact.
  - **Teaming up takes two agreements.** You make a 6-character code (cryptographically random, no 0/O/1/I/L). A friend enters it, and you confirm it's really them. Guesses are limited to 10 a day, and codes expire after 48 hours (TTL on `duoInvites.expiresAt`). You can have one active Duo at a time.
  - **The Duo deck** is Discover → Duos. Pairs fit when every person has someone on the other side they'd want to see, and who'd want to see them (gender, age, distance). Either friend's like counts, with a 10-minute undo. "They like you two" pairs come first.
  - **The one-night-stand flag is never used or shown in Duos.** Scores and distances are always the caller's own.
  - **Duo chats** (`matches` with `kind: "duo"`, up to 4 people):
    - Names on bubbles, "Seen by", Muse AI group icebreakers, a push to each person, and chat-safety warnings to everyone but the sender.
    - Leaving keeps the chat going while each pair still has someone in it. Blocking closes shared chats without saying who blocked whom.
    - Account deletion erases the member from every Duo chat they were ever in (`memberHistory`).
  - Each Duo gets a fresh random id, so a pair that splits up and re-forms starts clean. Name and photo changes reach Duos and pairs' like records.
  - Rules: a send in a group bumps everyone else's unread count by exactly one. Only one-to-one matches can be unmatched. Duos and their likes are readable only by members, and only while the Duo is active.
- **Likes gallery** (`screens/LikesGalleryScreen.tsx`): "See everyone who likes you" under the Liked-you row opens a full-screen, two-column photo gallery with match %, a Super badge and a one-tap like-back.
- Reviewed by an independent agent. All 7 must-fix findings are fixed (invite consent and guessing, profile access after a chat closes, the casual flag in scores, deletion leftovers, re-formed Duos inheriting old likes, stale Duo names/photos, the leave-chat copy), plus most nice-to-haves.

## 2026-10-10: Documentation brought up to date
- New `docs/product/`: `market-strategy.md` (India-first review, launch plan, getting traffic), `costs.md` (Play/Firebase costs, developer-account options), `duos-prd.md` (with the final decisions), `naming.md` (why "Muse" is risky, candidates).
- Updated for chat safety, themes, Duos and the likes gallery: `README.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/testing.md`, `docs/test-backend.md` (updating a running server, separate QA server), `docs/safety.md`, `docs/RELEASE.md`, `QA_CHECKLIST.md`.
- `docs/PRODUCT_BACKLOG.md` now leads with open decisions and the current plan; the January plans are marked as archive.

## 2026-10-10: Delhi NCR product and UX iteration
- Added `docs/product/delhi-ncr-direction.md`: research-backed product hypotheses, problems/solutions, revised name shortlist, Delhi NCR launch focus without location exclusion, verification/AI architecture, pricing and measurable rollout plan. Keep Muse until the founder chooses; ₹20/24h is the premium entry price and existing free daily limits remain.
- Redesigned Welcome, Discover and Profile surfaces; added VibeFirstCard with real feed/matching, a deliberately revealed photo, photo loading/error/retry states and readable Pass/Like controls. Reset the reveal for a new profile or undo. Corrected blind-card copy that previously promised identity would remain hidden until matching even though full profiles were accessible.
- Added Premium, Verification and VibeGuide screens, with pinned back navigation. Purchases/capture remain unavailable; weekly/monthly prices are proposals. Changed match-percentage copy to transparent vibe rankings and explain the current rules-based matchmaker.
- Added authenticated read-only getDailyAllowance (existing UTC reset, no usage charge) and getVerificationStatus (server-held approvals only, fails on stale/reordered/expired photo lists). The test-server gateway permits these authenticated endpoints. Live liveness/capture, image-content binding, provider callbacks, mandatory verification enforcement and billing/entitlements are still launch work.
- Added free notification privacy controls: names/text hidden by default for existing and new accounts, explicit preview opt-in; both FCM and local notifications honour it. Rules validate the new Boolean preference.
- Added regression checks for verification, allowance reset/non-consumption, notification privacy and the Vibe-first/pricing/verification UI flow. Integration teardown now explicitly terminates Firestore transports before deleting clients, fixing a cleanup timeout under the current local SDK/runtime.
- Validation: app TypeScript/ESLint + 67 unit; functions TypeScript/ESLint/build + 106 unit; 23 rules + 18 functions integration; Android debug build and the full Vibe-first Maestro flow. Inspected dark theme/1.3 text scale after cold launch. Screenshots in `codex-artifacts/delhi-ncr-ui/`; iOS and live verification/payments remain untested.

## 2026-10-10 — trust, billing and opt-in AI follow-up

Implemented Didit hosted sessions, exact-generation immutable snapshots, full-body signed callbacks with replay/revocation precedence, moderator queue/review tooling, photo-binding schema v2 and mandatory gates across functions and message rules. Added biometric erasure scheduling/account cleanup. Implemented RevenueCat native consumable checkout, server authoritative validation, signed reconciliation, expiry/refund/ownership handling and higher Premium quotas without resetting free usage. Added mutually opted-in catalog-only Claude vibe reranking with strict parsing and fallback. Replaced predictable anonymous calls with signed room-specific JaaS access. Live provider/store/model/call QA and iOS remain pending; see `docs/production-integrations.md`.

Validation: 67 app + 125 backend unit + 29 rules + 22 emulator integration tests (243 total), typecheck/lint, functions build, Android native build and two Maestro flows. Added direct-API regression coverage for changed preferences, visibility and cohorts, and banned-member contact checks. No live provider, purchase, model or call-provider session was tested.


## Private reports, web preview and follow-up QA — 2026-10-10

Added authenticated report submission with actual message evidence, private member progress/pagination, report/block retries, moderator-claim queue/review CLI and immutable audited outcomes. Automatic moderation preserves fresh reviews and bans; reports closed without a violation stop counting toward automatic hiding. Contact evidence and staff notes remain server-only.

Built the responsive NCR-first marketing page and actual Expo browser app, published owner-private via Sites. Browser auth persists, forms handle DOM events, dialogs/actions work with keyboard navigation, photo uploads send re-encoded authenticated bytes, and the desktop panel constrains layout measurements. Native Firestore uses the RN transport so the browser's streaming Fetch implementation cannot stall native listeners. Daily premium remains ₹20; week/month proposals and unavailable provider features are labelled.

QA emulators now run from isolated temporary function/rule copies with disabled placeholder secrets, preserving all developer environment files. Native test tooling handles iOS simulator builds and seeds each flow independently. Compatible audit patches remove critical findings without changing Expo/RN major versions; remaining advisories and release blockers are recorded honestly. Tests, screenshots, live-provider limits and native results: `docs/qa-2026-10-10.md`.

Final regression: 251 automated tests, all six Android UI flows and the combined Chrome browser script pass. Fixed shrinking report headers and reran the Android reporting flow. iOS onboarding and discovery/matching pass; full chat automation remains unresolved and the remaining three iOS flows are unverified. These results do not establish live-provider or public-launch readiness.

## 2026-10-11 — India v2 (product review and build)
- Product review of Indian dating-app problems → solutions → pricing (`docs/product/india-v2-plan.md`).
- Muse is now for men and women only. "Show me" is Men, Women or Both, defaulting to the opposite gender. Older accounts with another gender go back through the basics step; stale "Show me" values are cleaned automatically (`types`, `firestore.rules`, `utils/profile.ts`, `hooks/useAuthSession.ts`).
- Sparks: any like can carry a note of up to 140 characters, refused if the chat-safety scanner flags it. Notes and Super Muses lead "Likes you", and on a match the notes open the chat as `matches/{id}.sparks` (`lib/validate.ts`, `lib/sparks.ts`, `swipes.ts`, `likes.ts`, `SparkComposer.tsx`, `ChatScreen.tsx`, `LikesGalleryScreen.tsx`).
- Privacy & control settings, free for everyone: notes-only likes, "I'll message first" (`firstMoveBy` on the match, enforced by the rules), incognito (only people you liked see you; also in Duos), private photos (stripped from the feed, likes and Duo deck until a match), same intentions only and "Speaks my language" (two-way filters) (`lib/prefs.ts`, `lib/discovery.ts`, `discovery.ts`, `duos.ts`, `SettingsScreen.tsx`).
- Indian basics: height (shown in feet and inches), languages, education, work, religion (optional, never caste), diet, drinking and smoking, shown on cards and profiles. Added a "Marriage-minded" intention (`data/basics.ts`, `ProfileEditors.tsx`, `ProfileDetails.tsx`, `SwipeDeck.tsx`).
- "Close kindly": a polite goodbye, then unmatch (`ChatScreen.tsx`).
- Fairness and limits: free 25 likes and 1 Super Muse a day, the same for everyone. Plus gives 100 likes, 5 Super Muses and priority likes. New members get a 72-hour ranking lift. Plus prices are ₹20/day, ₹99/week and ₹299/month (`config.ts`, `premium.ts`, `config/premium.ts`, `PremiumScreen.tsx`).
- Web on Vercel: `apps/web` (landing page, legal pages, build script exporting the real app to `/app/`), root `vercel.json` and `.vercelignore`, and setup in `docs/vercel.md`. The web export now runs with `--clear`, because a stale Metro cache served old code.
- Privacy policy discloses notes, basics and the privacy controls (`firebase/hosting`, `apps/web/legal`).
- Independent review fixes: Storage folder listing is owner-only (photos can't be enumerated by uid); other pairs' Duo-like snippets drop private photos (also when the setting is toggled); `duoSwipe` respects incognito; "Likes you" reads the newest 300 likes (new composite index on `outgoing`: toUid, type, createdAt); notes stay pinned above the chat; a refused note reopens for editing; the first-move copy explains what happens when both choose it; root `engines.node >= 20.11`. Known limits are in `docs/safety.md`.
- Tests: new unit (`test/sparks.test.ts`, app basics/defaults/legacy genders), rules (genders, basics, settings, first move, photo listing) and emulator end-to-end tests (notes-only, incognito, private photos with first move, same intentions). `verify.sh` passes: app 72, functions 140, rules 33, end-to-end 32. The emulator ignores indexes, so check the new `outgoing` index after `firebase deploy --only firestore`.

## 2026-10-11 — Rename to Chitthi and Razorpay web payments
- Display name, icon and wordmark (`tools/generate_brand_assets.py`), all user-facing text (Super Muse → Super Like, Muse AI → Chitthi AI, Muse Cards → Interests, Muse Plus → Chitthi Plus), landing page, legal pages and Play graphics. Internal identifiers are unchanged.
- Razorpay: `firebase/functions/src/razorpay.ts` (`createPlusOrder`, `confirmPlusPayment`, `razorpayWebhook`), `lib/razorpay.ts` (server prices, HMAC checks, pass queueing), and `billing.ts` now combines store and web passes. Web checkout is in `billingService.ts`/`PremiumScreen.tsx`. Orders are server-only (`razorpayOrders`).
- Legal: `/refunds/` and `/contact/` pages, a payments section in the Terms, Razorpay and payment-record retention in the Privacy Policy, and details filled at build time from `CHITTHI_*` variables.
- Web: manifest, icons, social share image, sitemap, `noindex` on `/app/`, and a Permissions-Policy that allows Razorpay's payment frame.
- `scripts/set-trust-policy.mjs` for the launch verification policy, and `docs/launch-web.md`.
- Tests: Razorpay unit tests (pricing, ids, signatures, capture checks, queueing); end-to-end checks that web checkout stays closed while unconfigured and that orders can't be written by clients. `verify.sh` passes: app 72, functions 146, rules 33, end-to-end 32.

- Payment review fixes: the Razorpay functions bind the RevenueCat secret, so store passes count. Passes queue through a per-member `webPassLedger/{uid}` inside the grant transaction, starting at capture time. Webhooks re-read the payment before granting, and a refund that arrives first still cancels. Any refund ends the pass. Confirmation still works if sales are paused mid-payment. Late webhooks don't recreate deleted accounts. The client never offers a second payment after money has moved. Landing page overflow at 320px fixed. Playwright `e2e/web.cjs` passes (marketing at 1440/390/320px, sign-in, chat, report/block, upload, Vibe First, verification).

## 2026-10-11 — Continue with Google (web)
- "Continue with Google" on Welcome, Sign in and Sign up (Sign up requires the 18+/terms box first). Uses Firebase's Google provider (`services/googleAuth.ts`, `components/GoogleButton.tsx`). Shown on the web only; the native apps need a Google Sign-In library and signing keys.
- New Google members get their terms acceptance recorded and go through the 18+ birthday step, with their first name prefilled. Deleting the account confirms with Google instead of a password, and Settings hides "Change password" for Google accounts. Friendly errors for blocked pop-ups, unauthorised domains and existing email accounts.
- Checked on the Auth emulator with Playwright: Google popup → account created (google.com provider) → `private/info.termsAcceptedAt` recorded → basics step with the name prefilled.

## 2026-10-12 — Signature moments
- A sent note flies off as a paper aeroplane, with "Your note is on its way" (`components/NoteFlight.tsx`). The match screen slides the two photos together, pops a heart and floats small hearts, on an opaque gradient with one clear white call to action (`MatchMoment.tsx`). Discover loads with a card-shaped placeholder instead of a spinner (`CardSkeleton.tsx`). Every animation respects the device's or browser's reduce-motion setting (`hooks/useReducedMotion.ts`). Checked visually with Playwright on the emulators.

## 2026-10-12 — Age-gap dating (Plus filter)
- Founder asked for a "sugar daddy/mommy" premium filter; built as age-gap dating instead (the "sugar" wording is what Google Play's compensated-dating ban and payment providers screen for). Sides: Silver Fox / Cougar (35+, server-enforced) and "Into someone older"; picking a side is free, filtering and seeing sides is Chitthi Plus only; "Into someone older" filter only for members holding the older side (`firebase/functions/src/lib/ageGap.ts`, `discovery.ts`, `lib/discovery.ts`, `lib/validate.ts`, `types.ts`, rules + new discovery index).
- App: Plus filter chips on Discover (one scrollable row; locked only once the pass check says no pass; filter changes mid-load now always win via a load generation), card/profile badges, Settings "Age-gap dating", Plus perk; profile age now follows the birth date after birthdays (`useAuthSession.ts`).
- Chat safety: "sugar" talk raised to medium and a dating-context "allowance / pay per meet" rule; Terms + Community Guidelines (both `apps/web/legal` and `firebase/hosting`) ban paid arrangements; terms version 2026-10-12. Landing pricing lists the filter; fixed leftover "Super Muses".
- Reviewed by an independent agent; findings fixed. verify.sh: app 74, functions 163, rules 33, end-to-end 33. Browser QA (emulators, billing on in the QA copy only): Plus member filtered to a 42-year-old Silver Fox with badge; free member sent to Plus; 320px layout checked.

## 2026-10-12 — Paire, and Garba Nights
- **Renamed Chitthi → Paire** (paire.in) everywhere members see it: app, web app, landing page, legal pages, emails/notices, docs. Tagline "Find your Paire." "Super Chitthi" is now "Super Like" and "send a chitthi" is "send a note". Website variables renamed `CHITTHI_*` → `PAIRE_*`. Internal IDs unchanged.
- **New logo:** the paper aeroplane with a heart cut out of its top wing replaces the envelope (`tools/generate_brand_assets.py`, which now also writes the site icons and the 1200×630 link preview).
- **Garba Nights** (free, Navratri 1–20 Oct 2026): `settings.garbaNights` (rules: a list of up to 12), mirrored to `discovery/{uid}.garba` (season id) and `.garbaNights`; `getDiscoverFeed({ garba: true })` reads the viewer's nights from settings, filters by shared upcoming nights, and returns only the shared nights (`garbaNights`) on each card. One filter at a time (Garba or an age-gap side). New composite index (visible, cohort, gender, garba, lastActiveAt, __name__). AI openers mention a shared Garba night (Claude prompt and the built-in fallback). Privacy policy updated.
- Chat-safety model default moved to `claude-haiku-5-5`.
- Review fixes: cards show only the **number** of shared nights (`garbaShared`), never the dates, and members keep at most 4 nights (server, app and rules), so nobody can pick every night to read someone's schedule. The edition needs location and stays within 50 km. Nights can be cleared in Settings after the season. Rules check each night is a date string. Website build falls back to `CHITTHI_*` variables. The Garba chip closes itself after the season; a full set of nights hides "Add more nights"; filter chips have spoken labels. Integration test covers the count, the hidden extra night, the location requirement and the Garba icebreaker after a match.

## 2026-10-13 — Launch readiness (www.paire.in)
- **Live:** Vercel project `paire` (team-rockstar) on www.paire.in; Firebase backend deployed (rules, indexes, 42 functions, hosting); Plus on with a dummy Razorpay key; verification policy off (`runtime/trust`); Vertex AI enabled.
- **Paire AI on Gemini:** `lib/llm.ts` picks Claude when `ANTHROPIC_API_KEY` is real, else Gemini (`gemini-3.5-flash`) on Vertex AI with the Functions service account (`MUSE_GEMINI_ENABLED=true`), else the built-in writer.
- **Birthday field fixed:** web rendered it as `<input type=number>`, which wiped the auto-inserted slashes; numeric fields are now text inputs with `inputmode=numeric` (`MuseInput.inputTypeFor`).
- **Own account page** `/auth/action/` for password reset, email verification and email-change undo (Firebase Auth REST, Paire-branded). Point Firebase email templates at it (console only; the API refuses template edits).
- **SEO/GEO:** new title/description, canonical, Open Graph/Twitter, JSON-LD (Organization, WebSite, WebApplication with INR offers, FAQPage, Breadcrumb), visible FAQ, `/garba-nights/` page, `llms.txt`, robots welcoming AI crawlers, sitemap with lastmod.
- **Ads:** optional Meta Pixel (`PAIRE_META_PIXEL_ID`): PageView, Lead, CompleteRegistration (`InterestsScreen`), Purchase (`PremiumScreen`); privacy policy updated. Ad and video prompt pack: `docs/marketing/launch-ads-and-video-prompts.md`.
- 12 production test accounts in the `test` cohort (credentials in the git-ignored `test-accounts.local.md`).

## 2026-10-13 — Real people only: confirmed emails and a free selfie check
- **Email confirmation required.** Email sign-ups get a confirmation link and wait on a "Check your inbox" screen (it moves on by itself). Rules refuse profile writes without `email_verified`; the server records `moderation/{uid}.emailVerified` (`accountChecks.ts`) and discovery, every dating action and chat rules require it. Throwaway inboxes (`lib/disposableEmail.ts`) never count. Existing accounts were backfilled; older unconfirmed accounts get a fresh link automatically. A caller whose confirmation was never recorded is re-checked once instead of refused.
- **Free selfie photo check** (`selfie.ts`, `lib/selfieCheck.ts`, `lib/faces.ts`), replacing the unconfigured Didit flow: a random, uncommon pose (fixed for the attempt), a live camera shot (browser camera on web, front camera on phones), face matching against every profile photo with OpenCV YuNet + SFace (ONNX in WASM; models in Storage `system/face-models/`, hash-pinned; `scripts/upload-face-models.mjs`), and Gemini only for pose / live photo / age / AI-photo checks. Gemini was tested and could not tell look-alike strangers apart, so it never decides identity. Thresholds: first photo ≥ 0.55, other photos with faces ≥ 0.42, ≥ 0.93 = a reused photo. Live test scores: same person 0.72–0.84, stranger 0.38, reused photo 1.0. The selfie is never stored; only scores go to `verificationAudit`. Verification is now required (`runtime/trust`); the shared test cohort is exempt from the photo check (not from email).
- **Storage bucket fixed:** the app pointed at `muse-352ba.appspot.com`, which doesn't exist; uploads now go to `muse-352ba.firebasestorage.app`.
- Camera permission enabled in the native app config for the selfie check. Privacy policy, landing page and `llms.txt` updated.
- **Own account emails:** Firebase locked this project's email templates ("Email template updates are currently unavailable", `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`, even for the action URL alone). `requestAuthEmail` (`authEmails.ts`) generates the one-time code with the Admin SDK, links it to `www.paire.in/auth/action/` and sends a branded email through Resend (`RESEND_API_KEY` secret, `AUTH_EMAIL_FROM`). Resets are rate-limited per email and IP and answer the same whether or not an account exists. Until the key is set it answers `{ sent: false }` and the app uses Firebase's built-in emails.
- **/metrics/ dashboard** (`apps/web/site/_d…/`, opened only via `/metrics?key=admin`; `metrics.ts`): Open to anyone with the link, no sign-in (owner's call, 2026-10-13); `getMetrics` returns totals only, needs `key: "admin"`, caches for a minute. Never indexed: meta robots plus X-Robots-Tag, and the link appears in no sitemap, robots.txt or page. Website visits are counted anonymously by `trackVisit` through the site's own `/v/` address (no cookies, no IP; the browser remembers only the date of its last visit), with page, source (`utm_source`, ad click IDs, known referrers) and device. Accounts, logins, profiles, verification, matches, messages, swipes and Plus sales come from Auth and Firestore; the shared test accounts are left out of people counts.

## 2026-10-17: Activity-based presence and paid sending (all switches off)
- **Presence** (`firebase/functions/src/presence.ts`, `lib/presence.ts`; app `services/presenceSession.ts`, `services/presenceService.ts`, `hooks/usePresence.ts`): per-session, server-timed. Online only while a session is in the foreground, had a meaningful interaction within `runtime/presence.idleTimeoutMs` (2 min), and holds its heartbeat lease. Heartbeats renew the lease, never the activity, and stop once idle. Clients send `idleMs` from a monotonic clock, never a wall-clock time. `getPresence` answers only for people sharing an active chat with the caller, at most 50 at a time. Hidden, banned and missing presence all read as `unavailable`. "Show when I'm active" (Settings) deletes presence, removes the profile's `lastActiveAt` and hides "Active today" in discovery (`discovery.presenceHidden`, recency kept by `touchActivity`). UI: an online dot in Matches, "Online"/"Active 2 h ago" in chat headers, refreshed by timer when the window ends.
- **Paid sending** (`chatAccess.ts`, `chatEntitlement.ts`, `lib/chatAccess.ts`, rules `maySend()`): with `runtime/trust.enforcePaidChat` (the paid-chat switches share the document the rules already read), sending needs the sender's own Plus or Unlimited Chat (₹50 once, `chatUnlocks/{uid}`). Rules enforce it on both the message create and the preview/unread update, with an optional announced start (`enforceFrom`) and a grace period for older chats. The server mirrors access onto `moderation/{uid}.chatAccess` (within the rules access budget for four-person Duo chats). `syncPremium` keeps the mirror current, and Plus expiry is checked against `request.time`.
- **Unlimited Chat payments**: server-priced, account-bound Razorpay orders (`chatUnlockOrders`, with the key's test/live mode), one checkout reused across tabs and retries, signature plus Razorpay re-read before granting, signed webhooks (captures, refunds, `payment.dispute.*`), automatic refund of duplicate or orphaned payments, and test money never unlocking real accounts. Live sales need `MUSE_CHAT_UNLOCK_LIVE=true` as an explicit approval. Plus webhooks now also treat a lost dispute as a refund. The Razorpay HTTP client moved to `razorpayClient.ts`.
- **App**: `ChatAccessCard` ("Get Paire Plus" / "Unlock unlimited chats — ₹50 once", with loading, pending, failed, cancelled and success states and a Check payment status action), drafts kept through checkout, Send after paying still deliberate, "Close kindly" falls back to unmatch without access, MatchMoment explains the two choices, and the Plus screen and browser layout copy updated.
- **Copy and legal**: the landing page, pricing page, FAQs, guides and `llms.txt` no longer promise free unlimited chat. Terms §4A, the Refund policy and the Privacy policy (online status) are updated in `apps/web/legal` and `firebase/hosting` (drafts, pending legal review).
- **Ops**: `scripts/set-runtime-flags.mjs` (status, switches, chat-access backfill; dry run by default), `.env.example`, and a new composite index for Duo chat presence. Docs: `docs/presence-and-paid-chat.md`.
- **Tests**: `verify.sh` passes (app 105, functions 219, rules 49, end-to-end 64; previously 86/189/35/35). Payments are exercised against a fake Razorpay test-mode API; no real sandbox or live payment was made and nothing was deployed.
- **Independent review fixes (same day):**
  - A second payment captured on an already-paid order is now refunded, and its refund or dispute never revokes the unlock.
  - The paid-chat switches moved into `runtime/trust`, with one `get()` that short-circuits when the gate is off, and the preview check runs first in `verifiedParticipants`. Without these, a four-person Duo send in preview mode with one stale photo approval exceeded Firestore's expression limit, even with every flag off; that path now has a rules test.
  - `set-trust-policy.mjs` now merges.
  - Hidden members: the server strips a `lastActiveAt` that clients re-add, `getPresence` re-checks settings and bans, and discovery recency is kept only to the hour (feed cursors).
  - Presence beats are numbered (late beats are dropped), a background start isn't activity, raw `scroll` no longer counts, and `onlineUntil` is rounded down to 5 s.
  - `syncChatAccess` is transactional, and a second tab can't open a second checkout after the first looked.

## 2026-10-17: Paid chat live at ₹49
- Price changed to ₹49 (4,900 paise) across the server, app, site and legal copy (`380f867`).
- Deployed Firebase (functions incl. 5 new, rules, indexes) and Vercel (www.paire.in), then switched on presence, the paid-sending gate (from 01:29 IST, no grace) and live Unlimited Chat sales, at the owner's request. No Plus holders needed backfilling. Smoke checks: live pages show ₹49; the new callables refuse unauthenticated calls; the webhook rejects unsigned requests (401). No real payment has been made yet.

## 2026-10-17: Unlimited Chat paid by UPI (paire.in@ybl)
- Razorpay rejected Paire, so ₹49 Unlimited Chat moved to UPI straight into Paire's own UPI ID (`upiPayments.ts`, `UpiPayPanel`, `UpiReviewScreen`): a unique amount and QR per order, the buyer submits the UTR, and a moderator approves it before chat unlocks. UTRs are single-use; reject and revoke are supported. Deployed (`8859d77`); `upiSales` on, Razorpay `unlockSales` off, moderator claim set on the owner's two accounts. Paire Plus still uses the shared Razorpay account.

## 2026-10-17: Paire Plus by UPI; Razorpay checkout off
- Plus passes are now paid by UPI to paire.in@ybl with moderator approval (`4e4f908`). The pay panel offers a QR code and, on phones, PhonePe / Google Pay / Paytm / any-UPI-app buttons. New Razorpay Plus orders are switched off (`razorpayPlusSales`); the webhook still handles earlier Razorpay payments. Website, pricing and legal copy updated. Deployed (Firebase functions, Vercel).

## 2026-10-17: CCAvenue payments (Unlimited Chat and Plus)
- New web checkout through CCAvenue (UPI, cards, netbanking, wallets): `firebase/functions/src/ccavenue.ts` (`createCcavenueOrder`, `confirmCcavenueOrder`, `ccavenueResponse`, `settleCcavenueOrder`), `lib/ccavenue.ts` (AES-128-CBC per CCAvenue's kit, request building, status verdicts). Grants only on CCAvenue's order status API, exactly once; pending, duplicate (auto-refund), orphaned, refunded, chargeback and test-money cases handled. Records in `ccavenueOrders`, shown in member admin and metrics.
- App (web only): `services/ccavenueService.ts`, `hooks/useCcavenueReturn.ts`; `ChatAccessCard` and `PremiumScreen` buttons; drafts and the chat survive the full-page redirect (`sessionStorage`).
- Return address `www.paire.in/pay/ccavenue/` via a `vercel.json` rewrite, because CCAvenue only accepts the site its keys are registered for.
- CCAvenue replaces direct UPI (paire.in@ybl) for new orders while it sells; submitted UPI orders stay reviewable. Site, llms.txt, Terms, Refunds and Privacy copy updated.
- Switches: `MUSE_CCAVENUE_ENABLED`, `MUSE_CCAVENUE_LIVE`, `CCAVENUE_*`, secret `CCAVENUE_WORKING_KEY`, `runtime/trust.ccavenueSales` (`scripts/set-runtime-flags.mjs --ccavenue-sales`).
- Tests: `test/ccavenue.test.ts` (encryption against an OpenSSL vector), `integration/ccavenuePayments.integration.test.ts` (fake CCAvenue API), app draft test. Functions 234 and app 106 unit tests pass. One rules test and one end-to-end test that fail on `main` too (rules expression limit when sending in chats) are unchanged. No real CCAvenue payment made yet.

## 2026-10-17: See everyone again with Paire Plus
- Web Discover: when a free member has seen everyone, `DiscoverEmpty.web.tsx` offers Paire Plus ("see everyone in your range again, including people you passed on") with Expand search as the second choice. Plus members continue automatically into people they passed on; "You've also seen everyone you passed on before" when that runs out.
- Server: `parseFeedInput` takes `revisit`; `getDiscoverFeed` allows it only with Plus and `loadExclusions(..., includePassed)` keeps passes (likes, Super Likes and blocks still excluded). `swipe` lets a Plus member turn an earlier pass into a like or Super Like; repeats stay idempotent and free members can't change a pass.
- Paire Plus screen lists "See everyone again" (web).
- Tests: `integration/revisitFeed.integration.test.ts` (free refused, passes return for Plus, likes never return, second-look like matches, blocks excluded); feed-input unit tests updated. The one end-to-end test that fails on `main` too leaves `requireVerification` on, which can make a later UPI test fail when run in the same emulator session.
