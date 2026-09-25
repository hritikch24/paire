export type VibeOption = {
  id: string;
  label: string;
  emoji: string;
  description: string;
};

export const vibeOptions: VibeOption[] = [
  {
    id: "cozy",
    label: "Cozy",
    emoji: "🕯️",
    description: "Low-key nights, warm lighting, soft playlists."
  },
  {
    id: "adventurous",
    label: "Adventurous",
    emoji: "🗺️",
    description: "Spontaneous plans, bold ideas, new places."
  },
  {
    id: "artsy",
    label: "Artsy",
    emoji: "🎨",
    description: "Galleries, creative energy, handmade everything."
  },
  {
    id: "foodie",
    label: "Foodie",
    emoji: "🍜",
    description: "Shared plates, hidden gems, chef-curious."
  },
  {
    id: "outdoorsy",
    label: "Outdoorsy",
    emoji: "🏕️",
    description: "Trails, sunrise air, weekend escapes."
  },
  {
    id: "night-owl",
    label: "Night Owl",
    emoji: "🌙",
    description: "Late-night talks, city lights, after-hours energy."
  },
  {
    id: "wellness",
    label: "Wellness",
    emoji: "🧘",
    description: "Morning rituals, mindful wins, balanced days."
  },
  {
    id: "curious",
    label: "Curious",
    emoji: "🔎",
    description: "Ask me anything, always learning."
  },
  {
    id: "ambitious",
    label: "Ambitious",
    emoji: "🚀",
    description: "Goal-getter, big vision, driven vibes."
  }
];

export const vibeMap = new Map(vibeOptions.map((option) => [option.id, option]));
