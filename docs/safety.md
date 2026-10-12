# Trust & safety

## What members get
- **18+ only.** Birthday is required at sign-up, under-18s are blocked, the birthday can't be changed in the app, and security rules reject ages under 18.
- **Mutual likes only.** Nobody can message you unless you both liked each other.
- **Report.** Available on profiles and chats, with categories: fake profile, inappropriate content, harassment, possibly under 18, scam/spam, unsafe behaviour offline, other. By default, reporting also blocks.
- **Block.** Ends the match immediately, stops messages both ways, and removes you from each other's feeds permanently.
- **Unmatch.** Ends the conversation for both people.
- **Privacy by design.**
  - Exact location is never stored; only an approximate position (about 1 km) that others see as whole-kilometre distance.
  - Profiles are visible only through discovery and to your matches.
  - Photo metadata is stripped.
  - Gender preferences are never shown.
- **Safety Center.** Emergency numbers (112, 181 women's helpline, 1930 cyber fraud), a check-in reminder, and a date plan you can save and share.
- **Account deletion.** In-app (password-confirmed) and via the website, and it erases all of the member's data.

## Private report review

Reports are submitted through `submitReport`; direct Firestore reads and writes are denied. The server binds the reporter to the session, validates any match/message, snapshots actual message evidence, uses a stable retry ID and limits new reports to 30 per day. A report is stored before the separate block operation. If blocking fails, the member can retry it without sending another report. My reports shows only the caller's report references, generic progress and outcomes; evidence, reporter/target IDs and staff notes remain private.

The private operator CLI is `firebase/functions/scripts/report-review.mjs`. It requires an ID token for a Firebase account with `moderator: true` in its custom claims. Supply `GCLOUD_PROJECT`, `FUNCTIONS_REGION` and `MUSE_MODERATOR_ID_TOKEN` locally, rather than in command arguments or chat. Running with no arguments returns a paginated received/reviewing queue; use `--cursor` with its returned cursor for the next page. The emulator option refuses non-demo projects.

- Mark an assigned report: `node firebase/functions/scripts/report-review.mjs --reviewing <report-id> --note 'Assigned for evidence review'`.
- Close it: `node firebase/functions/scripts/report-review.mjs --close <report-id> --outcome action_taken --action hide --note 'Private decision rationale'`.
- Outcomes: `action_taken`, `no_violation_found`, `insufficient_information`. Actions: `none`, `hide`, `ban`. An action requires an action-taken outcome; reviewed decisions are immutable and logged to server-only `reportReviews`. Exact retries are idempotent. The tool cannot downgrade an existing ban.

Blocking works immediately; a report does not wait for a moderator to keep its reporter protected. Three distinct reporters in 30 days can auto-hide a target pending review; reports closed as no violation/insufficient evidence stop counting. Automatic report/chat updates cannot overwrite a fresh review or ban. The ban action gates server/rule access but does not disable Firebase Auth itself; session revocation/account disablement and any appeal/restoration need a separate audited administrative operation.

A named review owner, staffing/response targets, escalation and appeals are still needed before launch. Confirm applicable grievance obligations and publish real contact details in finalized legal pages; the drafts do not establish operational compliance. Do not claim a response time that has not been staffed.

## Duos
- Two people only become a Duo after the inviter confirms the friend who entered their code. Codes are random, expire in 48 hours, take one request, and guesses are limited to 10 a day.
- Report or block one person from "People in this chat", even after the chat has ended. Blocking closes every Duo chat the two share, for everyone, without saying who blocked whom; blocking your own partner ends the Duo.
- Anyone can leave a Duo chat or their Duo in one tap. The one-night-stand setting is never used or shown in Duos.

## Privacy & control (India v2)
All free, for everyone, enforced on the server or in the security rules:
- **Likes with a note only:** a like needs a note unless it answers theirs. Notes are refused when the chat-safety scanner flags anything: money, phone numbers, links, abuse or sexual demands.
- **I'll message first:** the rules block anyone else's first message.
- **Incognito:** only people you liked can see you, in solo discovery and in Duos.
- **Private photos:** photos are left out of the feed, likes and the Duo deck until a match.
- **Same intentions only / Speaks my language:** two-way filters; an unknown value never counts as shared.
- **Close kindly:** a polite goodbye, then unmatch.

Known limits: photo links someone received before private photos was turned on keep working (Storage download tokens), so turn it on before sharing photos widely; folder listing is owner-only. In Duos, an incognito member's pair becomes visible to a pair that their friend liked. "I'll message first" has no expiry, so a match waits until the chosen person writes.

## Not yet built (suggested next steps)
- Live provider activation and acceptance testing for the implemented photo verification, immutable photo snapshots and badge gates; see production-integrations.md.
- Automated screening of photos (for example Cloud Vision SafeSearch). Messages are screened by Muse AI chat safety (below).
- Screenshot protection and real-device push acceptance testing. Message previews are opt-in and off by default.
- Firebase App Check (Play Integrity) to block scripted API use.
- A moderator dashboard, appeals and staffing. The private report review CLI and member progress flow are implemented.


## Muse AI chat safety

Code: `firebase/functions/src/lib/chatSafety.ts` (rules and the AI review) and `messages.ts` (the trigger).

- **What happens:** each new message is scanned. Words spelled out to dodge the filter ("s e n d m o n e y") are caught too. A flagged message gets `matches/{id}/safety/{messageId}` `{recipientId, category, severity, hidden}`. Only the recipient can read it, so senders can't probe the filter. Their app shows it as a warning. `hidden` messages sit behind a tap and are masked in the chat list and notifications.
- **Records:** medium and high flags are written to `chatFlags/{matchId}_{messageId}`. Only the server can read these. Each has `status: "open"` and an `expireAt` 12 months out. The TTL policy that deletes them is in `firebase/rules/firestore.indexes.json` and deploys with `firebase deploy --only firestore`.
- **Auto-hide:** `moderation/{uid}.status = "hidden"` is set after 3 open high flags across 2+ different chats within 30 days (a Duo chat counts once), after 5 from anyone, or at once for an under-18 signal (`reason: auto:chat-safety` or `auto:chat-underage`).
- **Reviewing a hidden account:**
  1. Read its `chatFlags` and any `reports` (reports from a warning card carry `messageId`).
  2. To restore the account, set `moderation/{uid}.status = "ok"` and `reviewedAt` to now, and mark the flags `status: "dismissed"`. Older flags then stop counting.
  3. To ban, set `status: "banned"`.
- **AI review:** only runs with `ANTHROPIC_API_KEY`. It uses `MUSE_SAFETY_MODEL` (default Claude Haiku 4.5), with 40 reviews per sender per day. It can't create a flag, change a category, or clear OTP, bank, gift-card, blackmail, stalking or under-18 signals.
- **Tuning:** add phrases to the tests in `firebase/functions/test/chatSafety.test.ts` first. Normal-chat examples go in the "leaves ordinary chat alone" list.
