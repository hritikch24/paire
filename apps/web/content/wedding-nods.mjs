// Wedding Nods landing page. Claims here must match docs/marketing/wedding-nods-facts.md:
// no member counts, no "verified" or "safe" claims, no member identities.
const date = "2026-11-23";
export const weddingNods = [{
  path: "wedding/", crumb: "Wedding Nods", eyebrow: "WEDDING NODS", published: date, updated: date,
  title: "Wedding Nods — A Secret Nod at the Wedding | Paire",
  description: "Going to the same wedding as someone you'd like to know? Give a secret nod on Paire. If they nod back, you match. If not, nobody ever knows. 18+, self-declared, private.",
  h1: "Shaadi mein ek <em>nod.</em>",
  lede: "Going to the same wedding as someone you'd like to know? Give a private nod. If they nod you back, you match. If they don't, nobody ever finds out. No group chat, no host, no family watching.",
  appPath: "app/?wedding=1", cta: "Going to a wedding? Add yours.",
  related: ["verification/", "pricing/"],
  summary: [
    "Open Paire, then Profile → Going to a wedding?. Add the bride's and groom's first names, the date and the venue's PIN code.",
    "You get an anonymous nickname and a short “spot me” clue. No photo, name, phone or location is shown to other guests.",
    "You have 3 secret nods per wedding. Only a nod that is returned becomes a match, and then it is a normal Paire chat.",
    "Attendance is self-declared. Paire doesn't verify who is at a wedding."
  ],
  body: `<h2>How a nod works</h2>
<ol>
<li><strong>Add your wedding.</strong> Type the bride's first name, the groom's first name, the wedding date and the venue's PIN code. Other guests who type the same details land in the same wedding automatically, even with a one-letter typo. Weddings are never listed or searchable: you only ever join one you typed yourself.</li>
<li><strong>Choose your spot.</strong> Pick the bride's side or the groom's side and write a short clue so someone could spot you, such as “navy sherwani near the stage”. You get a made-up nickname. Your clue can't include a name, phone number, handle, link or location.</li>
<li><strong>See the guests.</strong> Once enough guests have joined, you see anonymous cards: a nickname, a side, an age band and a clue. Your usual age and gender preferences, blocks and privacy choices apply. Until then you'll see “Guests are still joining”.</li>
<li><strong>Give a nod.</strong> You get 3 nods for each wedding. A nod is secret: the other person isn't told, and nobody can see who nodded them. If you both nod each other, Paire creates a match and you can chat as usual.</li>
</ol>
<h2>Private by design</h2>
<ul>
<li>Only adults aged 18 and over can use Paire, and members need to pass Paire's photo check, the same as for Discover.</li>
<li>Other guests never see your photo, name or phone number. A match reveals profiles in the normal way, only after you both nod.</li>
<li>Paire doesn't store your location for Wedding Nods.</li>
<li>You can report or block anyone from their card. Reporting also blocks.</li>
<li>A wedding closes 7 days after its date. Nods, nicknames and clues are then deleted. Matches that already happened stay.</li>
<li>An optional photo of the invitation can help Paire's safety team check a wedding is real. Other guests never see it, and it is deleted after 30 days.</li>
</ul>
<h2>What Wedding Nods is not</h2>
<p>It isn't a group chat, a public room or a guest list. Hosts and families can't see who joined. Paire doesn't verify that anyone is really at a wedding, and doesn't promise a match. As with any first meeting, meet in public and tell someone you trust where you are.</p>`,
  faq: [
    ["Does the bride, groom or family see that I joined?", "No. There is no host and no guest list. Nobody connected to the wedding is told that Wedding Nods exists unless a guest tells them."],
    ["Can anyone find my wedding by searching?", "No. Weddings can't be listed or searched. You only join a wedding by typing its details yourself, and guests who type the same details land together."],
    ["Does Paire verify that I'm a guest?", "No. Attendance is self-declared. Paire doesn't check invitations against a guest list. Members still need a confirmed email and Paire's photo check, and must be 18 or over."],
    ["What happens if I nod and they don't?", "Nothing visible. The other person is never told, and you aren't told either. Only a nod that is returned becomes a match."],
    ["How many nods do I get?", "Three for each wedding. A repeated nod to the same person doesn't use another one."],
    ["What does Paire store, and for how long?", "Your nickname, side, age band, clue and nods, until 7 days after the wedding, when they are deleted. An optional invitation photo is deleted after 30 days. Matches that happened stay, like any match. Deleting your account erases all of your wedding data."],
    ["Where is it in the app?", "Open Profile, then “Going to a wedding?”. It has its own corner and doesn't add anything to your Discover home screen."]
  ]
}];
