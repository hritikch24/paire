import { MuseCard } from "../types/models";

export const museCards: MuseCard[] = [
  {
    id: "soundscape",
    title: "Soundscape",
    emoji: "🎧",
    description: "Playlists, live sets, and sonic discoveries"
  },
  {
    id: "frame",
    title: "Frame",
    emoji: "🎞️",
    description: "Cinema lovers, story arc obsessives"
  },
  {
    id: "canvas",
    title: "Canvas",
    emoji: "🖌️",
    description: "Galleries, sketchbooks, and color"
  },
  {
    id: "movement",
    title: "Movement",
    emoji: "🩰",
    description: "Dance, performance, and flow"
  },
  {
    id: "words",
    title: "Words",
    emoji: "📚",
    description: "Poetry, fiction, late-night pages"
  },
  {
    id: "design",
    title: "Design",
    emoji: "🧭",
    description: "Architecture, systems, and form"
  },
  {
    id: "lens",
    title: "Lens",
    emoji: "📸",
    description: "Street photography and portraits"
  },
  {
    id: "craft",
    title: "Craft",
    emoji: "🧵",
    description: "Handmade, tactile, and experimental"
  },
  {
    id: "taste",
    title: "Taste",
    emoji: "🍷",
    description: "Food, wine, and slow dinners"
  },
  {
    id: "nature",
    title: "Nature",
    emoji: "🌿",
    description: "Outdoor calm, small escapes"
  }
];

export const museCardMap = new Map(museCards.map((card) => [card.id, card]));
