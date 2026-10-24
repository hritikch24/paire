# Diwali Together (2026)

A voluntary, free Diwali edition for adults celebrating away from home. It replaces Garba Nights in the **browser app and website**. Native builds are untouched (the Garba code stays behind platform guards).

**What it is not:** an event, a booking, a host, a home-hosting directory, or a promise of company. There is no "lives alone" label or any question about living arrangements. No fake attendance, bots or random matches.

## Dates

India Post lists Diwali on **Sunday 8 November 2026**. Paire's planning window is **5–10 November**; the edition is open **24 October – 10 November IST**. After that it closes by itself everywhere (see Expiry). The window lives in `firebase/functions/src/lib/diwali.ts`, `apps/muse-mobile/src/data/diwali.ts` and `apps/web/site/diwali-together/core.mjs`; a client test reads the server file to keep them equal.

## Member experience

- **Discover** has a "🪔 Diwali Together" chip (web only). Tapping it without a plan opens the opt-in sheet; nothing is ever enrolled automatically, including from `/app/?edition=diwali&vibe=…` links (they survive sign-in and onboarding, then open the sheet).
- **Sheet:** up to 3 plans and 3 days, a plain privacy note, save, update and *Leave Diwali Together*. Settings has the same entry ("My Diwali plans").
- **Plans:** `chai` (Chai & mithai), `mela`, `lights`, `meal`, and **`bash` (Diwali bash)**, a label for people going to a Diwali party or get-together who want company. It groups them in the feed; Paire does not host or vet these. The sheet shows a safety hint when it is picked.
- **Cards:** the badge shows only overlapping plans, e.g. "🪔 Diwali together · Diwali bash". Never exact dates, coordinates or settings. Same badge on Vibe First and profile details.
- **Empty state:** plain and honest, with *Edit my plans*, *Invite someone* (share link to the public page) and *Show everyone*.
- **After the window** the chip disappears and an old link just opens normal discovery.

## Matching rules (server: `getDiscoverFeed({ diwali: true })`)

Requires an open season and the caller's own valid plan. A candidate needs a shared upcoming **date AND plan**, in the **same area**: within 50 km when both share an approximate location, otherwise the same stated city (first comma segment, case-insensitive). Everything else still applies: the caller's own search preferences, cohort isolation, blocks, incognito, verification, exclusions, daily like limits. The index (`discovery/{uid}.diwali`, `diwaliPlan`, `city`) is only a first filter: every returned candidate is re-read from fresh settings/profile, so an opt-out, a new city or expired dates take effect immediately even if the index lags. Candidates are matched to profiles by uid.

After a genuine mutual match, `suggestOpeners` may add an opener about a plan both picked (no dates).

## Notifications

- **Reminders:** `diwali` type, only when the recipient and a real candidate share a plan, date and area; one per season, with the existing opt-in, 24h inactivity, 72h spacing and 2/week cap. Never "you matched" or invented likes.
- **Likes alerts (new):** a first-time like that doesn't match sends a push "Someone likes you" (no name, "Open Paire to see your likes."). It follows the existing *New matches* preference; a preview-off member sees "You have a new like."
- **Sign-in prompt (web):** about 4 s after sign-in, if this browser isn't registered and permission isn't blocked, a friendly sheet explains likes/matches/messages and asks. The browser's permission dialog opens only from the *Allow notifications* tap. *Not now* is respected for 24 h, and we stop after 5 asks (Settings and the setup nudge remain). Automated browsers (`navigator.webdriver`) are never prompted.

## Public site

`/diwali-together/` (design in `diwali.css`; logic in `core.mjs`, unit-tested; controller `diwali.mjs`). It has an invitation-card maker: one canvas draws the preview, the 1080×1350 PNG download and the Web Share file. State lives only in the URL fragment (`#v=chai&d=2026-11-08&c=Pune`), is validated (whitelisted plan/day, city letters only, 40 chars, oversized fragments ignored), drawn as text (never `innerHTML`) and never leaves the browser. No contact or address fields. The page swaps to a "Diwali 2026 has passed" state client-side after 10 Nov IST, and `closeDiwali()` strips the campaign blocks at build time. `/garba-nights/` redirects permanently (vercel.json) with a static fallback page. Homepage teaser expires via `data-campaign-until`. Sitemap, llms.txt/full, schema (WebPage/FAQPage/BreadcrumbList, **no Event**) and footer link only exist while the campaign is open.

## Tests

`firebase/functions/test/diwali.test.ts`, `integration/functions.integration.test.ts` (Diwali feed, stale index, opt-out), `integration/eventNotifications…` (like alert), `firebase/test/firestore.rules.test.ts` (bounds, tampering, ownership, withdrawal), `apps/muse-mobile/__tests__/diwali.test.ts`, `apps/web/test/diwali.test.mjs`, browser: `e2e/date-duet.cjs` (public page, card maker, expiry, 53-page crawl) and `e2e/diwali-together.cjs` (in-app flow and notification prompt; needs the isolated emulators, see `web-preview.md`). `e2e/sharing-and-browser-push.cjs` leaves a registered browser behind: clear `webPushSubscriptions`/`notificationReminders` before re-running it.
