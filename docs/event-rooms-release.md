# Paire browser release candidate • 27 November 2026

Local implementation on release/event-rooms-local in muse-events and kanoon-simplified-events. Starting revisions are 9511421 and 8509fb6 respectively. The older gift checkout branch is a separate line. No deployment or live configuration change is part of this package.

## Production receipt • 27 November 2026 IST

The owner authorised the subsequent release. KraftAI validator `72ff8e6` reached production first. Firebase CLI released the rules, indexes and all 44 targeted functions in `muse-352ba`. KraftAI comparison `f97019e` and Paire UI `9520a6e` reached production. The public app and pricing pages returned HTTP 200, both domains displayed all seven prices, and an unknown event link returned the listing service’s 404. The production terms and privacy pages contained no deployment contact placeholders. Marketing publication remains separate.

## Operator and member flows

An existing support operator opens /app/?admin=events. The callable checks the signed-in account, current moderator and support claims and enabled operator record. Save as unpublished to remove a listing from discovery. Close to retain a historical listing while ending room actions. A room ID stays stable when the listing changes. Enter dates with an explicit offset and select the display timezone. Cover images are optional site-owned assets under /event-covers/ with recorded permission. No event or attendee is seeded.

Share /events/?id=ROOM_ID. Its public HTML contains the event title, venue, local dates and share metadata before JavaScript runs. The response requires cache revalidation. Unpublishing makes the next request return 404. The small guest page uses a restricted response containing a count and an opaque temporary deck handle. Each card uses a generic placeholder. Browsing, Previous and repeated passes stay in the tab. Room discovery is explicit, verified and subject to member eligibility. The backend checks both participants and the server clock on event actions. The event deck uses the existing swipe transaction, mutual-match document and chat rules. Wedding Nods retains its separate private workflow.

Membership is removed on leave and account deletion. A scheduled cleanup rechecks the current room closure inside each deletion transaction before removing expired participants. Firestore TTL removes temporary decks, quota and attribution documents asynchronously. The server closes discovery exactly at end + 604800000 ms independently of TTL. Listings and deduplication keys persist for shared links. Paid orders and safety records follow the existing retention schedule. Clearing the event room never cascades into established mutual conversations.

## Fixed web catalogue

All totals include applicable taxes, paid once. The terms and backend price contract confirm tax-inclusive treatment. Day and Week include 100 regular likes daily. Other Plus plans include unlimited regular likes. All Plus plans include five daily Super Likes, liker reveals, priority likes, the age-gap filter and sending in eligible mutual matches.

| Purchase | Total | Paise | Access |
|---|---:|---:|---|
| Day Plus | ₹59 | 5900 | 24 hours |
| Week Plus | ₹179 | 17900 | 7 days |
| Monthly Plus | ₹349 | 34900 | 30 days |
| Six-month Plus | ₹1,249 | 124900 | 180 days |
| Annual Plus | ₹1,799 | 179900 | 365 days |
| Lifetime Plus | ₹3,699 | 369900 | While Plus operates on this account |
| Unlimited Chat | ₹79 | 7900 | Account-wide eligible mutual messaging, no scheduled expiry or Plus discovery benefits |

[Phone pricing screenshot](evidence/event-rooms/pricing-390.png) · [Desktop pricing screenshot](evidence/event-rooms/pricing-1440.png).

The price version is paire-web-2026-11. Day, Week and Monthly remain giftable. Same price for every gender. Safety, reading and eligible three-profile rewind are free.

The ladder segments by time commitment. The step from Monthly to Annual reduces the daily equivalent from ₹11.63 to ₹4.93. Lifetime costs about 2.06 Annual purchases. Unlimited Chat supplies a distinct low-upfront option for a member who only wants to message. There is no evidence yet that any price maximises revenue. Compare conversion, refunds and net revenue per eligible visitor by pack and acquisition cohort after release. Monthly changes most sharply for eligible members. ₹285 for 60 days was ₹4.75/day. ₹349 for 30 days is a 22.5% increase in total and about a 145% increase per day. Older paid and issued 60-day purchases keep their original duration.

## Review and verification

Paire commits `1a28b2e`, `eb79f26` and `6f87a21` cover the paid catalogue, the event journey and server-rendered public listings. Commit `960d6d4` adds direct guest-denial checks and the scheduled date on closed-room screens. Apply the complete candidate before deployment. KraftAI has a separately deployable validator commit (`72ff8e6`) and public comparison (`f97019e`).

- Run Paire checks from this worktree with `KRAFTAI_SOURCE_DIR=/Users/hritik/Projects/kanoon-simplified-events ./scripts/verify.sh`. The explicit path points the parity test at the production-lineage candidate. The primary checkout is still on the older gift branch.
- The emulator exercises non-operator denial, duplicate event prevention, expiry exactly at end plus seven days, participant cleanup after an extension, visibility changes, the guest response allowlist and concurrent rewind. Preview, attribution and first-send replay checks use isolated accounts.
- The payment tests use fake providers to cover fixed totals, valid earlier orders, invalid signatures and amounts, ownership, repeat capture, pending and delayed settlement, disputes, refunds, entitlement queues and existing lifetime access. The checkout suite compares every fixed amount with its product, duration and provider metadata. New direct-UPI manual confirmations require a transfer reference because new orders have identical fixed totals.
- `e2e/event-room-preview.cjs` runs the static guest experience with explicitly fictional HTTP fixtures in Chromium, WebKit and Firefox at 320, 390, 768 and 1440 px. Chromium mobile includes network throttling and a 4× CPU slowdown. A mobile WebKit run uses an Instagram user agent. [Guest phone screenshot](evidence/event-rooms/chromium-390.png) and [desktop screenshot](evidence/event-rooms/firefox-1440.png).
- `e2e/event-room-member.cjs` runs Chromium against isolated Auth, Functions and Firestore emulators with external browser requests blocked. It verifies the shared link, sign-in, original room, no automatic participation or swipe, opt-in, pass, rewind and same-card return after simulated checkout cancellation. Only the final deliberate like creates a positive swipe. [Member screenshot](evidence/event-rooms/member-390.png).
- The verification-email contract test exercises a fresh-tab return with room, temporary card slot and campaign, and rejects an external continuation. New-account onboarding, an actual delivered verification email and an actual bank redirect were not tested end-to-end. Real mobile Safari, Android hardware, assistive technology and installed social browsers still need release QA. An eligible member card can expire or become unavailable during a return.
- The production-mode local website build deliberately lacks deployment-only legal contacts and prints a placeholder warning. Confirm their configured rendering in the approved preview environment. No production data, customer communications or processor transactions were used.

### Results from the local candidate

| Check | Observed result |
|---|---|
| Paire full verification | Passed. App 297, website 29, script helpers 5, Functions unit 426, Firestore/Storage rules 161, emulator integrations 281 across 23 suites. |
| Public endpoint | Emulator HTTP GET returned the room title and local event details without JavaScript. Internal license data stayed private. After unpublishing, a conditional request with the old ETag returned 404. Direct unauthenticated Firestore reads and writes returned 403. |
| Browser / website build | Production-mode Expo export and static site build succeeded. Guest controls passed all 12 browser/width combinations. Real emulator dark-mode Chromium at 320 px rendered both [the listing without JavaScript](evidence/event-rooms/no-js-listing-320.png) and [an honest empty room](evidence/event-rooms/empty-room-dark-320.png). Public pricing rendered all seven totals at 390 and 1440 px without horizontal overflow. |
| KraftAI | Checkout suite 13 passed. Unrelated phone workflow suite 5 passed. Next production build with local test-only provider placeholders generated 212 static pages. |
| QR renderer | A fictional 20-character room ID and campaign produced a 640 × 640 PNG locally. A public campaign needs an actual published ID. |

Draft marketing materials are in the sibling marketing repository. [Feature facts](../../marketing/handoff/paire-event-rooms-feature-facts.md) · [Copy, links, QR and measurement handoff](../../marketing/handoff/paire-event-rooms-release-draft.md).

## Measurement and retention

The 30-day campaign funnel counts unique preview sessions separately from registered accounts. Attribution records the first registration after preview, explicit participation, event-origin mutual match, checkout, confirmed purchase and first sent message. The first-send metric covers any eligible match for the attributed account. Individual orders remain the authority for financial reporting. Raw funnel documents and per-account attribution are server-only. Share aggregated cohorts with small groups suppressed.

## Coordinated release and rollback

1. Rebase both branches onto reviewed production heads, rerun verification and reconcile any new settlement paths. Confirm version, exact amounts, durations, current public terms and disclosure labels. Check unexpired, pending and captured historical orders using synthetic fixtures.
2. Stage and verify compatible KraftAI order acceptance first. Its public pricing comparison should switch with Paire quoting. A push to main can auto-deploy Vercel. Prepare separate commits or coordinated deployments for validator compatibility and public copy.
3. Before enabling room traffic, deploy the reviewed Paire rules, indexes/TTL and compatible Functions. Verify sender-only entitlement, gifted time, callback replay, dispute handling, existing 60-day credits and founder totals. Keep payment routes and the production sales switches as configured.
4. Release the Paire browser app, static listings and pricing with the new quote version. Check a real published listing only after authorization. Confirm published close time, 18+ preview, restored destination and free safety tools. Capture independent release receipts for Firebase, Paire Vercel and KraftAI Vercel.
5. Release marketing only after the production facts and room are verified. Render a QR locally with node scripts/event-qr.cjs ROOM_ID CAMPAIGN OUTPUT.png. The draft is outside the posting queue.
6. To roll back discovery, unpublish affected rooms and roll back the browser entry points. Keep the stricter send rules, stored orders, queues, TTL, signed callbacks and both catalogue versions' settlement support. If new quoting must stop, coordinate the sales pause separately with the owner. Restore compatible quoting and public copy together. Never redeploy a validator or settler that rejects an already-issued order. Reconcile pending/late captures, duplicate deliveries and reversals by stored order ID.
