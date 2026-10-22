// Guides, part 2: profiles, conversations, dates and intentions.
const D = "2026-10-13";
const parent = { name: "Dating guides", path: "guides/" };

export const guidesB = [
  {
    path: "guides/first-date-ideas-india/", parent, crumb: "First-date ideas", published: D, updated: D, eyebrow: "GUIDE · FIRST DATES",
    title: "30 First-Date Ideas in India: Cheap, Fun and Safe",
    description: "Thirty first-date ideas that work in Indian cities: coffee and walks, street food trails, museums, comedy nights, bookshops, Garba nights and more, with tips on keeping a first date relaxed and safe.",
    h1: "30 first-date ideas <em>that actually work</em>",
    lede: "The best first date is short, public and gives you something to talk about. Here are ideas for every budget and mood, all easy to leave if it isn't clicking.",
    body: `
<h2>Easy and low-pressure</h2>
<ul><li>Coffee at a café you both like</li><li>A walk in a big city park (Lodhi Garden, Cubbon Park, Marine Drive)</li><li>Chai and a snack at a popular tapri</li><li>Ice cream or dessert crawl</li><li>Bookshop browsing, then coffee</li><li>Sunday morning flea or farmers' market</li></ul>
<h2>Something to do together</h2>
<ul><li>A museum or art gallery</li><li>A stand-up comedy show</li><li>Bowling or arcade games</li><li>A pottery, painting or cooking workshop</li><li>Board-game café</li><li>A short heritage walk</li><li>Live music at a café</li></ul>
<h2>Food lovers</h2>
<ul><li>A street-food trail in an old market</li><li>Trying a cuisine neither of you has had</li><li>A regional thali place</li><li>Late-night food streets (Manek Chowk, Mohammed Ali Road during Ramzan)</li></ul>
<h2>Outdoorsy (better for a second or third date)</h2>
<ul><li>Sunrise trek or hill drive</li><li>Cycling tour</li><li>Lake or riverfront walk</li><li>Birdwatching at a sanctuary in winter</li></ul>
<h2>Festive and seasonal</h2>
<ul><li>Garba or Dandiya during Navratri: try Paire's <a href="/garba-nights/">Garba Nights</a></li><li>Diwali melas and markets</li><li>Durga Puja pandal-hopping</li><li>Holi with friends (as a group date)</li><li>Winter food festivals</li></ul>
<h2>Cosy and creative</h2>
<ul><li>A double date with your best friend (try <a href="/features/">Duos</a>)</li><li>A film followed by dinner to talk about it</li><li>A planetarium show</li><li>A poetry or open-mic night</li></ul>
<h2>Keep it relaxed (and safe)</h2>
<ul><li>Plan an hour or two with an easy exit.</li><li>Choose busy places, get there on your own, and tell a friend.</li><li>Split the bill or take turns; there's no fixed rule.</li></ul>
<p>Ideas for your city: <a href="/dating/delhi/">Delhi</a>, <a href="/dating/mumbai/">Mumbai</a>, <a href="/dating/bengaluru/">Bengaluru</a> and <a href="/dating/">more</a>.</p>`,
    faq: [
      ["What is a good first date in India?", "Something short, public and easy to talk over: coffee and a walk, a museum, a comedy show or a street-food trail. Save long drives and treks for later dates."],
      ["Who should pay on a first date in India?", "There's no fixed rule. Many couples split the bill or take turns; agree on whatever feels comfortable."]
    ],
    related: ["dating/", "guides/dating-app-safety-tips-india/", "guides/first-message-examples/", "garba-nights/"]
  },
  {
    path: "guides/dating-profile-bio-examples/", parent, crumb: "Dating bio examples", published: D, updated: D, eyebrow: "GUIDE · PROFILES",
    title: "Dating Profile Bio Examples for India (for Men and Women) + Photo Tips",
    description: "Dating app bio examples that get real replies in India, for men and women: funny, sincere, short and specific. Plus what photos to use and the mistakes that cost you matches.",
    h1: "Dating bio examples <em>that get replies</em>",
    lede: "A good bio gives people something easy to reply to. Specific beats clever, and kind beats cool.",
    body: `
<h2>The formula</h2>
<p>One line about what you love, one specific detail, and one easy question or invitation. That's it.</p>
<h2>Examples</h2>
<ul>
<li>"Weekday product manager, weekend momo critic. Tell me the best plate you've had in Delhi and I'll tell you if you're right."</li>
<li>"I'll make you a playlist for any mood. Currently looking for someone to argue about old Bollywood songs with."</li>
<li>"Learning to cook my nani's rajma. Looking for a taste-tester with honest opinions."</li>
<li>"Early-morning runner, late-night reader. Ideal first date: chai, a walk, and a bookshop."</li>
<li>"Looking for something real. Bonus points if you can recommend a trek near Pune."</li>
<li>"New to Bengaluru. Show me your favourite café and I'll owe you dessert."</li>
<li>"Dog person married to my job (working on it). Let's talk about the last trip you loved."</li>
</ul>
<h2>Mistakes to avoid</h2>
<ul>
<li>Lists of what you <em>don't</em> want ("no time-pass", "no fake people").</li>
<li>Only your height, job and zodiac sign.</li>
<li>Copy-pasted quotes.</li>
<li>Your phone number or Instagram handle (keep it private until you trust someone).</li>
</ul>
<h2>Photos</h2>
<ul>
<li>First photo: a clear, recent photo of just you, smiling, face visible. Choose a photo that clearly represents you; a photo check, where available, compares against your profile photos.</li>
<li>Add a full-length photo, one doing something you love, and one with friends (make it clear which one is you).</li>
<li>Skip sunglasses in every photo, heavy filters and photos from years ago.</li>
</ul>
<p>Stuck? Paire AI can suggest a bio from your interests. Then edit it so it sounds like you.</p>`,
    faq: [
      ["What should I write in my dating bio?", "One thing you love, one specific detail about you, and an easy question or invitation someone can reply to."],
      ["What is a good dating bio for men in India?", "Be specific and warm: mention a real interest, something you're learning or a favourite place, and end with a question. Avoid lists of demands."]
    ],
    related: ["guides/first-message-examples/", "guides/first-date-ideas-india/", "features/", "verification/"]
  },
  {
    path: "guides/first-message-examples/", parent, crumb: "First message examples", published: D, updated: D, eyebrow: "GUIDE · CONVERSATIONS",
    title: "First Message Examples for Dating Apps (Better Than 'Hi')",
    description: "First message and like-note examples that start real conversations on dating apps in India, how to reply to a bio or photo, and what to avoid in an opener.",
    h1: "What to say <em>instead of \"hi\"</em>",
    lede: "\"Hi\" gives the other person nothing to work with. A good opener shows you looked at their profile and makes replying easy.",
    body: `
<h2>The simple rule</h2>
<p>Notice something specific, add a little of yourself, and ask one easy question. On Paire you can send this as a note with your like, so it's the first thing they see.</p>
<h2>Openers that work</h2>
<ul>
<li>"Your Ladakh photo has me jealous. Was it as cold as it looks?"</li>
<li>"Fellow momo critic here. Best place in your area, go."</li>
<li>"You said you're learning guitar. What's the first song you got right?"</li>
<li>"Okay, team chai or team coffee? This decides everything."</li>
<li>"Your bio says Sunday = long walks. Favourite walk in the city?"</li>
<li>"I also re-read Harry Potter every year. Which book is the best and why is it Azkaban?"</li>
</ul>
<h2>What to avoid</h2>
<ul>
<li>Comments only about looks, especially in the first message.</li>
<li>Copy-paste lines sent to everyone.</li>
<li>Asking for a number or Instagram straight away.</li>
<li>Anything sexual unless you're both clearly on the same page.</li>
</ul>
<h2>Keeping it going</h2>
<p>Answer their question, add something about you, and ask one back. After a good back-and-forth, suggest a short, public plan. Paire AI can suggest openers based on what you have in common if you're stuck.</p>`,
    faq: [
      ["What is a good first message on a dating app?", "Mention something specific from their profile, add a little about you, and ask one easy question, for example: 'Your Ladakh photo has me jealous. Was it as cold as it looks?'"],
      ["Should I send a note with a like?", "Yes. On Paire a like with a note shows you read their profile, and some people only accept likes with notes."]
    ],
    related: ["guides/dating-profile-bio-examples/", "guides/first-date-ideas-india/", "features/", "compare/hinge/"]
  },
  {
    path: "guides/dating-app-for-serious-relationships-india/", parent, crumb: "Serious relationships", published: D, updated: D, eyebrow: "GUIDE · INTENTIONS",
    title: "Dating Apps for Serious Relationships in India (No Biodata)",
    description: "How to use dating apps in India when you want a serious relationship or marriage: setting intentions, filtering for people who want the same, what to ask early, and how Paire compares with matrimony sites.",
    h1: "Looking for <em>something serious?</em>",
    lede: "Plenty of people on dating apps in India want a long-term partner or marriage, just without the biodata and family committee. Here's how to find them.",
    body: `
<h2>Say what you want</h2>
<p>Set your intention clearly (long-term, marriage-minded) and mention it in your bio. People who want the same thing will appreciate it, and people who don't will move on, which saves everyone time.</p>
<h2>Filter for it</h2>
<p>On Paire, turn on <strong>same intentions only</strong> to see only people looking for what you're looking for. Combine it with <em>speaks my language</em> if that matters to you.</p>
<h2>What to talk about early</h2>
<ul>
<li>Where each of you sees yourself living in a few years.</li>
<li>How you each think about family, work and children.</li>
<li>How involved your families would want to be.</li>
<li>Values that matter to you (and which don't).</li>
</ul>
<h2>Dating apps vs matrimony sites</h2>
<table><thead><tr><th></th><th>Dating app (e.g. Paire)</th><th>Matrimony site</th></tr></thead><tbody>
<tr><td>Who makes the profile</td><td>You</td><td>Often family</td></tr>
<tr><td>How you meet</td><td>Chat, then date at your pace</td><td>Families connect first</td></tr>
<tr><td>Filters</td><td>Intentions, languages, interests; no caste on Paire</td><td>Often community and caste</td></tr>
<tr><td>Pace</td><td>You decide</td><td>Often faster, with expectations</td></tr>
</tbody></table>
<p>Many people use both. If you'd rather meet someone on your own terms first, a dating app with clear intentions works well. Read <a href="/guides/dating-without-caste/">dating without caste filters</a>.</p>`,
    faq: [
      ["Can you find a serious relationship on a dating app in India?", "Yes. Set a clear intention, filter for people who want the same (on Paire, 'same intentions only'), and talk about the big things early."],
      ["Is Paire a matrimony app?", "No. Paire is a dating app for adults that covers everything from casual to marriage-minded dating. You create your own profile and meet at your own pace."]
    ],
    related: ["guides/dating-without-caste/", "guides/best-dating-apps-india/", "compare/hinge/", "features/"]
  },
  {
    path: "guides/dating-without-caste/", parent, crumb: "Dating without caste filters", published: D, updated: D, eyebrow: "GUIDE · VALUES",
    title: "Dating Without Caste Filters: Why Paire Has No Caste Field",
    description: "Why Paire doesn't ask for caste or let anyone filter by it, how religion is handled (optional, never used to rank), and tips for inter-caste and inter-faith couples talking to family.",
    h1: "Dating <em>without caste filters</em>",
    lede: "Paire has no caste field and no caste filter. You see people for who they are: their interests, values and what they're looking for.",
    body: `
<h2>Our choice</h2>
<p>Many matchmaking platforms ask for caste and let people filter by it. We decided not to. On Paire nobody can search, sort or rank people by caste, because we think connection should start with who someone is.</p>
<h2>What about religion and other basics?</h2>
<p>Religion, languages, diet, drinking and smoking are optional profile basics, useful context for people who care about them. Religion is never used to filter or rank anyone. Languages can be used with the <em>speaks my language</em> setting.</p>
<h2>If your family cares about caste</h2>
<ul>
<li>Talk about your values together early, before families get involved.</li>
<li>Agree as a couple on how and when to tell your families.</li>
<li>Focus on what families usually worry about: stability, respect and kindness.</li>
<li>Give people time; many families come around once they know the person.</li>
</ul>
<h2>Your safety comes first</h2>
<p>If you face threats or harassment over a relationship, contact the police on <strong>112</strong>. Don't share your exact location with people you don't trust.</p>`,
    faq: [
      ["Does Paire ask for caste?", "No. Paire has no caste field or caste filter, and religion (an optional profile detail) is never used to filter or rank people."],
      ["Is there a dating app in India without caste filters?", "Yes. Paire is a dating app for India with no caste field or filter."]
    ],
    related: ["guides/dating-app-for-serious-relationships-india/", "about/", "guides/best-dating-apps-india/", "features/"]
  }
];
