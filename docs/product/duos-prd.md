# PRD: Muse Duos (double dates with a friend)

Status: **built** (2026-09-28). Shareable version of the original draft: https://claude.ai/code/artifact/0f6f3a3b-7b79-4122-8ae4-89b5ebb9982f

## Summary
Should Muse add group chat? Yes, in one form: two friends team up as a Duo, match with another Duo, and get a four-person chat. Open group rooms with strangers are out until Muse has real traffic and a moderation team.

## Why
| Source | What it shows |
| --- | --- |
| Tinder Double Date (2025) | About 90% of users under 29. Women were 3× more likely to like a pair than a single profile. 35% more messages in pair chats. Nearly 15% of people accepting an invite were new or returning users. |
| Tinder Social (2016) | An open "groups of friends" mode that failed. The 2025 version succeeded by keeping it to pairs. |
| Bumble BFF (2025) | Group features moved into a separate friendship app, not dating. |
| Muse in India (hypothesis, not yet measured) | Meeting with a friend along feels safer, especially for women, and is easier to explain at home. Every Duo needs a second person, so it feeds growth. |

Sources: [Tinder press room](https://www.tinderpressroom.com/2025-06-17-Tinder-Launches-Double-Date-The-New-Way-to-Make-Connections-with-Your-Bestie), [Newsweek](https://www.newsweek.com/tinder-double-date-feature-gen-z-2085069), [TechCrunch](https://techcrunch.com/2025/06/16/you-can-now-arrange-a-double-date-with-friends-on-tinder), [Seeking Alpha](https://seekingalpha.com/news/4458692-tinder-set-to-debut-revamped-double-dating-feature-in-us-after-failed-2016-launch), [Sherwood News](https://sherwood.news/business/tinder-is-trying-everything-to-return-to-growth-including-bringing-back-a/), [Bumble Inc.](https://en.wikipedia.org/wiki/Bumble_Inc.)

## Options considered
| Option | Value | Safety risk | Moderation load | Effort | Call |
| --- | --- | --- | --- | --- | --- |
| **Duos**: you + a friend match another pair; 4-person chat | High for women and first dates; built-in invites | Low: everyone opted in, max 4 | Low: same tools as 1:1 | ~4 weeks | **Built** |
| Wingmate: a friend reviews your picks | Medium; drives invites | Low–medium | Low | ~1.5 weeks | Later |
| Meetup groups for Muse-hosted events | High once events exist | Medium (offline) | Medium | ~5 weeks | After launch |
| Public interest rooms | Low for dating; turns into spam | High | High (24/7 humans) | 6–8 weeks | Don't build |

## Goals and non-goals
**Goals:** safer, lower-pressure first meetings; every user an inviter; more activity from women; chat safety as strong as one-to-one.

**Not in scope:** groups bigger than two pairs, public rooms, voice/video in group chats, paid Duo features, and the one-night-stand setting in any Duo context.

## Decisions (final)
| Question | Decision |
| --- | --- |
| Does one friend's like count for the pair? | Yes, with a 10-minute undo for either friend (unless it already matched). |
| How do two people team up? | One makes a 6-character code (cryptographically random, no 0/O/1/I/L, valid 48 h); the friend enters it; **the inviter confirms** it's really them. Code guesses are limited to 10 a day. |
| How many Duos at once? | One active Duo per person. |
| Mixed-gender pairs? | Yes. Fit is checked per person: everyone must have someone on the other side they'd want to see, and who'd want to see them (gender, age, distance). |
| Leaving a Duo chat | The chat carries on while each pair still has someone in it, then closes. |
| Blocking | Closes every Duo chat the two share, for everyone, without saying who blocked whom. Blocking your own partner ends the Duo. |
| The one-night-stand setting | Never shown, scored or used in Duos. |
| Launch cities | Open (see `docs/product/market-strategy.md`). |
| Name | "Duos". |

## Requirements as built
**Duos**
- D1 Invite by code and share sheet (the message includes the app link); confirmation by the inviter. *(P0, done)*
- D2 Duo card: both photos side by side, names, ages, match %, "You all love…" reasons, "They like you two" badge. *(P0, done)*
- D3 Solo / Duos switch on Discover; server-side Duo deck with per-person preference checks; daily like limit. *(P0, done)*
- D4 Your Duo screen: your friend, the pairs your Duo liked, undo, leave. *(P1, done)*

**Group chat**
- G1 Four-person chat: names on bubbles, "Seen by", per-member unread counts, Muse AI icebreakers written for the group. *(P0, done)*
- G2 A push to each of the other three, respecting their settings. *(P0, done)*
- G3 Spin off to one-to-one when two people both ask. *(P2, not built)*

**Safety**
- S1 Chat safety in groups: warnings go to everyone but the sender; abusive messages are hidden for all of them. *(P0, done)*
- S2 Report or block one person from "People in this chat", even after the chat ends. *(P0, done)*
- S3 Leave chat / leave Duo in one tap. *(P0, done)*
- S4 No sensitive settings in Duos. *(P0, done)*

## Technical design
- `duos/{id}`: members, status, name/photo snippets. A fresh random id each time two people team up.
- `duoInvites/{code}`: server-only; TTL on `expiresAt`. `users/{uid}/private/duoInvite` (your code and any pending request) and `duoRequest` (a code you entered).
- `duoSwipes/{duoId}/outgoing/{targetDuoId}`: readable by both members while the Duo is active.
- Duo chats are ordinary `matches` documents with `kind: "duo"`, `sides`, `duoIds` and `memberHistory`. Rules, unread counts, blocking and chat safety all extend instead of duplicating.
- Callables (`firebase/functions/src/duos.ts`): `createDuoInvite`, `cancelDuoInvite`, `acceptDuoInvite` (sends a request), `answerDuoRequest`, `cancelDuoRequest`, `getDuoFeed`, `duoSwipe`, `undoDuoSwipe`, `leaveDuo`, `leaveChat`, `getChatProfiles`.
- Details of the data model and rules: `docs/architecture.md`.

## Effort
| Work | Estimate (engineer-days) |
| --- | --- |
| Duo backend | 5–6 |
| Group chat | 3–4 |
| App screens | 6–8 |
| Tests | 2–3 |
| Policy and copy | 0.5 |
| Group testing | 3–5 |
| **Total** | **19–26 (≈4–5 weeks for one engineer)** |

Actual: built and reviewed in two working sessions with Claude Code, plus on-device testing.

## Success metrics (30 days after launch)
| Metric | Target | Guardrail |
| --- | --- | --- |
| Weekly users in a Duo | 15% | 1:1 matches per user drop ≤ 5% |
| Invites accepted | 40% of codes created | New users from invites finish sign-up at ≥ baseline |
| Messages per chat in the first 48 h | ≥ 1:1 average | Chats with zero messages ≤ 1:1 rate |
| Women's 30-day retention | +5 points for women using Duos | Reports per 1,000 messages ≤ 1:1 rate |

## Risks
- **Too few Duos early on.** The deck can run dry. Launch city by city, keep Duos as the second tab, and push invites.
- **Mismatched intentions** inside a pair. Each person's own "looking for" shows on their profile.
- **Pile-on harassment.** Per-person report and block, chat safety, one-tap leave.
- **Privacy between friends.** Your friend sees your Duo likes only; solo likes and chats stay private, and the intro says so.

## Known limits / next steps
- The Duo deck scans the 300 most recently active pairs; it needs paging past that.
- `sharedVibesOnly` isn't applied to Duos.
- G3 (spin off to one-to-one) isn't built.
