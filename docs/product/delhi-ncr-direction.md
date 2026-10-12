# Dating that feels worth showing up for

Product and design direction · 10 October 2026

## Decision

Launch a small, well-supported dating community in Delhi NCR, while keeping registration and discovery open to adults elsewhere. Build around authentic profiles, clear intentions, consent, and fewer, better conversations. Women must have control over who sees them, who can contact them, and how quickly a conversation moves. Those controls should be available to everyone, including queer and nonbinary members.

“Perfect” and “better than Bumble” are goals to validate with people, not claims the interface should make. Measure successful, comfortable conversations and dates rather than time spent swiping.

## Evidence and its limits

- [Bumble's India safety guide](https://bumble.com/the-buzz/safety-center-bumble-india) discusses harassment and reporting. [Its verification workflow](https://bumble.com/en-us/the-buzz/request-verification) compares a prompted selfie with profile photos. Verification and blocking are competitive basics.
- [Tinder's women's expectations survey](https://in.tinderpressroom.com/Tinder-Unveils-Her-New-Dating-Rulebook-this-International-Womens-Day), [first-date survey](https://in.tinderpressroom.com/From-Video-Chats-to-Group-Dates-GenZs-First-Date-Formula) and [Indian-language safety initiative](https://in.tinderpressroom.com/Tinder-and-Centre-for-Social-Research-Launch-Dating-Safety-Guide-in-Indian-Languages) discuss safety, intentions, personal-information boundaries and language access. These are useful discovery signals; company surveys describe their samples, not every Indian dater.
- [Tinder's Face Check announcement](https://www.tinderpressroom.com/2025-10-22-Tinder-to-Expand-Facial-Verification-Feature-Across-the-U-S-%2C-Setting-a-New-Standard-for-Dating-Safety) describes facial verification against profile photos. Mandatory verification alone is not a unique differentiator.
- [NIST identity-proofing guidance](https://pages.nist.gov/800-63-4/sp800-63a.html) treats biometric matching, liveness, injection attacks, forged media, accessibility, and exception handling as separate controls. An image detector alone cannot justify an “AI-free” guarantee.

The problems below are product hypotheses informed by that evidence and the code audit. We have not yet interviewed Delhi NCR users or established prevalence. Before launch, recruit consenting adults across Delhi, Gurugram, Noida, Ghaziabad, and Faridabad: at least 12 women, 8 men, and 6 queer/nonbinary participants, with varied work schedules and experience. Ask about their last actual bad and good dating experiences, then test the flows on their own phones. Do not recruit minors or use private chats without permission.

## Problems → solutions

| Problem | Product response | Acceptance criterion / current gap |
| --- | --- | --- |
| Catfishing, AI faces, stolen pictures | Free live video selfie, face comparison to every face-bearing photo, replay/injection defence, human appeals; no gallery verification | Only server-issued, unexpired approval for the current photo set can produce a badge. A real provider and review operations are still needed. |
| Fake badge after changing photos | Bind approval to the exact ordered photo list; expire/revoke on changes | Added server-derived status logic rejects changed photos, expired and malformed approvals. Client profile fields never confer verification. |
| Harassment and sexual pressure | Mutual match before chat; keep scam/abuse warnings, report/block; add consent to calls/media | Existing mutual chat and moderation remain. Media stays out of scope until recipient-controlled consent is implemented. |
| Stalking, family/coworker exposure, outing | Hide/pause discovery free; approximate location; opt-in incognito and contact avoidance after privacy review | Hide control and private location already exist. Notification names/text are now hidden by default; previews require an explicit opt-in, including for older accounts. Never show exact home/work, live route, or verified legal name. Contact avoidance and incognito are future work. |
| Many low-effort likes vs. little useful attention | Vibe-first cards with an explicit photo reveal; explain shared interests and intentions | New mode uses the real feed and real like/pass actions. Hidden-photo cards must not promise anonymity: names and photos remain available on full profiles. |
| Intentions mismatched or unknown | Put relationship intent before a like; never infer casual interest | Existing explicit choices and mutual casual opt-in remain; unknown answers are not treated as agreement. |
| Men feel invisible or pressured to buy | Free incoming likes and chat, honest limits, no fabricated likes or paid “guaranteed matches” | Preserve existing free likes gallery and messaging. Test visibility distribution and response rates by cohort. |
| Ghosting, anxiety and forced deadlines | Gentle “your turn” prompt, pause anytime, optional respectful closure | Keep current turn cues. No forced 24-hour expiry or public reply-rate score. Closure templates are a later chat improvement. |
| Scams involving money, venues or off-app contact | Contextual warnings, report offline behaviour, explain reporting and human review | Existing scanner supports English/Hinglish. Venue partnerships require vetting; no “safe venue” guarantees. |
| Unsafe first dates | Private date plan, deliberate sharing with a trusted friend, local reminder, free Safety Centre | Existing tools are surfaced. Reminder is local: it does not dispatch police or automatically alert friends. |
| Language, disability and social prejudice | Plain English now; test Hindi/Hinglish next; larger targets and text; no caste/skin tone ranking | Current themes have contrast checks. Translation and screen-reader/device testing remain release work. |
| Paying for safety or unclear renewal | Safety/verification/basic matching/chat free; explicit fixed-duration passes | Pricing selector is a proposal with purchase disabled until store billing and backend receipt validation exist. |

## Naming

Recommended creative direction: **Aarzo**, a shortened brand spelling inspired by *aarzoo* (wish/desire). Tagline: **“A little spark. A real connection.”** Warm for North India, pronounceable beyond it, and independent of the launch geography. Keep Muse as the working name until the founder picks a name and a proper clearance search is complete.

| Candidate | Strength | Concern |
| --- | --- | --- |
| Aarzo | Warm, short, romance without matrimony framing | Existing fashion/other uses; spelling needs pronunciation testing and trademark clearance |
| Miltaa | Conversational, suggests meeting | Creative candidate; availability and linguistic testing not completed |
| Raabta | Strong emotional connection and familiar cultural vocabulary | Existing matrimonial/social and other apps make differentiation difficult |

Avoid Saath as the lead: [Saath already describes itself as a dating product](https://nrisaath.com/). [Baatchit is used for a chat/video app](https://play.google.com/store/apps/details?id=com.infino.baatchit). [Milora already has a mobile app](https://www.milora.app/privacy). Search findings are preliminary and not trademark clearance. Verify Indian trademark records, store listings, domains and handles with a qualified reviewer before launch. A store display name can change independently of the immutable application/bundle ID; do not change existing IDs or Firebase registrations just to rename the brand.

## Differentiating interaction: Vibe first

1. Choose **People**, **Vibe first**, or existing **Duos**.
2. Vibe first presents a readable personality card: intention, shared reasons, one answer and interests. Photos begin covered, one card at a time.
3. Tap **Reveal photo** to see the same person's photo. Revealing never sends a like and resets for the next person.
4. Tap **Like** or **Pass**, with the existing server-backed mutual matching and pass undo. Full profile is always available. Neither gender is forced to initiate.

This is an alternative to the appearance-first swipe loop. It is not anonymous blind dating, an experiment that conceals identity after a match, or a guarantee of compatibility. A later **Send a spark** feature could attach a short prompt reply to a like, with strict limits and screening; it needs a backend/message model and has not been added yet.

## Matching and AI

The current backend uses a deterministic ranking formula over explicitly shared interests, vibes, intentions, answers, approximate distance and activity. Keep it inspectable and cheap. Replace misleading “92% match” language with a **vibe score** and explain that it is a ranking hint, not a probability of love or safety. Do not present the current rules as an LLM assessment.

For a production AI matchmaker: first apply mutual age/gender/distance preferences, blocks and verification; then retrieve eligible candidates using shared choices and opt-in free text; finally rerank and generate short explanations that cite only actual profile answers. Always provide a rules-only fallback. Separate consent for external AI processing; exclude precise location, biometrics, phone/ID data, private chats and protected traits from the matching model. No attractiveness score, caste/religion/income inference, or autonomous messages. Record model/version and allow disabling personalisation. Validate against successful conversations and opt-in date feedback, including exposure fairness and negative safety outcomes. Current generative bio/openers integrations remain available separately.

## Verification architecture and launch gate

`moderation/{uid}.verification` is server-only. Schema v2 requires `schemaVersion: 2`, `storageBound: true`, a valid current `photoUrls` list and finite `verifiedAt`/`expiresAt` UTC milliseconds. The follow-up freezes exact object generations in client-immutable storage before the live check. Only a signed provider result followed by moderator review of every snapshot can issue approval; that transaction updates the profile's photos and approval together. Feed photo badges are checked against the hydrated response photos, while matching and message authorization independently enforce current approval. Live operations require provider setup and acceptance testing; no new account can verify while capture is unavailable.

States: unverified → pending → verified / rejected; verified → needs recheck on changed photos or expiry. Rejection has a private reason and an accessible human appeal. Provider outage never results in automatic approval. Verification confirms a face matched photos at a point in time; it is not an endorsement, identity/background check, or proof of harmless behaviour.

**Mandatory verification code is implemented; live operation is pending.** The follow-up adds a Didit capture adapter, full-body signed callback, immutable snapshots, moderator reviews, gates and erasure. Configure and validate these against the provider, add OTP/abuse protections and confirm retention/disclosures before public launch. Validate hydrated photos at response time as well as index time, so delayed Firestore triggers cannot expose stale badges. Keep existing reporting, blocking, account deletion and safety tools usable even when verification expires. Test every alternate entry point and legacy account. Do not enable a partial gate that only protects the visible screen.

## Pricing proposal

Founder direction: keep Muse until a name is chosen. Initial use remains free with the existing daily allowances; ₹20/day is the premium entry price. The current server resets those allowances at midnight UTC (05:30 IST), once every 24 hours, rather than 24 hours after each person's first use. This behaviour is preserved and exposed through the read-only `getDailyAllowance` endpoint. Weekly/monthly prices are proposals, not founder-confirmed prices.

| Pass | Upfront amount | Duration from activation | Equivalent |
| --- | --- | --- | --- |
| Day | ₹20 | 24 hours | ₹20/day |
| Week | ₹119 | 7 × 24 hours | ₹17/day |
| Month | ₹399 | 30 × 24 hours | ₹13.30/day |

These are founder-review prices, not proven economics. Day/week/month currently grant the same optional allowance increase: 300 likes and 10 Super Muses/day. Extra preference layers and saved picks are future work. Basic vibe scores, verification, safety, ordinary discovery, incoming likes and matched messaging remain free. Avoid charging women differently, selling contact details, paid safety, or suggesting payment buys consent or guaranteed matches.

Use fixed-duration non-renewing passes initially; show total store-localised price and exact expiry before confirmation. Product IDs, taxes, store fees, verification cost, support cost, refunds and pass entitlements need unit-economics validation. Use native store purchase flows and server verification of signed receipts/tokens before granting entitlement. Never trust a local Boolean, redirect success screen, or payment screenshot. [Google's one-time purchase lifecycle](https://developer.android.com/google/play/billing/lifecycle/one-time) documents backend processing and entitlement handling. A RevenueCat integration is now implemented; payments stay unavailable until stores, SDK/server keys and signed callbacks are configured. Selecting a preview plan cannot debit money or grant benefits.

## Visual direction

Warm ivory, deep rose/wine, generous margins, large editorial headlines, readable prompt cards and restrained accents. One primary action per decision. Safety and trust are easy to reach; pricing lives on its own page. Preserve every existing light/dark palette. Touch targets at least 44 px, scalable text, labelled icons, explicit selected states, scrolling on compact screens and meaningful empty/error/loading states. Avoid fake verified shields, countdown pressure, invented matches, generated dating-profile portraits or decorative percentages.

## Rollout and success

Begin with an invite-led NCR beta (for example 150–300 consenting adults), with registration available outside NCR and clear honest empty states. Recruit balanced cohorts by age, intention and mutual preferences, not simply total gender counts. Concentrate density in Delhi, Gurugram and Noida, then Ghaziabad/Faridabad and other North Indian cities based on demand. Do not manufacture location or member numbers in the UI.

P0 public launch: real verification and enforcement, moderation queue and response ownership, privacy/AI disclosures, deletion checks, safe location defaults, billing if charging, security rules tests and real-phone accessibility/usability checks. The private report-status/review flow is now implemented. P1: Hindi/Hinglish UI, quiet/incognito controls, respectful closure and prompt-attached likes. P2: consent-based semantic matching, vetted public-place planning and opt-in feedback.

Track verified active members by mutual preference segment, match → two-way conversation, self-reported comfort, consensual date outcomes, repeat offender recurrence, report response/resolution, false verification rejections, time to verification, and costs per retained member. Investigate differences across gender/orientation/age without publishing labels about individual users. Set targets after beta baselines; “zero bad experiences” and “better than Bumble” cannot honestly be promised.

## Implementation in this iteration

- Redesigned welcome/discovery/profile surfaces and a real Vibe-first interaction using the existing feed/match services.
- Notification privacy: names and content hidden by default for server pushes and local alerts, with a free explicit opt-in in Settings.
- Dedicated transparent pricing screen with selectable durations and native purchase unavailable until provider/store configuration.
- Verification education/status screen and server-only approval validation; no client-issued badges or fake completed verification.
- Vibe-score wording, matching explanation page and safety entry points.
- Follow-up: mandatory trust gates, immutable snapshots, Didit live-check adapter, moderator queue/review tool, provider erasure, RevenueCat native/server billing and opt-in Claude vibe reranking. See [provider setup and limitations](../production-integrations.md).

## Validation for this iteration

App: TypeScript, ESLint and 67 unit tests pass. Functions: TypeScript, ESLint, build and 127 unit tests pass. Firestore/Storage: 29 rules tests pass. Functions: 28 integration tests pass, including existing solo/Duo matching and safety behaviour. Android debug build succeeds and the Vibe-first/pricing/verification Maestro flow passes. Dark theme and 1.3 text scale were inspected on a cold-started Android emulator. Screenshots: `codex-artifacts/delhi-ncr-ui/`. Android and iOS simulator builds are verified. Live verification/payments, real-device acceptance and a comparison study against Bumble remain unvalidated. Current web/native QA details are in ../qa-2026-10-10.md.
