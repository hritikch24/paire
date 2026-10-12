# Market strategy: India first, then where?

Researched on 2026-09-26 from three angles: product, UI/UX and backend. The goal: decide where Muse launches, what each market needs, and the plan to get there.

## 1. Where can Muse work?

**India: yes, and it's the best first market.** The app is already partly built for India:
- Dates are written DD/MM/YYYY.
- The demo data is set in Mumbai.
- Harassment rules already mention caste and religion.
- The legal pages already have grievance-officer placeholders, which India's IT Rules require.

India also has a big, underserved market: more than 85 million people use dating apps, and most of them are unhappy with them.

| Market | Verdict | Why |
|---|---|---|
| **India** | **Launch first** | Largest need, low cost to reach users, and our free "Likes you" and safety features target exactly its pain points. |
| **US** | Later (6–12 months) | It works technically, but needs miles, MM/DD dates and US-specific safety and fraud rules, and competition is fierce. |
| **UK / EU** | Later | Strict age checks (UK Online Safety Act) and GDPR make them expensive to enter early. |
| **UAE, Saudi Arabia, Qatar, Indonesia, Malaysia** | **Exclude** | Dating apps, casual dating or LGBTQ+ content are restricted by law. The one-night-stand option makes this risky. |
| **China** | Impossible | Google services, including Firebase, are blocked. |

**How we handle this per country:** Play Console lets you pick which countries the app appears in. We launch in India only at first. Then we add a per-country settings layer (units, date format, whether the one-night-stand option exists, required safety notices), so opening a new country is a configuration change rather than a rebuild.

## 2. What Indian adults say is wrong with dating apps today

| Problem | Evidence |
|---|---|
| **Fake profiles** | 67% of Indian women on dating apps met at least one fake or misleading profile in a year. Tinder, the most downloaded app in India, has no profile verification. |
| **Feeling unsafe and harassed** | 1 in 4 women felt genuinely unsafe after a match contacted them. Research describes harassment that "follows you home". |
| **Lopsided gender ratio** | About 74% of users are men. Men struggle to get any match, while women are flooded with unwanted attention. |
| **Privacy from family and colleagues** | Many women use fake names or strict privacy settings because being discovered can damage their standing with family. Screenshots of chats being leaked is a real fear. |
| **Language** | Apps that work in Indian languages are growing 60–70% a year versus about 35% for English-first apps. |
| **Pay to see who likes you** | Paywalls on basic features make people quit. We already give "Likes you" away free. |
| **Scams** | Online scams rose 30% in 2024. |

## 3. Team discussion (condensed)

**PM:** Muse wins in India by being the dating app where women feel safe and men feel they have a real chance. We'll lead with safety, verified people and privacy, then build Hindi, then the other big languages.

**UX:** For women, that means control:
- Only people with a verified selfie can message me.
- Photos stay blurred until we match.
- Nobody can screenshot our chat.
- Notifications say "New message" instead of showing the text on the lock screen.

For men, it means fewer blind swipes:
- Likes with a short note attached, so a like stands out.
- A daily like limit that keeps quality up.
- Muse AI reasons, so matches feel earned.

**Backend:** Three decisions matter.
1. **Firebase region: Mumbai (asia-south1).** Users get a faster app and data stays in India, which makes India's data-protection law easier. This can't be changed after setup, so it has to be right.
2. **Selfie verification, done free first.** The phone checks that a real face is present, the member takes a selfie in a random pose, and a moderator approves it. A paid automatic vendor can come later.
3. **Hindi and English abuse filter.** A list of abusive Hindi and English words (including Hinglish) catches abusive first messages before they're delivered.

**PM, on religion and caste:** Religion becomes an optional profile field. There will be **no caste field and no caste filter**; it's discriminatory and a brand risk.

**Legal and trust & safety:** India's data-protection law (DPDP Act and its 2025 Rules) applies:
- A clear consent notice, and a way to withdraw consent at any time.
- Report data breaches within 72 hours.
- Full compliance by May 2027.

The grievance officer from the IT Rules is already on the legal pages as a placeholder that needs your details.

## 4. SDLC plan

| Phase | Output | Owner |
|---|---|---|
| Discovery | Complete (the research above) | PM |
| Requirements | India launch priorities (below) | PM + legal |
| Design | Screens for the privacy options, verification, likes with a note, Hindi | UX |
| Build | Sprints 1–3 | Backend + app |
| Test | Automated tests, UI flows, and a closed test of 12 testers for 14 days on Play | QA |
| Release | India only, Play age rating 18+, data-safety form | PM |
| Operate | Moderation queue, spending alerts, breach runbook | Backend + trust & safety |

**Sprint 1 (India launch blockers, about 2 weeks)**
- Mumbai region setup, and a per-country settings layer with Play availability set to India only.
- Lock-screen notifications that hide message text, and screenshot blocking in chat.
- Selfie verification with a verified badge, plus an "only verified people can message me" setting.
- A consent notice and a "withdraw consent" option in Settings, as India's data-protection law requires.
- Smaller photos, which means less mobile data for users and a lower Firebase bill.

**Sprint 2 (make women feel safe, give men a fair chance)**
- Photos blurred until match (optional).
- Likes with a short note, and a limit of 25 likes a day.
- The Hindi and English abuse filter.
- Optional religion and "languages I speak" fields.
- A moderation dashboard.

**Sprint 3 (reach)**
- Full Hindi translation, with the app ready for more languages.
- Google sign-in (free; SMS login costs money per message).

After that, US readiness: miles, US date format, and the scammer-warning notices US law now requires or is moving towards.

## 5. Open decisions
1. **Launch cities:** start in 2–3 cities (for example Mumbai, Bangalore, Delhi) so the feed has enough people, or open all of India at once? I recommend starting with a few cities.
2. **Religion field:** optional, as proposed?
3. **One-night-stand option in India:** keep it (it's private and only shows between people who both opted in), or hide it at launch to keep the brand safer? I recommend keeping it.

These three are still open (as of 2026-10-10).

## 6. Getting traffic

You don't need traffic from the US or UK yet, and it would hurt you right now. A dating app only works when enough people nearby are on it. A thousand users spread across three countries means everyone opens an empty feed and quits. Win one city at a time, starting in India, and go abroad only when you're ready to launch properly there.

### India: influencer ads, done right
**Pick 2–3 cities first** (for example Mumbai, Bengaluru, Delhi) and put the whole budget there.

**Recruit women first.** About 74% of Indian dating-app users are men. If you get women in, men follow, but not the other way round. Choose creators with mostly female audiences: lifestyle, fashion, college, "dating advice", solo travel.

**Micro-influencers beat celebrities.** Creators with 10k–100k followers are cheaper, more trusted, and their audiences are local. Book 10–20 of them rather than one big name.

**Content that works:**
- "I tried an app where I can see who likes me for free."
- "AI told me why we'd click."
- Safety features, for women.

Avoid anything sexual. It gets ads rejected and scares women away.

**Give every creator their own invite link or code** so you know which ones actually bring sign-ups rather than just views.

**Follow the rules:** India's advertising regulator (ASCI) requires creators to label paid posts (#ad, #collab). Keep everything 18+.

### US/UK: how traffic comes in when you're ready
Ranked by value for money:

1. **Short videos from creators (TikTok, Reels).** The same approach as India, but with small US/UK creators and hosted in your own account. This is the main engine for new dating apps there.
2. **Real-world events.** Speed dating, run clubs, art nights; they suit Muse's creative angle. Hosting "Muse Nights" in one city builds local critical mass quickly.
3. **University ambassadors.** Paid students recruit on campus. Cheap, and it builds local density fast.
4. **Reddit and communities.** City and creative-hobby communities: art, film, music.
5. **Press.** "Free 'who likes you' plus AI matchmaking" is a story tech and lifestyle journalists will run.
6. **Paid ads (Meta, TikTok, Google).** These scale, but are expensive. Very roughly, a US/UK install costs $3–8+, against under $1 in India. **Meta requires prior written permission before running dating ads**, and Google limits dating ads to adults with extra rules.

Also:
- Collect a waitlist for each city before launch ("unlocks when 1,000 people sign up in London"). It creates buzz and guarantees a full feed on day one.
- In the UK, paid posts must also be labelled #ad; in the US the equivalent rules come from the FTC.

### Numbers to watch (in any country)
- **Women to men ratio:** aim for at least 40% women. Pause ads aimed at men if it falls below that.
- **Sign-up to complete profile:** our two-step sign-up should get this above 70%.
- **Matches per user in week one:** zero matches means churn.
- **Day-7 retention.**
- **Cost per sign-up by creator code:** keep paying the creators who deliver, drop the rest.

### Growth tooling to build
- **Invite codes and tracked links:** every creator and user gets a link that opens Muse or the Play Store, and we see who brought whom.
- **A reward for inviting friends,** for example extra Super Muses.
- **City waitlist and launch gating:** the landing page collects sign-ups per city, and the app opens in a city once it has enough people.
- **A simple dashboard:** sign-ups, gender ratio and matches per city and per creator code.

These fit into Sprint 1–2 alongside the India safety work (see `docs/PRODUCT_BACKLOG.md`).

## Status (2026-10-10)
Since this review, these shipped: smaller photos (1080 px), AI chat safety with a Hindi/English abuse and scam filter, notifications that hide flagged message text, Duos (double dates with a friend), and the likes gallery. Selfie verification, screenshot blocking, the Mumbai region, consent withdrawal and Hindi are still open; they're tracked in `docs/PRODUCT_BACKLOG.md`.

Sources:
- [YouGov and safe-dating-app findings for India (Truebondr)](https://www.truebondr.in/blog/safest-dating-apps-women-india-2026-verified-real-men)
- [Emotional impact of dating-app harassment on Indian women (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0277539525000780)
- ["Known unknown" men: safety work on Indian dating apps (Taylor & Francis)](https://www.tandfonline.com/doi/full/10.1080/07491409.2025.2489606)
- [Indian women prefer dating apps for safety (Global Dating Insights)](https://www.globaldatinginsights.com/featured/survey-finds-that-indian-women-prefer-dating-apps-for-safety-and-empowerment/)
- [Anonymous dating apps in India (Hidnn)](https://hidnn.com/blog/best-anonymous-dating-apps-india-2026)
- [What the data says about dating in India (Vlncy)](https://medium.com/@vlncy/swipe-nation-what-the-data-actually-says-about-dating-in-india-3c9f9e23dabb)
- [India dating platform feasibility research (NextLeap)](https://assets.nextleap.app/submissions/IndiaDatingPlatformFeasibilityResearch_-accf218f-fecb-4057-9317-08fc8e87fa68.pdf)
- [DPDP Rules 2025, official notification (PIB)](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
- [DPDP compliance guide (Seclore)](https://www.seclore.com/fundamentals/dpdp-rules-2025-compliance-guide/)
- [DPDP compliance deadlines (Fisher Phillips)](https://www.fisherphillips.com/en/insights/insights/indias-new-data-privacy-rules-are-here)
- [Online Dating Safety Act of 2023 (Congress.gov)](https://www.congress.gov/bill/118th-congress/house-bill/6125/text)
- [Utah Online Dating Safety Act](https://le.utah.gov/xcode/Title13/Chapter67/C13-67_2023050320240101.pdf)
- [US Senate romance-scam bill (Global Dating Insights)](https://www.globaldatinginsights.com/regulation-compliance/romance-scam-prevention-act-dating-apps/)
