// Core pages and section hubs. Facts here must match the product (see apps/web/site/llms.txt).
const D = "2026-10-13";

export const core = [
  {
    path: "about/", crumb: "About Paire", published: D, updated: "2026-10-24", eyebrow: "ABOUT PAIRE",
    title: "About Paire — An Indian Dating App Where Women Set the Rules",
    description: "Meet adult singles across India on Paire. Likes can carry notes, women have free privacy controls, and optional Plus passes reveal who likes you.",
    h1: "About <em>Paire</em>",
    lede: "Paire is a dating app made in India for adult men and women: from a first coffee to a long-term partner. We built it because dating here deserved better than endless swiping, fake profiles and paywalls.",
    summary: [
      "Built in India, open across the country, 18+ only, for men and women.",
      "Every like can carry a note, so matches start with a real conversation.",
      "Women control who can reach them; Paire Plus reveals who likes you.",
      "Members confirm their email before liking or chatting. Photo-check status is shown separately when available.",
      "No caste field or filter. Paire Plus is optional, from ₹59, and never auto-renews."
    ],
    body: `
<h2>Why Paire exists</h2>
<p>Ask anyone in India who has used a dating app and you hear the same things: women are flooded with low-effort likes, men rarely get a reply, profiles are fake or years out of date, and the features that matter sit behind a monthly subscription that renews quietly. Many people also worry about family finding their profile, or about apps that sort people by caste.</p>
<p>Paire is our answer. It is designed around a few simple ideas:</p>
<ul>
<li><strong>A like should mean something.</strong> Every like can carry a short note, and everyone gets a free daily allowance of likes, so each one is considered rather than sprayed.</li>
<li><strong>Women set the rules.</strong> Women can accept only likes that come with a note, choose to send the first message, browse in incognito, and keep photos private until they match. These controls are free.</li>
<li><strong>Clearer trust signals.</strong> Confirmed email is required before liking or chatting. A current photo badge indicates a separate completed photo check; it does not verify employment or intentions.</li>
<li><strong>Fair pricing.</strong> Your likes count is free. Paire Plus reveals the profiles behind it. Paire Plus offers fixed-duration passes (₹349 for 30 days with unlimited likes, ₹179 a week or ₹59 a day), or Lifetime Plus for ₹3,699 once with no expiry. A six-month pass is ₹1,249 for 180 days. Men and women pay the same.</li>
<li><strong>Respect.</strong> There is no caste field or filter, religion is never used to rank anyone, and paid arrangements are banned.</li>
</ul>
<h2>Who Paire is for</h2>
<p>Paire is for adult men and women in India looking for anything from casual dating to marriage-minded relationships. You say what you are looking for, and you can choose to see only people who want the same thing. Paire is open to members in every city and town across India.</p>
<h2>How Paire works</h2>
<p>You sign up with Google or email, confirm your email, and add a profile and interests. Photo checks are shown separately when available. Then you can browse people as photo cards, try <a href="/features/">Vibe First</a> to see interests before photos, team up with a best friend for a double date with <a href="/features/">Duos</a>, or join an occasional seasonal edition, like <a href="/diwali-together/">Diwali Together</a> in 2026. Paire runs in any phone or laptop browser at <a href="/app/">paire.in/app</a>; an Android app is on the way.</p>
<h2>Safety and privacy</h2>
<p>Every chat has report and block. Paire AI warns you about common scam messages, such as requests for money, OTPs or investment tips. Your exact location is never shown, only an approximate distance. Read more in <a href="/verification/">how verification works</a> and our <a href="/safety/">dating safety guide</a>.</p>
<h2>Contact</h2>
<p>Questions, press or partnerships: see our <a href="/contact/">contact page</a>.</p>`,
    faq: [
      ["Is Paire an Indian app?", "Yes. Paire is built in India, open across the country, and designed for how people date in India: notes with every like, women-first controls, no caste filters and prices in rupees."],
      ["Is Paire free?", "Joining, 10 likes a day, matching, an anonymous likes count, reading messages and every privacy and safety control are free. Sending messages needs Paire Plus (passes from ₹59 that never auto-renew) or a one-time ₹79 Unlimited Chat unlock."],
      ["Is Paire only for serious relationships?", "No. Paire covers everything from casual dating to marriage-minded relationships. You set your intention and can choose to see only people who want the same."]
    ],
    related: ["features/", "verification/", "pricing/", "guides/best-dating-apps-india/"]
  },
  {
    path: "pricing/", crumb: "Pricing", published: D, updated: "2026-11-06", eyebrow: "PRICING",
    title: "Paire Plus and Unlimited Chat pricing",
    description: "Compare fixed tax-inclusive prices and durations for Paire Plus and Unlimited Chat. All purchases are one-time payments.",
    h1: "Choose your pass",
    lede: "Joining, matching, reading messages and using safety controls are free. Each sender needs their own Plus pass or Unlimited Chat.",
    summary: ["Day Plus ₹59 for 24 hours. Week Plus ₹179 for 7 days. Monthly Plus ₹349 for 30 days.", "Six-month Plus ₹1,249 for 180 days. Annual Plus ₹1,799 for 365 days. Lifetime Plus ₹3,699 once while Plus operates on your account.", "Unlimited Chat ₹79 once for sending in all eligible mutual matches. Every total includes applicable taxes. All genders pay the same."],
    body: `<h2>What Plus includes</h2><p>Day and week passes include 100 regular likes a day. Longer plans include unlimited regular likes. All Plus plans include 5 Super Likes daily, liker reveals, priority likes, the age-gap filter and messaging with eligible mutual matches.</p><h2>Messaging only</h2><p>Unlimited Chat covers your current and future mutual matches. Both members need their own access to send. Reading, blocking, reporting and unmatching are free.</p><p>Each purchase is paid once. Finite passes end automatically. Existing purchases keep their original durations. See the <a href="/terms/">terms</a> and <a href="/refunds/">refund policy</a>.</p>`,
    related: ["features/", "compare/tinder/", "compare/bumble/", "about/"]
  },
  {
    path: "features/", crumb: "Features", published: D, updated: "2026-10-24", eyebrow: "FEATURES",
    title: "Paire Features — Notes, Privacy, Vibe First & Duos",
    description: "Explore Paire's likes with notes, Plus likes reveal, free privacy controls, Vibe First, Duos and photo-check badges. Dating for adults across India.",
    h1: "Everything <em>Paire</em> does",
    lede: "Paire is built around conversations that start well and people who are who they say they are. Here is every feature, and what it costs (mostly nothing).",
    body: `
<h2>Likes with notes (Sparks)</h2>
<p>Every like on Paire can carry a short note, so the other person sees why you liked them. Notes are screened for abuse before they are delivered. Everyone gets 10 likes and 1 Super Like a day for free, which keeps likes considered.</p>
<h2>Someone liked you. Reveal who with Plus.</h2>
<p>Your "Likes you" list shows an anonymous count for free. Paire Plus reveals pending liker profiles and their notes, including people outside your search filters. Blocks and privacy controls still apply.</p>
<h2>Women-first controls</h2>
<ul>
<li><strong>Notes-only likes:</strong> only receive likes that come with a note.</li>
<li><strong>I'll message first:</strong> after a match, only you can start the chat.</li>
<li><strong>Incognito:</strong> only people you like can see your profile.</li>
<li><strong>Private photos:</strong> your photos stay hidden until you match.</li>
<li><strong>Same intentions only:</strong> see only people looking for what you want, from casual to marriage-minded.</li>
<li><strong>Speaks my language:</strong> see people who share a language with you.</li>
</ul>
<p>All of these are free, and anyone can use them.</p>
<h2>Discovery modes</h2>
<ul>
<li><strong>People:</strong> classic photo cards with interests, prompts and a reason you might click.</li>
<li><strong>Vibe First:</strong> see someone's interests, intentions and answers before their photos, then reveal the photos.</li>
<li><strong>Duos:</strong> team up with a best friend and match with another pair for a double date.</li>
<li><strong>Blind date mode</strong> for people who would rather chat first.</li>
<li><strong>Seasonal editions</strong> such as <a href="/diwali-together/">Diwali Together</a> (24 October to 10 November 2026), which is voluntary and never organises events.</li>
</ul>
<h2>Paire AI</h2>
<p>Paire AI suggests icebreakers based on what you have in common, helps you write a bio, and can rank profiles by shared vibes if you turn on AI matching (opt-in, using only the profile choices you select). It also warns you about scam-style messages in chat.</p>
<h2>Real people, checked</h2>
<p>Members confirm their email; known disposable inboxes are blocked. Photo verification is a separate check and is not required for every profile. Read <a href="/verification/">how verification works</a>.</p>
<h2>India-specific details</h2>
<p>Optional basics include height, languages, education, diet, drinking, smoking and religion. Religion is never used to filter or rank, and there is no caste field. Your exact location is never shown.</p>
<h2>Paire Plus</h2>
<p>An optional pass with more likes and Super Likes, priority likes and the age-gap filter. See <a href="/pricing/">pricing</a>.</p>`,
    faq: [
      ["What is Vibe First on Paire?", "Vibe First shows a person's interests, intentions and answers before their photos, so you can decide on personality first and reveal photos when you're ready."],
      ["What are Duos on Paire?", "Duos let you team up with a best friend and match with another pair of friends for a double date. You chat as a group of four."],
      ["Can women message first on Paire?", "Women can turn on \"I'll message first\" so that, after a match, only they can start the conversation."]
    ],
    related: ["verification/", "pricing/", "guides/dating-apps-for-women-india/", "guides/first-message-examples/"]
  },
  {
    path: "verification/", crumb: "How verification works", published: D, updated: "2026-10-24", eyebrow: "SAFETY · TRUST SIGNALS",
    title: "Paire Verification — Confirmed Email, Photo Checks & Work Badges",
    description: "Understand Paire's trust signals: confirmed email, separate photo-check badges, and self-declared work sectors. Photo verification is not required for every profile.",
    h1: "Know what a <em>badge means.</em>",
    lede: "Clear trust signals are better than assumptions. Email confirmation, photo checks and a work-sector badge each mean different things.",
    summary: ["Confirmed email is required before members can like or chat; known disposable inboxes are blocked.", "Photo verification is a separate check. It is not currently required for every profile.", "A current photo badge reflects a completed check tied to the profile's photos and can expire or be invalidated when photos change.", "Work-sector badges are optional self-declarations, not employment or qualification checks."],
    body: `<h2>1. Confirmed email</h2><p>Members confirm an email address before creating their profile and using likes or chat. Google sign-in supplies a confirmed email. This confirms access to an inbox; it does not prove a person's identity, age, intentions or employment.</p><h2>2. Photo checks</h2><p>Where a photo-check flow is available, follow the in-app instructions and consent information. A current photo badge indicates a completed check tied to that profile's photos. Changing photos can invalidate the badge, and results can expire. Check the current status on the profile rather than assuming all members have completed a photo check.</p><p>Photo verification is not currently required for every profile. No automated or human photo check is foolproof, and a badge does not guarantee someone's intentions, age or professional credentials. See our <a href="/privacy/">privacy policy</a> for the data used by the available verification flows.</p><h2>3. Work-sector badges</h2><p>Work Circles badges say “Self-declared”. Members choose their own sector and can change or remove it. Paire does not verify an employer, professional registration or job title through this badge. A healthcare, banking or government badge does not establish any professional qualification or official affiliation.</p><h2>Your controls always matter</h2><p>Use notes-only likes, incognito or private photos if they suit you. Report and block suspicious accounts. Keep chats on Paire until you're comfortable, meet in a public place and tell someone you trust about your plan. Read our <a href="/safety/">safety guide</a>.</p>`,
    faq: [["Are all Paire profiles photo verified?", "No. Confirmed email is required, but photo verification is not currently required for every profile. Look for a current photo-check badge on the individual profile."], ["Does a work badge verify employment?", "No. Work-sector badges are optional self-declarations. They do not verify an employer, professional qualification or government affiliation."], ["Does verification guarantee a safe date?", "No. No badge guarantees identity, intentions or safety. Use the app's privacy controls, report suspicious behavior and choose a public meeting place."]],
    related: ["guides/how-to-spot-fake-dating-profiles/", "guides/dating-scams-india/", "guides/dating-app-safety-tips-india/", "features/"]
  },
  {
    path: "guides/", crumb: "Dating guides", type: "hub", eyebrow: "GUIDES",
    title: "Dating Guides for India: Safety, Profiles & First Dates | Paire",
    description: "Practical dating guides for India: compare apps, spot scams, write a profile, start conversations and plan public first dates with clear intentions.",
    h1: "Dating <em>guides</em>",
    lede: "Honest, practical advice for dating in India, from choosing an app to your first date. Written by the Paire team and kept up to date."
  },
  {
    path: "dating/", crumb: "Dating in your city", type: "hub", eyebrow: "CITIES",
    title: "Dating in Indian Cities: Date Ideas & Safe Places | Paire",
    description: "Find public first-date ideas, local travel tips and dating advice for Delhi, Mumbai, Bengaluru and more Indian cities. Explore Paire's city guides.",
    h1: "Dating in <em>your city</em>",
    lede: "First-date ideas, safe places to meet and local tips for India's biggest cities. Paire is open across India."
  },
  {
    path: "compare/", crumb: "Paire vs other apps", type: "hub", eyebrow: "COMPARE",
    title: "Paire vs Tinder, Bumble & Hinge: Which Dating App Suits You?",
    description: "How Paire compares with Tinder, Bumble and Hinge in India: who likes you, pricing, women-first controls, verification and what each app is best for.",
    h1: "Paire vs <em>other apps</em>",
    lede: "Every dating app is good at something. Here is an honest look at how Paire differs from the big global apps, so you can pick what suits you (or use more than one)."
  }
];
