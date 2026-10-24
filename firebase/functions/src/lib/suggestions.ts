import { QuickAnswer } from "../types";

/**
 * Free, built-in writing help: icebreakers and bio drafts made from what people
 * chose to share. Used when no AI is configured, or as its fallback.
 * Ids match the app's catalogs (src/data/museCards.ts, vibes.ts, ...).
 */

type InterestCopy = {
  label: string;
  /** A question about it, to open a chat with. */
  opener: string;
  /** Noun phrase: "happiest somewhere between <phrase> and ...". */
  phrase: string;
  /** "Ask me about <topic>". */
  topic: string;
  /** "someone who'll <activity>". */
  activity: string;
};

export const INTERESTS: Record<string, InterestCopy> = {
  soundscape: {
    label: "Music",
    opener: "What song have you had on repeat lately?",
    phrase: "live gigs and good playlists",
    topic: "music",
    activity: "share their headphones"
  },
  frame: {
    label: "Films",
    opener: "What's a film you could watch on a loop?",
    phrase: "late-night films",
    topic: "films",
    activity: "argue about a movie ending with me"
  },
  canvas: {
    label: "Art",
    opener: "Which gallery or artist would you take me to first?",
    phrase: "galleries and sketchbooks",
    topic: "art",
    activity: "wander a gallery with me"
  },
  movement: {
    label: "Dance",
    opener: "Where's the best place to dance around here?",
    phrase: "dance floors",
    topic: "dance",
    activity: "dance badly with me"
  },
  words: {
    label: "Books",
    opener: "What's the last book that stayed with you?",
    phrase: "a good book and a quiet café",
    topic: "books",
    activity: "swap book recommendations"
  },
  design: {
    label: "Design",
    opener: "What's a place you think is beautifully designed?",
    phrase: "beautiful spaces",
    topic: "design",
    activity: "notice the little details"
  },
  lens: {
    label: "Photography",
    opener: "What do you love photographing most?",
    phrase: "a camera in hand",
    topic: "photography",
    activity: "come on a photo walk with me"
  },
  craft: {
    label: "Making things",
    opener: "What's the best thing you've made with your hands?",
    phrase: "making things by hand",
    topic: "my latest project",
    activity: "make something with me"
  },
  taste: {
    label: "Food",
    opener: "Which dish should we try on our first food adventure?",
    phrase: "new food spots",
    topic: "food",
    activity: "split every dish with me"
  },
  nature: {
    label: "Outdoors",
    opener: "What's your favourite escape into nature?",
    phrase: "weekend hikes",
    topic: "hiking trails",
    activity: "catch a sunrise with me"
  }
};

export const VIBES: Record<string, { label: string; opener: string; word: string }> = {
  cozy: { label: "Cozy", opener: "Rainy evening: movie marathon, or candles and a record?", word: "Cozy" },
  adventurous: { label: "Adventurous", opener: "What's the most spontaneous thing you've done this year?", word: "Adventurous" },
  artsy: { label: "Artsy", opener: "What's inspiring you creatively right now?", word: "Artsy" },
  foodie: { label: "Foodie", opener: "Best thing you've eaten this month?", word: "A foodie" },
  outdoorsy: { label: "Outdoorsy", opener: "Mountains or beach for a weekend escape?", word: "Outdoorsy" },
  "night-owl": { label: "Night owl", opener: "What keeps you up past 2 am?", word: "A night owl" },
  wellness: { label: "Wellness", opener: "What's your favourite way to recharge?", word: "Calm" },
  curious: { label: "Curious", opener: "What have you been nerding out about lately?", word: "Endlessly curious" },
  ambitious: { label: "Ambitious", opener: "What are you working towards right now?", word: "Ambitious" }
};

export const INTENTIONS: Record<string, string> = {
  marriage: "a partner for life",
  "long-term": "something real and long-term",
  "short-term": "something fun, no pressure",
  "new-friends": "new friends and good conversations",
  "still-figuring": "seeing where things go"
};

export const QUESTIONS: Record<string, { text: string; opener: (answer: string) => string }> = {
  "first-date": {
    text: "Ideal first date",
    opener: (answer) => `“${answer}” for a first date? Sold. Where would we go?`
  },
  sunday: {
    text: "Perfect Sunday",
    opener: (answer) => `“${answer}” is my kind of Sunday too. What's your go-to spot for it?`
  },
  texting: {
    text: "Texting style",
    opener: (answer) => `“${answer}” texter, noted. So, what are you up to this weekend?`
  },
  icebreaker: {
    text: "Usual opener",
    opener: (answer) => `You said your opener is usually “${answer}”. Go on then, I'm ready 😄`
  }
};

export type Person = {
  name: string;
  interests: string[];
  vibes: string[];
  intentions: string[];
  quickAnswers: QuickAnswer[];
  bio?: string;
  city?: string;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const unique = (lines: string[]) => Array.from(new Set(lines));

/** Three ways to start a chat, most personal first. */
export function templateOpeners(me: Person, them: Person): string[] {
  const name = firstName(them.name);
  const lines: string[] = [];
  const sharedInterest = them.interests.find((id) => me.interests.includes(id) && INTERESTS[id]);
  if (sharedInterest) {
    lines.push(`We both love ${INTERESTS[sharedInterest].label.toLowerCase()}! ${INTERESTS[sharedInterest].opener}`);
  }
  const answer = them.quickAnswers.find((item) => QUESTIONS[item.questionId]);
  if (answer) lines.push(QUESTIONS[answer.questionId].opener(answer.answer));
  const otherInterest = them.interests.find((id) => id !== sharedInterest && INTERESTS[id]);
  if (otherInterest) lines.push(`Hi ${name}! ${INTERESTS[otherInterest].opener}`);
  const vibe = them.vibes.find((id) => VIBES[id]);
  if (vibe) lines.push(VIBES[vibe].opener);
  lines.push(
    `Hi ${name}! What's the best thing that happened to you this week?`,
    `Okay ${name}, important question first: chai or coffee?`,
    `Hey ${name} 👋 If we met up this weekend, what would we do?`
  );
  return unique(lines).slice(0, 3);
}

const DIWALI_OPENERS: Record<string, string> = {
  chai: "are you up for chai and mithai somewhere public this Diwali?",
  mela: "fancy a mela stroll this Diwali? Somewhere public and bright, of course.",
  lights: "fancy a lights walk this Diwali? I hear the best streets are glowing.",
  meal: "want to grab a Diwali meal at a nice café, somewhere public?",
  bash: "are you headed to a Diwali bash too? Happy to compare plans first."
};
/** For two matches who both chose a Diwali plan in the app (see lib/diwali.ts). Names no dates. */
export function diwaliOpener(them: Person, vibe: string): string {
  return `${firstName(them.name)}, ${DIWALI_OPENERS[vibe] ?? DIWALI_OPENERS.chai} 🪔`;
}

/** For two matches going to Garba on the same night (see lib/garba.ts). */
export function garbaOpener(them: Person, night: string): string {
  return `${firstName(them.name)}, we're both at Garba on ${night}! Team Dandiya or team Garba circle? 💃`;
}

/** Three ways to open a Duo chat, written for the whole group. */
export function templateGroupOpeners(me: Person, them: Person[]): string[] {
  const names = them.map((person) => firstName(person.name));
  const both = names.join(" and ");
  const lines: string[] = [];
  const sharedByAll = me.interests.find(
    (id) => INTERESTS[id] && them.every((person) => person.interests.includes(id))
  );
  const sharedBySome = me.interests.find((id) => INTERESTS[id] && them.some((person) => person.interests.includes(id)));
  const common = sharedByAll ?? sharedBySome;
  if (common) {
    lines.push(
      `${sharedByAll ? "Looks like we all love" : "Spotted some fellow fans of"} ${INTERESTS[common].label.toLowerCase()}! ${INTERESTS[common].opener}`
    );
  }
  const vibe = them.flatMap((person) => person.vibes).find((id) => VIBES[id]);
  if (vibe) lines.push(`Hi ${both}! ${VIBES[vibe].opener}`);
  lines.push(
    `Hi ${both}! If the four of us met up this weekend, where are we going?`,
    `Okay ${both}, settle this before we meet: chai or coffee?`,
    "Hey both 👋 What's the best thing that happened to you this week?"
  );
  return unique(lines).slice(0, 3);
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Three bio drafts in different tones, from the member's own choices. */
export function templateBios(person: Person): string[] {
  const picks = person.interests.map((id) => INTERESTS[id]).filter((item): item is InterestCopy => Boolean(item));
  const first = picks[0];
  const second = picks[1];
  const vibe = person.vibes.map((id) => VIBES[id]).find(Boolean);
  const intent = INTENTIONS[person.intentions.find((id) => INTENTIONS[id]) ?? ""] ?? "seeing where things go";
  const city = person.city?.split(",")[0]?.trim();

  const playful = first && second
    ? `Happiest somewhere between ${first.phrase} and ${second.phrase}. Looking for ${intent} with someone who'll ${first.activity}.`
    : `Looking for ${intent} with someone who makes ordinary days feel like plans.`;
  const sincere = `${vibe ? vibe.word : "Curious"} at heart${city ? ` in ${city}` : ""}. Ask me about ${
    first ? first.topic : "my favourite places"
  } and I'll talk your ear off. Here for ${intent}.`;
  const short = picks.length
    ? `${picks.slice(0, 3).map((item) => capitalise(item.label.toLowerCase())).join(" · ")}. Bonus points if you'll ${
        (second ?? first).activity
      }.`
    : "Good conversations, better food, spontaneous plans. Your turn: what's yours?";
  return unique([playful, sincere, short]).map((line) => line.slice(0, 220));
}

/** Plain-language summary of a person for the model (only what they chose to show). */
export function describe(person: Person): string {
  const parts = [
    `Name: ${firstName(person.name)}`,
    person.interests.length && `Loves: ${person.interests.map((id) => INTERESTS[id]?.label ?? id).join(", ")}`,
    person.vibes.length && `Vibe: ${person.vibes.map((id) => VIBES[id]?.label ?? id).join(", ")}`,
    person.intentions.length && `Looking for: ${person.intentions.map((id) => INTENTIONS[id] ?? id).join(", ")}`,
    ...person.quickAnswers.map((item) => `${QUESTIONS[item.questionId]?.text ?? item.questionId}: ${item.answer}`),
    person.city && `City: ${person.city}`,
    person.bio && `Bio: ${person.bio.slice(0, 400)}`
  ];
  return parts.filter(Boolean).join("\n");
}
