const sectors = [
  ["corporate", "Corporate & tech", "Find a connection beyond the meeting calendar."],
  ["government", "Government & public service", "Meet someone who understands public-service life."],
  ["banking", "Banking & finance", "Find more than numbers in common."],
  ["healthcare", "Healthcare & hospitals", "Meet someone who understands life around shifts."],
  ["education", "Education & research", "Make room for connection beyond the classroom."],
  ["business", "Founders & business", "Build a connection beyond the business plan."],
  ["creative", "Creative & media", "Find someone to share your next story with."],
  ["legal", "Law & legal", "Find a conversation beyond the case."],
  ["hospitality", "Hospitality & travel", "Meet someone for your next day off."],
  ["engineering", "Engineering & operations", "Find a connection outside the blueprint."],
  ["other", "Other paths", "Different paths. A chance to connect."]
];
const date = "2026-10-22";
const common = {
  published: date, updated: date, eyebrow: "WORK CIRCLES", related: ["circles/", "verification/", "pricing/"],
  faq: [
    ["Are work badges verified?", "No. Work sectors are optional public self-declarations. Paire does not verify employment, employer affiliation or professional qualifications. Email and photo checks do not verify someone's occupation."],
    ["Can I explore a different sector?", "Yes. You can explore any Work Circle without joining it or adding a badge. The badge describes your own work; the circle you explore describes whom you would like to meet."],
    ["Do privacy settings still apply?", "Yes. Your normal search preferences apply, including age and distance when location is enabled. Blocks, incognito and private photos are respected. Likes use your normal daily allowance, and chats require a mutual match."],
    ["Where are Work Circles in the app?", "Open Profile, then Work Circles. They have their own corner and do not add a section to your Discover home screen."]
  ]
};
export const workCircles = [{
  ...common, path: "circles/", type: "hub", crumb: "Work Circles", title: "Paire Work Circles — Meet People Beyond Work",
  description: "Explore corporate, government, banking, healthcare and other Work Circles on Paire. Optional self-declared badges, your usual preferences and privacy.",
  h1: "A connection <em>beyond work.</em>", lede: "Your job is one part of your story. Choose whom you'd like to meet, without changing your main Discover feed.", appPath: "app/?circles=1",
  summary: ["A separate corner under Profile → Work Circles.", "Explore any sector. An optional badge describes your own work, not whom you must date.", "Work badges are self-declared; they do not verify employment or qualifications."],
  body: `<h2>Choose a circle</h2><ul>${sectors.map(([id, label, intro]) => `<li><a href="/circles/${id}/"><strong>${label.replaceAll("&", "&amp;")}</strong></a> — ${intro}</li>`).join("")}</ul><h2>Work is a starting point, not the whole story</h2><p>Explore a circle and see eligible profiles whose members have chosen that work sector. Your age, distance and other search choices still apply. Circles grow as members add their badges.</p><p>Joining Paire, exploring circles and the normal free like allowance are free. Existing Plus and messaging terms still apply. Every member is 18 or older. Circles are for personal connections, not recruitment, medical advice, financial services or employer directories.</p>`
}, ...sectors.map(([id, label, intro]) => ({
  ...common, path: `circles/${id}/`, parent: { name: "Work Circles", path: "circles/" }, crumb: label, title: `${label} Work Circle — Meet People on Paire`,
  description: `${intro} Explore the ${label} Work Circle on Paire. Optional self-declared work badges, your normal search preferences and privacy.`,
  h1: label.replaceAll("&", "&amp;"), lede: intro, appPath: `app/?circle=${id}`, cta: `Explore ${label}`,
  summary: [`A separate ${label} corner on Paire.`, "Explore without joining. Add a work badge only if you want to describe your own sector.", "Personal connections for adults, with your normal preferences and privacy."],
  body: `<h2>Meet beyond your working day</h2><p>Open this circle to explore eligible profiles from people who have chosen ${label.replaceAll("&", "&amp;")} as their work sector. You can browse any circle, whether or not you work in that sector.</p><p>New circles grow as members choose their badges. If nobody fits your preferences right now, you can try another circle or edit your search. A like is still a choice, and a match happens only when both people like each other.</p><h2>A work badge is a self-description</h2><p>Adding a badge is optional. It is public in Work Circles, and you can change or remove it from Profile → Work Circles. No employer name or work email is required. Work sectors do not verify employment, professional registration or qualifications, and do not imply affiliation with a company, bank, hospital or government body.</p><p>Normal search preferences, safety and privacy still apply. Incognito members stay hidden unless they have liked you; private photos stay private until a match. See <a href="/verification/">what Paire's verification checks mean</a>.</p>`
}))];
