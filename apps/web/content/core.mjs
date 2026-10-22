// Core pages and section hubs. Facts here must match the product (see apps/web/site/llms.txt).
const D = "2026-10-13";

export const core = [
  {
    path: "about/", crumb: "About Paire", published: D, updated: D, eyebrow: "ABOUT PAIRE",
    title: "About Paire — An Indian Dating App Where Women Set the Rules",
    description: "Meet adult singles across India on Paire. Likes can carry notes, women have free privacy controls, and optional Plus passes reveal who likes you.",
    h1: "About <em>Paire</em>",
    lede: "Paire is a dating app made in India for adult men and women: from a first coffee to a long-term partner. We built it because dating here deserved better than endless swiping, fake profiles and paywalls.",
    summary: [
      "Built in India, open across the country, 18+ only, for men and women.",
      "Every like can carry a note, so matches start with a real conversation.",
      "Women control who can reach them; Paire Plus reveals who likes you.",
      "Members confirm their email before liking or chatting. Photo-check status is shown separately when available.",
      "No caste field or filter. Paire Plus is optional, from ₹29, and never auto-renews."
    ],
    body: `
<h2>Why Paire exists</h2>
<p>Ask anyone in India who has used a dating app and you hear the same things: women are flooded with low-effort likes, men rarely get a reply, profiles are fake or years out of date, and the features that matter sit behind a monthly subscription that renews quietly. Many people also worry about family finding their profile, or about apps that sort people by caste.</p>
<p>Paire is our answer. It is designed around a few simple ideas:</p>
<ul>
<li><strong>A like should mean something.</strong> Every like can carry a short note, and everyone gets a free daily allowance of likes, so each one is considered rather than sprayed.</li>
<li><strong>Women set the rules.</strong> Women can accept only likes that come with a note, choose to send the first message, browse in incognito, and keep photos private until they match. These controls are free.</li>
<li><strong>Clearer trust signals.</strong> Confirmed email is required before liking or chatting. A current photo badge indicates a separate completed photo check; it does not verify employment or intentions.</li>
<li><strong>Fair pricing.</strong> Your likes count is free. Paire Plus reveals the profiles behind it. Paire Plus is a short pass (from ₹5 a day with the month offer: ₹299 for 2 months; or ₹29 a day, ₹99 a week) that ends on its own. Men and women pay the same.</li>
<li><strong>Respect.</strong> There is no caste field or filter, religion is never used to rank anyone, and paid arrangements are banned.</li>
</ul>
<h2>Who Paire is for</h2>
<p>Paire is for adult men and women in India looking for anything from casual dating to marriage-minded relationships. You say what you are looking for, and you can choose to see only people who want the same thing. Paire is open to members in every city and town across India.</p>
<h2>How Paire works</h2>
<p>You sign up with Google or email, confirm your email, and add a profile and interests. Photo checks are shown separately when available. Then you can browse people as photo cards, try <a href="/features/">Vibe First</a> to see interests before photos, team up with a best friend for a double date with <a href="/features/">Duos</a>, or join seasonal editions such as <a href="/garba-nights/">Garba Nights</a> during Navratri. Paire runs in any phone or laptop browser at <a href="/app/">paire.in/app</a>; an Android app is on the way.</p>
<h2>Safety and privacy</h2>
<p>Every chat has report and block. Paire AI warns you about common scam messages, such as requests for money, OTPs or investment tips. Your exact location is never shown, only an approximate distance. Read more in <a href="/verification/">how verification works</a> and our <a href="/safety/">dating safety guide</a>.</p>
<h2>Contact</h2>
<p>Questions, press or partnerships: see our <a href="/contact/">contact page</a>.</p>`,
    faq: [
      ["Is Paire an Indian app?", "Yes. Paire is built in India, open across the country, and designed for how people date in India: notes with every like, women-first controls, no caste filters and prices in rupees."],
      ["Is Paire free?", "Joining, 10 likes a day, matching, an anonymous likes count, reading messages and every privacy and safety control are free. Sending messages needs Paire Plus (passes from ₹29 that never auto-renew) or a one-time ₹49 Unlimited Chat unlock."],
      ["Is Paire only for serious relationships?", "No. Paire covers everything from casual dating to marriage-minded relationships. You set your intention and can choose to see only people who want the same."]
    ],
    related: ["features/", "verification/", "pricing/", "guides/best-dating-apps-india/"]
  },
  {
    path: "pricing/", crumb: "Pricing", published: D, updated: D, eyebrow: "PRICING",
    title: "Paire Pricing — Free Dating App, Plus Passes from ₹29 (No Auto-Renew)",
    description: "Paire is free to join and match: 10 likes a day, an anonymous likes count, read your messages. To send messages, get Paire Plus (from ₹5 a day: ₹299 for 60 days with the buy 1 month, get 1 free offer; or ₹29 a day, ₹99 a week) or Unlimited Chat for ₹49 once. Nothing auto-renews, and men and women pay the same.",
    h1: "Free first. <em>Fair always.</em>",
    lede: "Joining, matching and safety on Paire are free. To send messages, choose a short Paire Plus pass or a one-time ₹49 Unlimited Chat unlock. Both end or stay on their own terms: nothing to cancel, no surprise renewals.",
    summary: [
      "Free forever: 10 likes a day (each with a note), 1 Super Like a day, an anonymous likes count, mutual matching, reading every message you receive, every privacy and safety control.",
      "Sending messages: your own Paire Plus pass, or Unlimited Chat for ₹49 once (all current and future matches, no expiry). Each person needs their own access to send.",
      "Paire Plus: ₹299 for 60 days (buy 1 month, get 1 month free: ₹5 a day), ₹99 for 7 days, ₹29 for 24 hours.",
      "Plus reveals who likes you and adds unlimited messaging while it runs, 100 likes and 5 Super Likes a day, priority likes and the age-gap filter.",
      "Passes never auto-renew. Men and women pay the same. Pay by UPI, card or netbanking."
    ],
    body: `
<h2>What's free</h2>
<table><thead><tr><th>Feature</th><th>Free</th><th>Paire Plus</th></tr></thead><tbody>
<tr><td>Likes per day (each can carry a note)</td><td>10</td><td>100</td></tr>
<tr><td>Super Likes per day</td><td>1</td><td>5</td></tr>
<tr><td>See who likes you</td><td>Anonymous preview</td><td>Full profiles</td></tr>
<tr><td>Read the messages you receive</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Send messages</td><td>With Unlimited Chat (₹49 once)</td><td>Included</td></tr>
<tr><td>Women-first controls (notes-only likes, I'll message first, incognito, private photos)</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Vibe First, Duos, Garba Nights</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Selfie verification and safety tools</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Priority likes (shown first in "Likes you")</td><td>No</td><td>Yes</td></tr>
<tr><td>Age-gap filter</td><td>No</td><td>Yes</td></tr>
</tbody></table>
<h2>Paire Plus passes</h2>
<ul>
<li><strong>Best value: ₹299 for 60 days</strong>: buy 1 month, get 1 month free. Just ₹5 a day, about 83% less per day than buying day passes.</li>
<li><strong>₹99 for 7 days</strong>: about ₹14 a day.</li>
<li><strong>₹29 for 24 hours</strong>: try Plus for a day, for example on a weekend.</li>
</ul>
<p>Passes are paid once using the methods available at checkout. They do not renew: when the time is up, your account simply goes back to free. Buying a new pass before the old one ends adds the time on.</p>
<h2>Unlimited Chat: ₹49 once</h2>
<p>Only want to chat? Unlimited Chat is a one-time ₹49 payment that lets you send messages in all your current and future mutual matches. It has no expiry, no renewal and no per-match charge, and it stays with your account on every device. It covers messaging only, not Plus's extra likes or filters. Each person needs their own access to send: you can message someone who hasn't paid, and they can read it, but they need Plus or their own unlock to reply. It's offered once you have your first mutual match, and you start payment inside the app using the methods shown at checkout.</p>
<h2>Why we price it this way</h2>
<p>Many dating apps charge a monthly subscription to see who likes you and renew it automatically. Your anonymous likes preview is free. Plus reveals the profiles behind those likes and adds reach and messaging, Unlimited Chat adds messaging only, and safety is never for sale: reporting, blocking and unmatching are always free. Paying never guarantees a match or a reply. See our <a href="/refunds/">refund and cancellation policy</a> for details.</p>`,
    faq: [
      ["How much does Paire cost?", "Joining and matching are free. To send messages, get a Paire Plus pass (₹299 for 60 days with the buy 1 month, get 1 free offer, ₹99 for 7 days or ₹29 for 24 hours) or Unlimited Chat for ₹49 once."],
      ["Is Unlimited Chat per match?", "No. One ₹49 payment covers all your current and future mutual matches, with no expiry. It belongs to your account only, and the other person needs their own access to reply."],
      ["Does Paire Plus renew automatically?", "No. Every Paire Plus pass is a one-time payment that ends by itself. There is nothing to cancel."],
      ["Do women and men pay differently?", "No. Paire Plus costs the same for everyone, and all safety and privacy features are free for everyone."],
      ["Can I see who likes me for free on Paire?", "Free members see an anonymous likes count. Paire Plus reveals the profiles and notes, including likes from outside your search filters."]
    ],
    related: ["features/", "compare/tinder/", "compare/bumble/", "about/"]
  },
  {
    path: "features/", crumb: "Features", published: D, updated: D, eyebrow: "FEATURES",
    title: "Paire Features — Notes With Likes, Women-First Controls, Vibe First & Duos",
    description: "Everything Paire does: likes with notes, 'who likes you' with Plus, women-first privacy controls, Vibe First, Duos double dates, blind date mode, Paire AI icebreakers and selfie verification.",
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
<li><strong>Seasonal editions</strong> such as <a href="/garba-nights/">Garba Nights</a> during Navratri.</li>
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
    path: "verification/", crumb: "How verification works", published: D, updated: "2026-10-23", eyebrow: "SAFETY · TRUST SIGNALS",
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
    description: "Practical dating guides for India: the best dating apps, staying safe, spotting fake profiles and scams, writing a bio, first messages, first dates and dating with serious intentions.",
    h1: "Dating <em>guides</em>",
    lede: "Honest, practical advice for dating in India, from choosing an app to your first date. Written by the Paire team and kept up to date."
  },
  {
    path: "dating/", crumb: "Dating in your city", type: "hub", eyebrow: "CITIES",
    title: "Dating in Indian Cities: Date Ideas & Safe Places | Paire",
    description: "Dating in Delhi, Gurugram, Noida, Mumbai, Bengaluru, Pune, Hyderabad, Chennai, Kolkata, Ahmedabad and Jaipur: first-date ideas, safe public places and how to meet people on Paire.",
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
