# Muse architecture

Muse is an Expo (React Native) app on Firebase: Auth, Firestore, Storage, Cloud Functions, Cloud Messaging and Hosting. The server is authoritative for anything that affects other people: who you can see, what counts as a match, blocks, moderation and account deletion. The app writes only its own data, and security rules validate every write.

## Data model

| Path | Contents | Who can read / write |
| --- | --- | --- |
| `users/{uid}` | Public profile: name, age, gender (`woman`/`man`), photos, bio, interests, vibes, intentions, rapid answers, `languages` (≤6), `basics` (`heightCm`, `education`, `work`, `religion`, `diet`, `drinking`, `smoking`; no caste field), `isDiscoverable`, `onboardingComplete`, `lastActiveAt` | Read: owner and people with an **active match**. Write: owner, validated (age 18–100, field limits, no unknown keys) |
| `users/{uid}/private/info` | Email, birth date, accepted terms version | Owner only |
| `users/{uid}/private/settings` | "Show me" (`woman`/`man`), age range, max distance, approximate location, "only shared vibes", `openToCasual` (one-night stand, private), notification choices, and the privacy & control options `requireNote`, `firstMove`, `incognito`, `privatePhotos`, `sameIntentOnly`, `sharedLanguageOnly` | Owner only |
| `users/{uid}/private/safetyPlan` | Saved date plan | Owner only |
| `users/{uid}/private/duoInvite`, `duoRequest` | Your Duo invite code (and anyone waiting for you to confirm), or a friend's code you entered | Owner reads; written by functions |
| `users/{uid}/devices/{token}` | FCM push tokens | Owner only |
| `discovery/{uid}` | Server-built feed index: visibility, cohort, gender, age, preferences, coarsened location | Functions only |
| `swipes/{uid}/outgoing/{target}` | Likes, passes, Super Muses, an optional screened `note` (≤140 characters) and `priority` (Muse Plus) | Written by functions; owner can read |
| `superLikes/{target}/from/{uid}` | Who Super Muse'd you (boosts them in your feed) | Functions only |
| `matches/{id}` | Participants, name/photo snippets, last message, unread counts, read receipts, `active`. One-to-one ids are `a_b`; Duo chats are `duo_{duoA}__{duoB}` with `kind: "duo"`, `sides` (each pair's members still in the chat), `duoIds` and `memberHistory` (everyone ever in it) | Participants read. Created by functions. Participants may only send (bumping every other member's unread count by exactly one), mark read, or unmatch (one-to-one only) |
| `matches/{id}/messages/{id}` | `senderId` (or `"system"` for server notes such as "Riya left the chat"), `text` (≤1000), server `createdAt` | Participants read. Create only as yourself while the match is active and, when paid chat is on, with your own Plus or Unlimited Chat. Never edited or deleted by clients |
| `matches/{id}/safety/{messageId}` | Muse AI chat-safety warning: `recipientIds`, `category`, `severity`, `hidden` | Readable only by the listed recipients (never the sender). Functions write |
| `chatFlags/{matchId_messageId}` | Medium/high chat-safety flags for moderators: text, category, signals, `status`, `expireAt` (TTL, 12 months) | Functions and admins only |
| `duos/{id}` | Two friends dating together: `members`, `status` (`active`/`ended`), name/photo snippets, `lastActiveAt` | Members read while active. Functions write |
| `duoSwipes/{duoId}/outgoing/{targetDuoId}` | A pair's likes and passes: `type`, `byUid`, `targetUids`, target snippets | Both members read while the duo is active. Functions write |
| `duoInvites/{code}` | Invite codes: `fromUid`, `requestedBy`, `expiresAt` (TTL) | Functions only |
| `blocks/{uid}/blocked/{target}` | Blocks | Written by functions; owner can read |
| `reports/{id}` | Reason, details, reporter, target | Create only (as yourself); never readable by clients |
| `moderation/{uid}` | `status` (`ok`, `hidden`, `banned`), `cohort` (`public`, `test`), and `chatAccess` (`unlimited`, `premiumUntil`): the server's mirror of who may send, read by the rules | Functions and admins only |
| `presence/{uid}` | Online status: `sessions.{id}` (`platform`, `foreground`, `activeAt`, `heartbeatAt`) and `lastActiveAt`, server-time only, deleted when the member hides activity | Functions only (`presenceBeat`, `getPresence`) |
| `chatUnlocks/{uid}`, `chatUnlockOrders/{orderId}`, `chatUnlockCheckout/{uid}` | Unlimited Chat: the entitlement (one per account), every Razorpay order and its outcome (the audit trail), and the open checkout | Functions only |
| `upiUnlockOrders/{orderId}`, `upiUtrs/{utr}`, `upiSlots/{amount}` | Direct UPI to paire.in@ybl (superseded by CCAvenue for new orders): orders, used UTRs, reserved unique amounts | Functions only |
| `ccavenueOrders/{orderId}` | CCAvenue orders for Unlimited Chat and Plus (`kind`, `plan`, amount, `mode`, status, CCAvenue tracking ID): the payment audit trail, kept after account deletion | Functions only |
| `runtime/presence`, `runtime/trust` | Live switches: presence; photo-verification policy plus the paid-chat gate and Unlimited Chat sales (one document, because the rules read it) | Admins only (`scripts/set-runtime-flags.mjs`, `scripts/set-trust-policy.mjs`) |
| `limits/{uid}/daily/{yyyymmdd}` | Daily counters: likes, Super Muses, feed calls, AI openers and bios, chat-safety AI reviews, Duo likes, Duo feed calls, Duo code tries | Functions only |
| Storage `user-uploads/{uid}/photos/*` | Profile photos (JPEG, ≤10 MB, EXIF stripped by the app) | Owner writes; signed-in members read |

## Backend (Cloud Functions, `firebase/functions/src`)

- **`getDiscoverFeed` (callable).** Pages through `discovery` (visible, same cohort, a gender the viewer wants, most recently active first). It keeps only *mutual* candidates, meaning both people's gender, age range and distance limits are satisfied. It excludes anyone already swiped, blocked or blocking, then ranks by shared Muse Cards, vibes, recency, proximity and Super Muses. It returns public fields only. Distance is computed from a location rounded to about 1 km and shown in whole kilometres.
- **`swipe` (callable).** Records a like, pass or Super Muse (with an optional note, refused when the chat-safety scanner flags it) in a transaction. It enforces daily limits (free 25 likes and 1 Super Muse; Plus 100 and 5), the target's notes-only and incognito choices, and both people's two-way filters. When the other person already liked back, it creates the match in the same transaction, with `sparks` (each like's note) and `firstMoveBy` (set when exactly one of them chose "I'll message first"; the rules then let only that member send the first message). It pushes "It's a match" to the other person. **`undoSwipe`** reverts a pass.
- **`blockUser` (callable).** Writes the block and ends any match (`active: false`), so neither side can message.
- **`deleteAccount` (callable) and `onAuthUserDeleted` (auth trigger).** Erase the member's profile, private data, devices, photos, swipes in both directions, Super Muses, blocks, and every match with its messages. Reports and moderation records are kept for safety.
- **`onUserProfileWritten`, `onUserSettingsWritten`, `onModerationWritten`.** Keep the discovery index current, plus the name/photo snippet copied onto matches, duos and pairs' Duo likes. Heartbeat writes only patch `lastActiveAt`.
- **`getLikesYou` (callable).** People who liked you and you haven't answered, re-checked against both people's preferences, blocks and cohorts. Free to see. Ordered by effort (a note or Super Muse), then Plus priority, then the newest; each card carries its note.
- **Privacy in discovery.** Incognito members appear only to people they liked, in the solo feed and the Duo deck. Private-photo members' `photoUrls` are left out of the feed, likes and the Duo deck until a match. New members get a small ranking lift for 72 hours.
- **`suggestOpeners`, `suggestBio` (callables).** Muse AI icebreakers (for one-to-one and Duo chats) and bio ideas. A free built-in writer by default; Claude when `ANTHROPIC_API_KEY` is set, with daily limits.
- **`onMessageCreated`.** Runs chat safety, then notifies everyone else in the chat. Chat safety (`lib/chatSafety.ts`) is a rule-based English/Hinglish scanner for scams, threats, abuse, sexual demands, paid sex, under-18 signals and suspicious links. Claude Haiku can double-check medium+ flags when configured. The scanner writes the recipients' warning, masks abusive previews, records `chatFlags` and auto-hides repeat offenders for review. Unread counts are written atomically by the sender's batch, not here. See `docs/safety.md`.
- **Duos (`duos.ts`).**
  - `createDuoInvite`, `acceptDuoInvite` (enter a friend's code, which sends them a request), `answerDuoRequest` (the inviter confirms or declines), `cancelDuoInvite`, `cancelDuoRequest`.
  - `getDuoFeed`: pairs where everyone fits someone on the other side, liked-you first.
  - `duoSwipe` (either friend's like counts; a mutual like creates the four-person chat in the same transaction) and `undoDuoSwipe` (10 minutes).
  - `leaveDuo`, `leaveChat` and `getChatProfiles`.
  - Blocking closes shared Duo chats, and account deletion erases the member from every Duo chat they were ever in. See `docs/product/duos-prd.md`.
- **Presence (`presence.ts`).** `presenceBeat` records a session's state and how long ago the person last interacted (server time). `getPresence` answers only for people sharing an active chat with the caller who show their activity, deciding "online" from timestamps on every read. `touchActivity` keeps discovery recency for members who hide it. See `docs/presence-and-paid-chat.md`.
- **Who may send (`chatAccess.ts`, `chatEntitlement.ts`).** Sending needs the sender's own Paire Plus or Unlimited Chat once `runtime/trust.enforcePaidChat` is on; the rules check `moderation/{uid}.chatAccess`. `getChatAccess`, `createChatUnlockOrder` and `confirmChatUnlock` sell the ₹49 unlock through Razorpay, verified on the server; `razorpayWebhook` also handles its captures, refunds and chargebacks.
- **CCAvenue (`ccavenue.ts`, `lib/ccavenue.ts`).** The current web checkout for Unlimited Chat and Plus. `createCcavenueOrder` prices the order and returns CCAvenue's encrypted request; the browser form-POSTs it to CCAvenue; CCAvenue returns to `www.paire.in/pay/ccavenue/` (Vercel → `ccavenueResponse`). `settleCcavenueOrder` grants only on CCAvenue's order status API (never the browser's response), exactly once, and handles pending payments, duplicates (auto-refund), refunds and chargebacks. `confirmCcavenueOrder` serves the app's check after returning and "Check payment status". See `docs/ccavenue.md`.
- **Second looks (Paire Plus, web).** `getDiscoverFeed({ revisit: true })` (Plus only) keeps people the viewer only passed on (`swipes/{uid}/outgoing` with `type: "nope"`) in the feed; likes, Super Likes, matches and blocks stay out. The browser app switches to it by itself once a Plus member has seen everyone new, and `swipe` lets a Plus member turn an earlier pass into a like (a like is still final). Free members who reach the end see a Paire Plus offer instead.
- **`onReportCreated`.** When three different people report someone within 30 days, it sets `moderation/{uid}.status = "hidden"`, which removes them from discovery until a moderator reviews them.

The region is `FUNCTIONS_REGION` (default `us-central1`). It must match the app's `EXPO_PUBLIC_FUNCTIONS_REGION`.

## App (`apps/muse-mobile/src`)

- **Session:** `useAuthSession` listens to Firebase Auth and, while signed in, live-subscribes to your profile, settings and private info (`store/authStore`). `RootNavigator` routes signed-out members to Auth, incomplete profiles to Onboarding (resuming at the first missing step), and everyone else to the app.
- **Onboarding:** basics (name, birthday → 18+ check, gender, Show me) → photos (min 1, resized, EXIF stripped, uploaded via the Storage REST API) → about → Muse Cards → rapid questions → pledge, location and notifications.
- **Discover:** a Solo / Duos switch.
  - **Solo:** `SwipeDeck` (Reanimated + Gesture Handler) over pages from `getDiscoverFeed`. Swipes are optimistic; the match modal appears only when `swipe` returns `matched: true`.
  - **Duos:** `components/duo/DuoMode.tsx` covers the intro, invite code, confirm request and the Duo deck (`DuoCardView`). `hooks/useDuo` keeps your Duo, code and pending request live, and `screens/DuoScreen` manages your Duo.
- **Matches and chat:** one Firestore listener feeds the Matches tab and the unread badge (`store/matchesStore`). "See everyone who likes you" opens `screens/LikesGalleryScreen`. Chat subscribes to the newest 40 messages, pages older ones in, and sends message + preview + unread increments (to every other member) in one batch. Read receipts use the per-member `lastReadAt` ("Seen by …" in Duo chats). Chat-safety warnings come from the recipient-only `safety` subcollection; hidden messages show behind a tap. Duo chats add sender names, system notes, `screens/ChatMembersScreen` (view, report, block) and leaving.
- **Themes:** `src/theme/palettes.ts` defines 7 palettes with light and dark variants, turned into Tamagui themes in `tamagui.config.ts`. `store/appearanceStore` saves the palette and a System/Light/Dark mode on the phone. See `docs/design-system.md`.
- **Push:** `expo-notifications` registers the FCM device token when `google-services.json` is present at build time. Notification taps open the chat (`useNotificationRouting`).
- **Config:** `src/config/env.ts` uses the emulators and test mode only in development builds. `src/config/features.ts` enables calls only when a real Jitsi/JaaS domain is configured. `src/config/legal.ts` holds policy URLs and the support email.

## Native configuration

`app.config.js` is the single source of truth: version code, permissions (approximate location only, no media/camera/microphone), blocked library permissions, backups disabled, notification icon, and FCM when `google-services.json` exists. `plugins/withAndroidReleaseSigning.js` signs release builds with the upload key from `keystore.properties` or `MUSE_UPLOAD_*` environment variables. Run `npx expo prebuild` to regenerate `android/`.
