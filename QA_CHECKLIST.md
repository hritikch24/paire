# Muse: release QA checklist

Run on a physical Android device with the release build (`dist/*.aab` via an internal test track) against production Firebase, using two accounts (A and B). Automated coverage is in `docs/testing.md`.

## Install and first run
- [ ] Installs from the Play internal test track; opens to Welcome in under 3 seconds with no crash
- [ ] Welcome shows the 18+ notice; the Terms, Privacy and Guidelines links open the hosted pages

## Accounts
- [ ] Sign up requires a valid email, an 8+ character password and the consent checkbox
- [ ] Wrong password shows a friendly message (no "Firebase:" text)
- [ ] "Forgot password?" sends a reset email that works
- [ ] Sign out returns to Welcome; signing in as someone else shows none of the previous account's data

## Onboarding
- [ ] Birthday under 18 is blocked with a clear message
- [ ] Photo picker opens the system picker (no storage permission prompt); uploads show in the grid; make main and remove work
- [ ] Location prompt asks for **approximate** location only
- [ ] Notification prompt appears (Android 13+) and, once granted, the device receives pushes
- [ ] "Enter Muse" lands on Discover; killing the app mid-onboarding resumes at the right step

## Discover and matching
- [ ] Only people matching both sides' preferences appear (for example A "Show me: Women" never sees men)
- [ ] Swipe gestures and buttons both work; the undo button brings back a pass
- [ ] Liking someone who hasn't liked you does **not** show a match
- [ ] When B likes A back, B sees "It's a Muse!" and A gets a "New match" push
- [ ] Blind date mode hides names and photos; the full profile opens from the card

## Chat
- [ ] Message input stays above the keyboard; long messages wrap; sending works offline→online
- [ ] Recipient gets a push while the app is in the background, but not while viewing that chat
- [ ] Unread badges clear on open; "Seen" appears after the other person reads
- [ ] Unmatch ends the chat for both; Block ends it and the blocked person disappears from Discover

## Chat safety
- [ ] A message asking for an OTP or money shows the recipient a warning card with Report; the sender sees nothing
- [ ] An abusive message is hidden behind "Tap to view" and shows "Message hidden by Muse AI" in the chat list and notification
- [ ] Safety Center explains Muse AI chat safety

## Duos and group chat (three test accounts plus one more pair)
- [ ] Discover → Duos: Invite creates a code; Share includes the code and the app link
- [ ] The friend enters the code and sees "Waiting for … to confirm"; the inviter sees the request and accepts; both see "You & …"
- [ ] "Not them" declines and uses the code up; a wrong code shows a clear message
- [ ] The Duo deck shows other pairs side by side; like, pass, swipe and undo work; "They like you two" shows when they liked first
- [ ] A mutual like shows "It's a Duo match!" and opens a four-person chat with group icebreakers
- [ ] In the chat: names on bubbles, "Seen by …", notifications for all three others, leave chat, People in this chat → report and block
- [ ] Your Duo screen lists your pair's likes with undo for 10 minutes; Leave Duo works

## Likes gallery and themes
- [ ] Matches → "See everyone who likes you" opens the gallery; the heart likes back and opens the chat on a match
- [ ] Settings → Appearance: every theme and System/Light/Dark apply at once, persist after restart, and keep text readable (check Noir in dark mode)
- [ ] The splash and welcome screens show the full "muse" wordmark

## Safety and settings
- [ ] A report with a reason goes through (check `reports` in Firestore); "Also block" blocks
- [ ] Settings changes (Show me, age range, distance, location, Show me on Muse) change the feed
- [ ] The check-in reminder fires at the chosen time
- [ ] Delete account asks for the password, then signs out; the account can't sign in again and its data is gone

## Store and policy
- [ ] Release preflight passes: `./scripts/release-preflight.sh --with-tests`
- [ ] The Play pre-launch report shows no crashes
- [ ] Data safety answers match `docs/RELEASE.md`
