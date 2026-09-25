# Muse Architecture

Muse is a React Native (Expo) app backed by Firebase Auth, Firestore, Storage, and Cloud Functions. The mobile app owns UI, local state, and lightweight data composition. Cloud Functions enforce rate limits and deterministic match creation.

## Layers
- UI: Tamagui-based design system + screens.
- State: Zustand for client state, TanStack Query for remote data.
- Data: Firebase client SDK with emulator support.
- Backend: Cloud Functions for match creation and feed safety.

## Firestore Data Model
- `users/{uid}`: public profile fields (no private data).
- `users/{uid}/private/info`: private fields (email/phone).
- `swipes/{uid}/outgoing/{targetUid}`: swipe actions.
- `matches/{matchId}`: match summary and last message.
- `matches/{matchId}/messages/{messageId}`: chat messages.
- `blocks/{uid}/blocked/{targetUid}`: blocked users.
- `reports/{reportId}`: safety reports.
- `limits/{uid}/daily/{dateKey}`: swipe limit counters (server only).

## Matching
- Swipe creation triggers `onSwipeCreated` Cloud Function.
- Mutual like/super generates deterministic match ID `uidA_uidB`.
- Match creation is idempotent via transaction.

## Discovery
- Client fetches candidate users.
- Filters blocked/swiped users.
- Scores by interest overlap for ordering.

