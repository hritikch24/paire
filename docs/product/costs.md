# Costs and the Play developer account

Researched on 2026-09-26. Prices change: check the linked pages before relying on them.

## What it costs

$25 once for Google Play, and Firebase stays free while you test. It only starts costing money once you have real traffic, and you pay for what's used.

### Google Play
- **$25 one-time** registration fee (about ₹2,200). No yearly fee.
- **Before going public:** personal accounts must run a closed test with 12 testers for 14 days. That costs nothing extra.
- **Commission:** none while the app is free. If you later sell subscriptions or in-app purchases, Google takes 15% in India (on the first $1M a year; 30% above that).

### Firebase
- **Right now: ₹0.** Your group runs on the Mac test server.
- **To go live you need the pay-as-you-go plan (Blaze).** Cloud Functions and photo storage don't exist on the free plan, so it needs a card. New Google Cloud billing accounts get a $300 credit for 90 days.
- **Blaze still has free allowances every month:**
  - Login: up to 50,000 monthly users.
  - Database: 50,000 reads, 20,000 writes and 20,000 deletes per day, plus 1 GB of data.
  - Functions: 2M calls a month.
  - Photos: 5 GB stored.
  - Push notifications: always free.
  - Website hosting (the legal pages): free.

### Rough monthly cost by stage

It depends on how much people swipe, message and look at photos.

| Stage | Firebase per month |
|---|---|
| Closed test (≈12–50 people) | $0, maybe a few cents |
| ~100 daily users | $0–5 |
| ~1,000 daily users | roughly $25–100 |
| ~10,000 daily users | roughly $250–1,000 |

Two things drive most of the cost as you grow:
- **Photo downloads** (about $0.12 per GB). Serving smaller card photos would cut this by more than half.
- **Database reads for building the Discover feed** (about $0.03–0.06 per 100,000 reads).

Both can be optimised before launch; neither matters at testing scale.

**Optional: Claude for the AI features.** Today's Muse AI is free and rule-based. With a Claude key, each set of icebreakers or bio ideas costs about $0.005 on Opus 5.5 ($4/$20 per million tokens in/out) or about $0.001 on Haiku 4.5 ($1/$5). I'd use Haiku; 1,000 AI requests a month is about $1.

**Keep surprises away:** Firebase has no hard spending cap, so when you enable Blaze, set a budget alert (for example at $10) in Google Cloud Billing. You get an email long before a real bill.

**Total to launch: $25**, plus Firebase at $0 until you have real users.


## Getting a Play developer account

No, there's no legitimate way to get your own Play developer account for free. The $25 is a one-time fee that every account pays, and I don't know of any waiver.

You're right that one account can publish unlimited apps, which opens one legitimate option: publish under someone else's account with their permission.

### Option 1: a friend or company publishes it for you (allowed)
- The account owner invites you to their Play Console, so you can upload builds and manage the listing yourself.
- **Catch 1, the name:** the store shows *their* developer name, and they're legally responsible for the app. The privacy policy and data-safety form have to match them.
- **Catch 2, shared risk:** a dating app is policy-sensitive. A strike against Muse counts against *their* account and all their apps. If their account gets banned, Muse goes down with it.
- **Upside 1, skip the test:** if their personal account was created before 13 Nov 2023 (or is an organisation account), you skip the "12 testers for 14 days" closed test.
- **Upside 2, moving later:** Google has a free app-transfer process, so you can move Muse to your own account later and keep its users, ratings and package name.

### Option 2: buying or "renting" an account from sellers (don't)
There are marketplaces selling "aged Play Console accounts". This breaks Google's rules: accounts must belong to the verified person using them. Google detects linked accounts and bans them in batches, usually with no appeal. You'd risk losing the app, its users and any reviews, and scams are common.

### Free alternatives to the Play Store
- **Sideloading the APK, like your group now:** free and fine for testing. It won't reach the public, and many people won't install unknown APKs.
- **Indus Appstore (PhonePe, India-focused):** when it launched it had no listing fee and no commission; check current terms. Its reach is much smaller than Play's, and it has its own content rules for dating apps.
- **Samsung Galaxy Store:** free to register, but only reaches Samsung phones.

(Amazon's Appstore shut down on Android in 2025, and F-Droid only takes fully open-source apps, which rules out an app built on Firebase.)

### Recommendation
 pay the $25 yourself when you're ready to launch. It's once, it keeps the app in your name, and nobody else's mistakes can take it down. If money is tight right now, publishing through a trusted friend's older account is the only legitimate route. It would even save you the 14-day test, but agree up front that you'll transfer the app to your own account later.

Sources:
- [Firebase pricing](https://firebase.google.com/pricing)
- [Google Play Console registration fee](https://support.google.com/googleplay/android-developer/answer/6112435)
- [Google Play service fees](https://support.google.com/googleplay/android-developer/answer/112622)
- [Claude API pricing](https://claude.com/pricing)
