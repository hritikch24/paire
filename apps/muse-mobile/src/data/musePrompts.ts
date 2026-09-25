const prompts = [
  "Share a moment that made you feel wildly creative.",
  "What’s a tiny ritual that keeps your spark alive?",
  "Describe your vibe with three sensory details.",
  "What project could you make in one afternoon?",
  "Which song makes you feel unstoppable?",
  "What’s a collaboration you’re craving right now?",
  "What’s your favorite way to reset after a long day?",
  "If you could host a themed night, what’s the theme?",
  "What’s one skill you’d love to learn this year?",
  "What’s your favorite place to get inspired?"
];

const hashString = (value: string) =>
  value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

export const getDailyPrompt = () => {
  const today = new Date().toDateString();
  const index = hashString(today) % prompts.length;
  return prompts[index];
};

export const musePromptTitle = "Today’s Spark";
