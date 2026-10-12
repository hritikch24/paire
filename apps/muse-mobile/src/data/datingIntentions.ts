export type DatingIntention = {
  id: string;
  label: string;
  emoji: string;
};

export const datingIntentions: DatingIntention[] = [
  { id: "marriage", label: "Marriage-minded", emoji: "💍" },
  { id: "long-term", label: "Long-term", emoji: "❤️" },
  { id: "short-term", label: "Short-term", emoji: "💫" },
  { id: "new-friends", label: "New friends", emoji: "🤝" },
  { id: "still-figuring", label: "Still figuring it out", emoji: "✨" }
];

export const datingIntentionMap = new Map(
  datingIntentions.map((intention) => [intention.id, intention])
);
