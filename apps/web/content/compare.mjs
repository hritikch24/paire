// Comparisons. Only state well-known, stable facts about other apps and say when they were checked.
const D = "2026-10-13";
const parent = { name: "Paire vs other apps", path: "compare/" };
const NOTE = `<p class="article-note">Other apps change their features and prices often. What we say about them reflects their publicly described features as of October 2026; check each app for the latest. Tinder, Bumble and Hinge are trademarks of their owners; Paire isn't affiliated with them.</p>`;

const paireColumn = {
  likes: "Anonymous preview free; identities with Paire Plus",
  notes: "Every like can carry a note",
  women: "Notes-only likes, I'll message first, incognito, private photos: all free",
  verify: "Email + live selfie check required for everyone before liking or chatting",
  price: "Free; Plus passes from ₹5/day (₹299 for 2 months), ₹99/week, ₹29/day, never auto-renew",
  india: "Built in India: no caste field, prices in rupees, Garba Nights, Duos"
};

export const compare = [
  {
    path: "compare/tinder/", parent, crumb: "Paire vs Tinder", published: D, updated: D, eyebrow: "COMPARE · TINDER",
    title: "Paire vs Tinder in India — A Tinder Alternative With Notes and Short Plus Passes",
    description: "Looking for a Tinder alternative in India? Paire Plus reveals who likes you, adds a note to every like, verifies every member with a live selfie, and its passes never auto-renew.",
    h1: "Paire vs <em>Tinder</em>",
    lede: "Tinder is the world's best-known dating app and has a huge user base in India. Paire is smaller and newer, built for people who want fewer, better matches and more control.",
    summary: [
      "On Tinder, seeing who already likes you is part of paid tiers (Gold and above); on Paire it comes with a fixed-duration Plus pass.",
      "Paire likes can carry a note, so matches start with a reason, not just a swipe.",
      "Every Paire member passes a live selfie check before they can like or chat.",
      "Paire Plus passes are one-time payments from ₹29 that never auto-renew."
    ],
    body: `
<h2>Side by side</h2>
<table><thead><tr><th></th><th>Paire</th><th>Tinder</th></tr></thead><tbody>
<tr><td>See who likes you</td><td>${paireColumn.likes}</td><td>Paid feature (Tinder Gold and higher tiers)</td></tr>
<tr><td>Starting a conversation</td><td>${paireColumn.notes}</td><td>Swipe right; messages after a match (paid tiers add extras)</td></tr>
<tr><td>Controls for women</td><td>${paireColumn.women}</td><td>Standard privacy settings for everyone</td></tr>
<tr><td>Verification</td><td>${paireColumn.verify}</td><td>Optional photo verification badge</td></tr>
<tr><td>Pricing</td><td>${paireColumn.price}</td><td>Free with ads/limits; subscriptions (Plus, Gold, Platinum) that renew until cancelled</td></tr>
<tr><td>Size</td><td>New, growing across India</td><td>Very large, worldwide</td></tr>
</tbody></table>
<h2>When Tinder makes sense</h2>
<p>If you want the biggest possible pool of people, or you travel a lot, Tinder's size is hard to beat. Plenty of people use it alongside other apps.</p>
<h2>When Paire makes sense</h2>
<ul>
<li>You're tired of matches that never turn into conversations: on Paire, likes come with notes.</li>
<li>You want short, fixed-duration Plus passes to reveal your likes.</li>
<li>You want everyone you meet to have passed a live selfie check.</li>
<li>You'd rather pay ₹29 for a day of extra reach than sign up for a subscription.</li>
<li>You're a woman who wants to filter out low-effort likes or message first.</li>
</ul>
${NOTE}`,
    faq: [
      ["Is Paire better than Tinder?", "It depends on what you want. Tinder is much bigger. Paire is built for fewer, better conversations: likes come with notes, seeing who likes you comes with Paire Plus, and every member passes a live selfie check."],
      ["What is a good Tinder alternative in India?", "Paire is an Indian Tinder alternative where seeing who likes you comes with Paire Plus, every like can carry a note, women set the rules and every member is selfie-verified."],
      ["Can I use Paire and Tinder at the same time?", "Yes. Many people use more than one app."]
    ],
    related: ["compare/bumble/", "compare/hinge/", "guides/best-dating-apps-india/", "pricing/"]
  },
  {
    path: "compare/bumble/", parent, crumb: "Paire vs Bumble", published: D, updated: D, eyebrow: "COMPARE · BUMBLE",
    title: "Paire vs Bumble in India — Women-First Dating, Compared",
    description: "Paire vs Bumble: both put women in control. On Paire, seeing who likes you comes with Paire Plus, likes carry notes, women choose whether to message first, and every member passes a live selfie check.",
    h1: "Paire vs <em>Bumble</em>",
    lede: "Bumble made \"women make the first move\" famous. Paire shares that spirit but makes it a choice, and adds controls that work before a match, not just after.",
    summary: [
      "Bumble is known for women making the first move; on Paire, women can turn on \"I'll message first\" if they want it.",
      "Paire adds notes-only likes, incognito and private-until-match photos, all free.",
      "Bumble's \"see who liked you\" list (Beeline) is a paid feature; Paire Plus also reveals pending likes with a fixed-duration pass.",
      "Paire's Plus passes never auto-renew and cost the same for everyone."
    ],
    body: `
<h2>Side by side</h2>
<table><thead><tr><th></th><th>Paire</th><th>Bumble</th></tr></thead><tbody>
<tr><td>Who messages first</td><td>Either person, unless a woman turns on "I'll message first"</td><td>Women make the first move in women–men matches</td></tr>
<tr><td>Before a match</td><td>Notes-only likes, incognito, private photos until match</td><td>Standard profile visibility settings</td></tr>
<tr><td>See who likes you</td><td>${paireColumn.likes}</td><td>Paid feature (Beeline, with Premium)</td></tr>
<tr><td>Verification</td><td>${paireColumn.verify}</td><td>Photo verification available</td></tr>
<tr><td>Pricing</td><td>${paireColumn.price}</td><td>Free tier plus subscriptions that renew until cancelled</td></tr>
<tr><td>Made for India</td><td>${paireColumn.india}</td><td>Global app available in India</td></tr>
</tbody></table>
<h2>Why women choose Paire</h2>
<p>Most of the stress women describe happens before a match: hundreds of likes with nothing behind them. On Paire you can accept only likes that come with a note, browse without being seen, and keep your photos private until you match. After a match, you decide whether you want to send the first message.</p>
<h2>Why men choose Paire</h2>
<p>Because likes are limited and come with a note, a thoughtful like stands out. And seeing who likes you comes with Paire Plus, with a free anonymous preview before you choose a pass.</p>
${NOTE}`,
    faq: [
      ["Is Paire like Bumble?", "Both put women in control. Paire makes messaging first optional for women and adds controls before a match: notes-only likes, incognito and private photos. Paire Plus reveals who likes you."],
      ["Do women have to message first on Paire?", "No. Women can choose \"I'll message first\" if they want that; otherwise either person can start."],
      ["Is Paire safe for women?", "Paire requires every member to confirm their email and pass a live selfie check, offers free women-first privacy controls, and has report, block and scam warnings in every chat."]
    ],
    related: ["compare/tinder/", "compare/hinge/", "guides/dating-apps-for-women-india/", "verification/"]
  },
  {
    path: "compare/hinge/", parent, crumb: "Paire vs Hinge", published: D, updated: D, eyebrow: "COMPARE · HINGE",
    title: "Paire vs Hinge in India — Comment-Style Likes, Compared",
    description: "Hinge lets you like a specific photo or prompt with a comment; Paire lets every like carry a note too. Here's how they differ on pricing, women-first controls, verification and India-specific features.",
    h1: "Paire vs <em>Hinge</em>",
    lede: "Hinge popularised liking a specific part of a profile with a comment. Paire shares the belief that a like should say something, and builds on it for India.",
    summary: [
      "Both let a like come with words: Hinge with comments on prompts and photos, Paire with notes.",
      "Paire adds free women-first controls before a match and an optional \"I'll message first\".",
      "Every Paire member passes a live selfie check before liking or chatting.",
      "Paire is built for India: no caste field, rupee pricing with no auto-renewal, Duos and Garba Nights."
    ],
    body: `
<h2>Side by side</h2>
<table><thead><tr><th></th><th>Paire</th><th>Hinge</th></tr></thead><tbody>
<tr><td>Likes</td><td>${paireColumn.notes}; 10 a day free</td><td>Like a photo or prompt, optionally with a comment; limited free likes per day</td></tr>
<tr><td>Who likes you</td><td>${paireColumn.likes}, all at once</td><td>Free members see likes one at a time; seeing all at once is part of paid tiers</td></tr>
<tr><td>Controls for women</td><td>${paireColumn.women}</td><td>Standard settings for everyone</td></tr>
<tr><td>Verification</td><td>${paireColumn.verify}</td><td>Selfie verification available</td></tr>
<tr><td>Pricing</td><td>${paireColumn.price}</td><td>Subscriptions (Hinge+, HingeX) that renew until cancelled</td></tr>
</tbody></table>
<h2>Which to choose</h2>
<p>If you enjoy prompt-led profiles and want a large international pool, Hinge is a good app. If you want the same thoughtfulness with Plus passes to reveal who likes you, controls that protect women before a match, mandatory verification and features made for India, try Paire. You can use both.</p>
${NOTE}`,
    faq: [
      ["Is Paire similar to Hinge?", "Yes, in spirit: on both, a like can say something. Paire adds Plus passes to reveal who likes you, women-first controls, mandatory selfie verification and India-specific features."],
      ["Is Paire for serious relationships like Hinge?", "Paire covers casual to marriage-minded dating. Turn on \"same intentions only\" to see people who want the same thing as you."]
    ],
    related: ["compare/tinder/", "compare/bumble/", "guides/dating-app-for-serious-relationships-india/", "features/"]
  }
];
