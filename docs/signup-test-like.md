# Signup test like and funnel

Measures whether a new signup comes back. **Off by default.** Real members are never contacted.

## How it works
1. `onTestSignupCompleted` fires when `users/{uid}.onboardingComplete` first becomes true. If `runtime/testLike.enabled` is true and the account's email is on `allowlist`, it creates `testLikeJobs/{uid}` with `dueAt = now + delayMs` (default 5 minutes; clamped 1 to 60 minutes). Create-only, so retries never queue a second like.
2. `sendDueTestLikes` runs every minute and delivers due jobs: one `like` swipe from the sender account (`source: "testLike"`) plus the normal "Someone likes you" push. It skips blocked, deleted, or already-swiped recipients and records why.
3. `adminGetSignupFunnel` (owner support access only) lists each test signup. "Returned" means `lastActiveAt` is later than the like's send time.
4. Owner screen: `https://www.paire.in/app/?admin=signup-funnel`.

Deploy: `firebase deploy --only firestore,functions:onTestSignupCompleted,functions:sendDueTestLikes,functions:adminGetSignupFunnel` (the index `testLikeJobs(status, dueAt)` must be READY before the scheduler can query).

## Turning it on (owner only, in Firestore)
`runtime/testLike`:
```json
{ "enabled": true, "senderEmail": "cognizantviasuperset2021@gmail.com", "allowlist": ["your.test.signup@example.com"], "delayMs": 300000 }
```
The sender account must already exist. Add each throwaway test signup email to `allowlist` **before** it finishes onboarding. Set `enabled: false` to stop; pending jobs are then not sent.

## Safety
- Allowlist only: other emails never get a job; a job whose email left the allowlist is skipped.
- The sender never likes itself. Rules deny all client access to `testLikeJobs` and `runtime`.
- Hidden activity (`showPresence: false`) removes `lastActiveAt`, so such a test account shows as "hasn't come back".

## Related web changes
- Locked "people liked you" card shows the member's own server-earned Monthly price.
- `OutOfLikesBar` on Discover at zero free likes: exact earned price, honest "free likes come back tomorrow", dismissible per day.
