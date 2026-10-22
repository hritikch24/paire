# Product review and Date Duet release — 23 October 2026

## Outcome

Built **Date Duet**, a public, shareable first-date planning experience at `/date-duet/`. Refreshed the homepage and desktop browser frame with an obsidian, rose and lilac visual system. Kept the browser app's selected theme and the separate Profile → Work Circles area. Shortened the mobile empty-feed offer after testing found an overlapping action at 320×568.

The previous Work Circles release was already on GitHub (`0f22e26`). This release's source commit and verified deployment are recorded in [web-changes.md](web-changes.md).

## Audit findings and changes

| Priority | Evidence | Delivered fix / remaining work |
|---|---|---|
| High | Public guides, comparisons, city copy and the verification page claimed universal mandatory selfie checks. Read-only live runtime inspection showed `requireVerification=false`. | Rewrote the claims and AI-readable facts: confirmed email before liking/chatting, separate photo-check badges, self-declared work badges. No runtime change. A badge does not establish identity, employment or intentions. |
| High | Public pricing and policies named CCAvenue, while read-only live switches showed Razorpay sales on and CCAvenue/direct UPI sales off. | Corrected pricing to use the methods shown at checkout; Terms, Refunds and Privacy distinguish current Razorpay checkout and historical payment records. Payment code, prices, grants and switches were not changed. |
| High | At 320×568, the bottom of Expand search extended under the tab bar. | Reduced padding and repeated promotional text. Both buttons now fit; explicit age/distance expansion and the monthly/day prices remain. |
| Medium | The expired 11–20 October Garba campaign remained in source HTML even when client JavaScript hid it. | Build removes the expired homepage campaign, navigation and marquee item at the IST date boundary. The retained Garba page explicitly describes the closed season as an archive. |
| Medium | Sitemap legal pages had no descriptions or canonicals. Work Circles was missing from the short AI page map. | Added legal descriptions and canonical URLs; Date Duet and Work Circles are in sitemap/AI-readable maps. AI crawler groups also exclude `/auth/` and `/app/`. |
| Growth | An empty feed gives someone little to share or do immediately. | Date Duet delivers a useful experience without account creation, a member-density threshold, new matches or paid access. It has story-card export and a clear route into Paire. |

## Market research and product choice

Research checked primary product announcements, rather than assuming a familiar feature was new:

- [Tinder Double Date](https://uk.tinderpressroom.com/Tinder-Launches-Double-Date-TheNew-Way-to-Make-Connections-with-Your-Bestie), launched June 2025, already supports exploring connections with a friend. A generic double-date feature would repeat an established idea; Paire also already has Duos.
- [Hinge Date Ideas](https://hinge.co/newsroom/date-ideas-feature), announced April 2026, lets people express activity preferences and respond with an idea and availability. An activity picker alone is not distinctive.
- [Hinge Your Turn Limits](https://hinge.co/en-gb/newsroom/your-turn-limits) addresses unanswered conversations. More matches and more notifications alone do not establish better engagement.

**Our product hypothesis:** a small, two-person ritual that respects both people's spending cap, pace, broad time preference and setting creates a more useful thing to share than another solo personality result. Date Duet combines that mutual planning with no signup, link-based participation and an exportable card. This is a testable positioning choice, not a claim that no product anywhere offers something similar.

SEO work follows [Google's structured-data guidance](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data): useful crawlable text and accurate schema. Schema and `llms.txt` do not guarantee rankings, rich results or mentions in AI answers.

## Date Duet behavior

1. Choose up to three public activities, broad daylight/evening preferences, a per-person spending cap, a maximum duration and an atmosphere.
2. Share an invitation. The recipient adds their own choices in five steps.
3. The blueprint uses common activities/windows, the lower budget and the shorter duration. Quiet/lively conflicts and incompatible plans stay unresolved. Park walks require common daylight.
4. Share the result back or save a 1080×1350 story card. The other person does not receive an automatic response; the interface says so.

There are no fake matches, fabricated compatibility scores, venue bookings, real availability or automatic messages. Costs and accessibility still need checking together.

Choices use a versioned, strictly validated URL fragment. There are no names, member IDs, messages, precise location or exact schedules. Links are readable, editable and forwardable by anyone holding them; they are not identity verification or encrypted invitations. Start fresh clears this page, not shared copies. The tool excludes the advertising pixel and sends only named action counts to `/v/`, never the answers. Existing advertising on other public pages is unchanged.

Invalid links, same-page link changes, back/cancel, sharing cancellation, manual copy fallback, reset and reload are handled. The experience works on mobile and desktop, with keyboard focus, reduced motion and a no-JavaScript explanation.

## Measuring the launch

Metrics → **Date Duet · last 7 days** reports six anonymous action totals over seven IST calendar days: started, invitation created, share/copy, comparison completed, story card exported and app-link clicked. Actions do not inflate page-view or daily-visitor totals. The server accepts only the tool's page and six permitted events, and ignores any supplied answers.

These are action counts, deduplicated by event within a page session, not unique people, delivered invitations, verified pairs or attributable signups. They can be blocked by a browser or inflated by automated traffic; use them as directional product signals. Compare sharing and comparison activity over time before spending heavily on promotion. Do not call a share action a confirmed delivery or claim app clicks are registrations.

Suggested launch copy, ready for owner-led promotion:

> Chai or a daylight walk? Thirty minutes or an unhurried hour? Make a Date Duet, send it to someone, and find a first-date starting point that fits both of you. Free, no signup: https://www.paire.in/date-duet/

> Two people. One first-date blueprint. Your lower spending cap and shorter time preference set the pace. Try Date Duet by Paire.

No customer email, browser push, Reddit post or advertising campaign was sent during this release.

## Verification

- `./scripts/verify.sh`: **733 tests** — app 174, website 7, functions 271, security rules 145, integration 136. Includes event validation, no answer persistence, no view inflation and seven-day aggregation.
- App lint, typecheck and 174 unit tests repeated after the empty-feed edit. Production browser export and static website build passed after all product edits.
- `e2e/date-duet.cjs`: create/respond/share, lower spending cap and duration, unresolved preferences, malformed links, same-page hash changes, back/reset/reload, keyboard activation/focus, cancelled sharing, manual-copy fallback, real PNG dimensions and answer-free analytics requests. Layouts at 320/390/768/1280px. Checks all **53 sitemap pages** for metadata/canonical/schema/trust claims and internal destinations/anchors.
- Browser navigation: signed-in/out Back and Forward, Settings/Appearance, refresh, desktop wordmark, legal home links, query links and sign-out remain within `/app/`.
- Discovery layout: 320×568 through 1440×900, including short landscape; full cards, reachable actions, touch scrolling without accidental swipes, Pass/Undo, note composer, Vibe First and Duos.
- Empty discovery: five viewport sizes, one-tap expansion loads eligible profiles, passed profiles stay excluded, other choices preserved, fully expanded refresh does not rewrite preferences.
- Work Circles: public page → sign-in → chosen circle, private photos/incognito, note-based like, separate Profile corner, badge add/remove and browser Back.
- All account and payment QA used isolated `demo-muse` emulators and fictional fixtures. Production inspection was limited to public pages, deployment metadata and named runtime booleans. No real member account, purchase or notification delivery was used as a test.

Screenshots and detailed local logs are under `/tmp/muse-pm-*`; they are local QA artifacts, not permanent public assets. Chrome automation does not replace real iPhone/Safari or assistive-technology acceptance testing.

## Next priorities

| Priority | Candidate | Evidence needed before building |
|---|---|---|
| 1 | Make Date Duet easier to use from a mutual conversation, with a system-planner invitation that avoids exposing profile details. | Comparisons and sharing activity should justify an authenticated integration. Preserve existing mutual-match and messaging access rules. |
| 2 | Small, opt-in local public-activity circles with honest headcounts and expiry. | Sufficient active members in one area and moderation capacity. Do not create pretend attendance or matches to populate them. |
| 3 | A private post-conversation/date check-in that improves recommendations without exposing individual ratings. | Establish consent, useful response volume and a clear deletion path; avoid public attractiveness scores. |
| 4 | Better conversion/retention measurement from landing → genuine conversation. | Design minimal, consent-aware attribution and agree the success definition. Today's anonymous action totals cannot establish acquisition cost or relationship outcomes. |

Before significant paid acquisition, validate current checkout settlement and refund operations through the established owner process and test opt-in push delivery on actual supported devices. Neither live charges nor real notification delivery was exercised here. Measure real conversations and return use alongside purchases, rather than relying on page views or manufactured urgency.
