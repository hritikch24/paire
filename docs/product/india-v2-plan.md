# Muse India v2: problems, solutions and pricing

Product review · 11 October 2026 · Status: **decided and being built** (see "What ships in v2").

The founder's brief: make Muse the dating app where Indian women feel in control and Indian men feel they have a fair chance. Muse is for men and women only. Launch on the web first (Vercel), with Android following.

## 1. Where Indian dating apps fail today

The evidence comes from the research already in `market-strategy.md` and `delhi-ncr-direction.md`, plus the sources at the end. Each problem is a hypothesis to measure in the beta, not a proven fact about every user.

| # | Problem | Who it hurts | What we see |
|---|---|---|---|
| P1 | **Lopsided ratio, lopsided attention.** About 3 men for every woman. | Both | Women get floods of low-effort likes and stop opening the app. Most men get almost no matches and feel invisible. |
| P2 | **Low-effort likes and "hi" openers.** A like costs nothing, so it means nothing. | Women first | Women can't tell who is serious. Chats start with "hi" and die. |
| P3 | **Fake profiles, catfish and scams.** A Juleo–YouGov survey found 78% of women met fake profiles. | Both | People hold back, assume the worst, and leave. |
| P4 | **Harassment and pressure.** In a Bumble survey of Indian women, 83% reported online harassment. | Women | Unsolicited messages, pushing for a number, "why aren't you replying". |
| P5 | **Fear of being seen.** Family, colleagues or neighbours spot the profile. | Women especially | Many use no photos or fake names, which makes P3 worse. |
| P6 | **Intent mismatch.** One wants marriage, the other a fling, and nobody says so. | Both | Wasted weeks, awkward first dates. |
| P7 | **Missing Indian basics.** Language, diet, religion, drinking and height decide a lot here, yet most apps hide them or paywall the filters. | Both | People swipe blind, then unmatch after the first question. |
| P8 | **Ghosting and dead chats.** Two out of three users have never met a match in person. | Both | Matches sit unanswered, and people feel rejected without knowing why. |
| P9 | **Pay-to-play pricing.** Hinge+ costs ₹1,199 a month in India, and Tinder Plus about ₹650. Basics like seeing who likes you sit behind paywalls. | Men first | People resent paying for basics, and paywalled "who likes you" feels like a scam. |
| P10 | **Unsafe first meetings.** | Women | Women have nowhere to share plans and no quick help. |

## 2. Solutions (the v2 product)

| Problem | Solution | Why it works |
|---|---|---|
| P1, P2 | **Sparks: a like can carry a short note (up to 140 characters).** Notes are screened by the same scam and abuse filter as chat. When you match, the note becomes the first message, so the chat never starts empty. | Effort becomes visible. Women can tell interest from spam, and men who put in effort get noticed. |
| P1, P2 | **"Notes only" option.** You can require a note before anyone can like you. | A woman flooded by likes can switch off low-effort ones in one tap, with no paid filter. |
| P1 | **Fewer, better likes.** Free members get 25 likes and 1 Super Muse a day, and the same rules apply to everyone. | A scarce like is a considered like. It cuts the flood women get and makes each man's like count for more. |
| P1 | **Fair exposure.** New members get a short "new here" boost, and the ranking never scores attractiveness. | Every profile gets seen, so men aren't invisible. |
| P4 | **"I'll message first" option.** After a match, only you can send the first message. | Women control the pace (as on Bumble), but it's a choice, not a rule for everyone. |
| P5 | **Incognito.** Only people you've liked can see you. Free. | Nobody browsing (a cousin, a colleague) stumbles on you. |
| P5 | **Private photos.** Your photos stay hidden from the feed and the likes list until you match. People read your vibe and basics instead. Free. | Women can join without their face being public, but matches still see real photos, so P3 doesn't get worse. |
| P6 | **"Same intentions only."** You only see, and are only seen by, people who want the same thing (long-term, marriage-minded, etc.). | It cuts mismatches before the first message. |
| P7 | **Indian basics on every profile:** height, languages, education, work, religion (optional, and never caste), diet, drinking, smoking. A free "Speaks my language" filter. | The deal-breakers are visible up front. Language matters most for comfort and is a free filter. There is no caste field, by design. |
| P8 | **"Close kindly."** One tap sends a polite goodbye ("I don't think we're a match, but I wish you the best") and ends the match. | It replaces ghosting with closure and costs the sender nothing. "Your turn" nudges and AI icebreakers already exist. |
| P3 | Live photo verification, AI chat safety, mandatory verification gates and report review. *Already built; provider setup pending.* | Verified people only, and scam warnings in chat. |
| P10 | Safety Centre (112, 181, 1930), date plan, check-in reminder. *Already built.* | Help is one tap away. |
| P9 | **Free covers everything that matters; Plus is cheap and never auto-renews** (below). | It is honest, affordable and a fraction of the competition's price. |

### Why the safety options are free and the same for everyone

Privacy and control are safety features, and safety is never sold. The options are built for women's needs, but any member can turn them on, and prices are the same for men and women. Charging by gender creates legal risk and resentment.

## 3. Pricing

**Free forever:** discover, 25 likes with notes each day, 1 Super Muse, see everyone who likes you, unlimited chat, Vibe first, Duos, AI icebreakers, every privacy and safety control, and photo verification.

**Muse Plus** is a pass, not a subscription. It never auto-renews, and you see the exact end time before paying.

| Pass | Price | Per day | What you get |
|---|---|---|---|
| Day | **₹20** | ₹20 | 100 likes/day, 5 Super Muses/day, priority likes (listed ahead of other plain likes in their "Likes you"; notes still come first) |
| Week | **₹99** | ₹14 | Same |
| Month | **₹299** | ₹10 | Same |

Why these prices:
- **₹20/day** was the founder's price and works as a no-risk trial ("less than a chai and samosa").
- **₹99 and ₹299** are familiar Indian price points (mobile recharges, OTT plans). At ₹299 a month, Plus costs about a quarter of Hinge+ (₹1,199) and under half of Tinder Plus (about ₹650).
- Plus sells **reach** (more likes, priority), never **safety or access**. Seeing who likes you, messaging and privacy stay free.
- On Android, passes are sold through Play billing (RevenueCat, already integrated). On the web, the plan is Razorpay (UPI, cards), which needs a merchant account. Until then, the web shows passes as "coming soon".

Store product IDs stay `muse_premium_day/week/month`; only the store price changes.

## 4. What ships in v2

| Area | Change |
|---|---|
| Gender | Men and women only. "Show me" is Men, Women or Both. Defaults to the opposite gender. |
| Sparks | Note on any like, screened on the server, sent as the first message on match, shown in "Likes you". |
| Her rules (Settings → Privacy & control) | Notes only · I'll message first · Incognito · Private photos · Same intentions only · Speaks my language |
| Basics | Height, languages, education, work, religion, diet, drinking, smoking. Shown on cards and profiles. |
| Close kindly | In chat: a polite goodbye message, then the match ends. |
| Limits and pricing | Free 25 likes/1 Super; Plus 100/5 and priority likes; ₹20/₹99/₹299. |
| Ranking | A "new here" boost for 72 hours; likes with notes and Supers listed first in "Likes you". |
| Web | Static web build on Vercel (`vercel.json`), updated landing page, setup guide `docs/vercel.md`. |

## 5. Next (not in v2)
1. **Hindi and Hinglish interface.** The biggest reach unlock outside metros.
2. **Razorpay (UPI) passes on the web**, once a merchant account exists.
3. **Video call before meeting**, once the JaaS account is set up (the code exists).
4. **Contact blocking** (hide from people in my phone book) on Android.
5. **Women-led events** ("Muse Nights") in Delhi NCR for density.

## 6. Success metrics for the beta
- Women's 7-day retention, and the share of women who turn on at least one privacy option.
- Likes with a note as a share of all likes, and their match rate compared with plain likes.
- Matches that become a two-way conversation (target: above 50%).
- Men with at least one match in week one.
- Reports per 1,000 messages (should fall).
- Plus conversion and refunds.

## Sources
- [Juleo–YouGov survey: 78% of women met fake profiles (SheThePeople)](https://www.shethepeople.tv/news/fake-profiles-matchmaking-apps-survey-matrimony-app-scams-6950352)
- [Two in three users never meet matches in person (IndianTelevision)](https://indiantelevision.com/mam/juleo-yougov-report-two-in-three-users-never-meet-matches-in-person-240904/)
- [Indian women and dating-app safety (Global Dating Insights)](https://www.globaldatinginsights.com/featured/survey-finds-that-indian-women-prefer-dating-apps-for-safety-and-empowerment/)
- [Hinge in India: Hinge+ at ₹1,199/month (Global Dating Insights)](https://www.globaldatinginsights.com/from-the-web/hinge-india-second-largest-market/)
- [Tinder India pricing (Android Authority)](https://androidauthority.com/best-dating-apps-india-848802)
- [India App Store price index](https://opentherank.com/app-price-index/india/)
- [Google Play billing in India](https://blog.google/intl/en-in/products/platforms/sustaining-google-play-as-a-valuable-partner-to-indias-app-ecosystem/)
