export type RapidQuestion = {
  id: string;
  question: string;
  options: string[];
};

export const rapidQuestions: RapidQuestion[] = [
  {
    id: "first-date",
    question: "Ideal first date?",
    options: ["Coffee + walk", "Live music", "Museum + snacks", "Sunset picnic"]
  },
  {
    id: "sunday",
    question: "Perfect Sunday?",
    options: ["Brunch + market", "Hike + recharge", "Creative project", "Friends + family"]
  },
  {
    id: "texting",
    question: "Texting style?",
    options: ["Quick check-ins", "Voice notes", "Memes only", "Long chats"]
  },
  {
    id: "icebreaker",
    question: "My opener is usually...",
    options: ["Playful tease", "Thoughtful question", "Bold compliment", "Shared interest"]
  }
];

export const defaultRapidQuestionIds = ["first-date", "sunday", "texting"];

export const rapidQuestionMap = new Map(rapidQuestions.map((question) => [question.id, question]));

export const getRapidQuestionSet = (ids: string[] = defaultRapidQuestionIds) =>
  ids
    .map((id) => rapidQuestionMap.get(id))
    .filter((question): question is RapidQuestion => Boolean(question));
