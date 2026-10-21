# Likes, Plus offers and complimentary months

Implemented 2026-10-21; see `docs/web-changes.md` for release status. Browser UI only; no native configuration or store billing changes.

## Free allowance and Plus offer

After the last successful free like/Super Like (unless a match celebration takes precedence), or an attempted like beyond the free allowance, the browser offers **Maybe later** and **Get Paire Plus**. The latter opens the existing Plus plans; checkout requires the member's deliberate purchase action. A refused swipe stays unsent and its card is restored. The server returns structured quota details so offline failures, unrelated quotas, exhausted passes and an existing Plus member's cap cannot be mistaken for an upgrade opportunity. Plus still has 100 likes/5 Super Likes daily; another pass does not reset that day's usage.

## Pending likes

- `getLikesYou` returns `{profiles, count, locked, hasMore, expiresAt}`. A free or expired member receives `profiles: []`, an anonymous count and lock metadata. It never sends liker IDs, names, ages, notes, photo URLs or identifying thumbnails to that member.
- The blurred preview is made from decorative silhouettes, not original photos hidden by CSS. Its count is based on real, unanswered incoming likes; no synthetic admirers are added. The Matches tab badge includes pending likes alongside unread messages, even while browsing Discover.
- Active Plus reveals liker profiles and notes, with effort/priority/recency ordering. Incoming likes ignore the recipient's age, gender, radius, language, intention and vibe search filters. The server still checks current visibility, verification, cohorts, both block directions, prior answers, and photo privacy. An incognito member who already liked the recipient has chosen to be visible to them.
- An explicit like back to a real incoming like may be outside search filters. Both accounts must still be visible/eligible and both positive swipes are required for matching; note requirements and incognito controls remain enforced. Ordinary discovery likes still use the sender's own filters.
- Discovery doesn't disclose a free member's incoming Super Liker through its badge or ranking flag. Shared profiles and Firestore client reads do not provide a liker-identity list.
- The reader scans at most 300 newest incoming likes, with `hasMore` indicating the scan reached its cap. The count is therefore a lower bound when capped. The query is scoped to the signed-in member, rate limited, and refreshed on screen/browser focus; one polling observer in the tabs refreshes once a minute while active. Account-specific query keys prevent cross-account cache reuse. At expiry the browser clears cached reveal data and refetches, and the server rechecks every request. Stale active billing caches are refreshed before deciding reveal access.

Site, generated pricing/comparison/city pages, app onboarding, Plus benefits, browser metadata, `llms.txt` and Terms now describe the anonymous free preview and Plus identity reveal. Existing mutual matches, reading messages and safety controls keep their existing access rules; Unlimited Chat grants messaging, not the likes reveal.

## Grant one complimentary month

The metrics button **Grant 1 month of Plus** opens `/app/?admin=grant-plus`. It survives login and opens a browser form with email lookup, recipient review, an optional note and **Grant 30 days free**. A month here is exactly **30 days**, independent of the paid ₹299/60-day promotional offer. Grants stack after current validity, preserve permanent chat access and don't reset daily usage.

`adminPreviewPlusGrant` and `adminGrantPlusMonth` both require the existing enabled owner role: moderator and supportAccess claims in the request **and the current Firebase Auth account**, plus `supportOperators/{actorUid}.enabled`. Ordinary moderators, members, disabled/revoked owners and read-only support sessions cannot grant. The form never exposes account search to an unauthenticated caller.

The server fixes the duration and zero price, validates the recipient and records an audit before success. One transaction writes:

- `complimentaryPlusGrants/{uid}`: aggregate gifted expiry, independently of `supportPlusGrants` payment recoveries.
- `billingSupportAudit/complimentary-{actorUid}-{requestId}`: actor, recipient UID, optional reason, dates, 30 days, `action: goodwill-grant`, and amount zero.
- Billing, pass ledger and chat-access mirror: new expiry, preserving a separate permanent chat unlock.

The request UUID is reused for retries and retained in the owner's session storage until acknowledged, including across a page refresh. Concurrent delivery of that UUID grants once; an intentionally new grant uses a new UUID. The complimentary source survives premium/chat refresh and subsequent paid extensions. Member admin labels it Complimentary. Account deletion removes gifted entitlement; the owner audit is retained. Clients cannot read or write grant/audit collections. Metrics excludes this zero-value goodwill action from revenue and paid order counts. No gateway payment is invented, refunded, charged or marked confirmed, and the form sends no email automatically.

## Verification and release

`./scripts/verify.sh` passed all **544 tests** (117 app, 258 Functions, 52 rules, 117 integration). It covers quota prompts, server identity redaction, forged inputs/roles, stale/expired passes, private photos, hidden/blocked/cohort controls, out-of-filter answers, stacking/replay/concurrent grants, zero revenue, deletion, and support-session/client-rule denial. Browser acceptance passed at 320/390px using `MUSE_WEB_QA=demo-muse node e2e/premium-likes-grants.cjs` against an isolated default-port UI workspace. It needs billing entitlement enabled **only in that workspace**; provider secrets remain disabled and test-server/native E2E modes remain off. The test permits loopback traffic only (metrics data is mocked), uses fictional accounts and never opens a real checkout. Artifacts are written to `/tmp/muse-likes-plus-grants-qa` by default.

Release requires the website/browser app plus these functions because several deployed handlers recompute premium from shared billing code: `getLikesYou`, `getDiscoverFeed`, `swipe`, `adminPreviewPlusGrant`, `adminGrantPlusMonth`, `adminGetMember`, `getPremiumStatus`, `revenueCatWebhook`, `createPlusOrder`, `confirmPlusPayment`, `razorpayWebhook`, `createCcavenueOrder`, `confirmCcavenueOrder`, `ccavenueResponse`, `createUpiUnlockOrder`, `reviewUpiPayment`, `getChatAccess`, `confirmChatUnlock`, `deleteAccount`, `onAuthUserDeleted`. Deploy these together so an older handler cannot erase a gift from cached access. No runtime payment/presence switches, Firestore index migration or new client allow rule is required. Release only on the owner's request.
