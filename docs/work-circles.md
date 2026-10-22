# Work Circles

Browser only. Open **Profile → Work Circles**; no new section is added to Discover or the public homepage. A member can explore any circle without joining it. They may optionally save one public `users/{uid}.workSector` badge describing their own work, or remove it with **No badge → Save badge**.

Badges say **Self-declared**. They do not verify employment, qualifications or employer affiliation. No work email, employer name or professional registration is collected. Existing free/Plus allowances, verification gates and messaging terms apply.

## Share links

Each landing page has its own title, description, canonical URL, FAQ and app link that survives sign-in/onboarding. The in-app **Share this circle** action shares that page using the browser share sheet or clipboard. The pages show no member identities or invented activity counts.

| Circle | Public marketing page |
|---|---|
| Corporate & tech | https://www.paire.in/circles/corporate/ |
| Government & public service | https://www.paire.in/circles/government/ |
| Banking & finance | https://www.paire.in/circles/banking/ |
| Healthcare & hospitals | https://www.paire.in/circles/healthcare/ |
| Education & research | https://www.paire.in/circles/education/ |
| Founders & business | https://www.paire.in/circles/business/ |
| Creative & media | https://www.paire.in/circles/creative/ |
| Law & legal | https://www.paire.in/circles/legal/ |
| Hospitality & travel | https://www.paire.in/circles/hospitality/ |
| Engineering & operations | https://www.paire.in/circles/engineering/ |
| Other paths | https://www.paire.in/circles/other/ |

The hub is `/circles/`. App links are `/app/?circles=1` and `/app/?circle=corporate` (replace the validated sector ID). Browsing a circle never changes the member's saved badge or search settings.

Example copy: “A connection beyond the meeting calendar. Explore Corporate & tech on Paire.” For healthcare: “Someone who understands life around shifts. Explore Healthcare & hospitals on Paire.” Do not describe members as verified professionals or imply an employer partnership.

## Implementation and rollout

Sector IDs are mirrored in the browser catalog, server catalog, Firestore enum validation and static circle pages. `buildDiscoveryEntry` indexes only an explicit valid sector; free-text occupations never infer membership. Existing accounts stay outside circles until they choose a badge. Existing profile/settings/moderation triggers keep membership current without a backfill.

`getDiscoverFeed({ circle, cursor })` narrows the existing authenticated feed with a composite discovery index. Viewer preferences, cohort isolation, incognito, private photos, blocks, bans and verification still apply. The live profile rechecks the sector before returning a card, so a stale index cannot expose someone who removed or changed their badge. Circle likes use the ordinary swipe endpoint and allowance; only reciprocal likes match.

Deploy Firestore rules/indexes before the browser. Check the new index is READY, then deploy `getDiscoverFeed`, `onUserProfileWritten`, `onUserSettingsWritten`, `onModerationWritten`, `getDuoFeed`, `duoSwipe` and `getChatProfiles`. The last three can rebuild missing discovery entries and must preserve the new field. No payment, presence or notification switches change.

Validation: `./scripts/verify.sh`, `node apps/web/scripts/build.mjs`, and `MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/work-circles.cjs` against isolated demo-muse UI emulators. Browser fixtures are fictional; no real accounts, messages, payments or marketing sends are used for QA.
