/** IDs mirror the server's workCircles catalog and Firestore validation. */
export const WORK_CIRCLES = [
  { id: "corporate", label: "Corporate & tech", icon: "briefcase-outline", hint: "Beyond the meeting calendar", intro: "Find a connection beyond the meeting calendar." },
  { id: "government", label: "Government & public service", icon: "business-outline", hint: "A connection beyond the office", intro: "Meet people who understand public-service life." },
  { id: "banking", label: "Banking & finance", icon: "wallet-outline", hint: "More than numbers in common", intro: "Find more than numbers in common." },
  { id: "healthcare", label: "Healthcare & hospitals", icon: "medkit-outline", hint: "Someone who gets the shifts", intro: "Meet someone who understands life around shifts." },
  { id: "education", label: "Education & research", icon: "school-outline", hint: "A little curiosity goes a long way", intro: "Make room for connection beyond the classroom." },
  { id: "business", label: "Founders & business", icon: "rocket-outline", hint: "Room for life beyond work", intro: "Build a connection beyond the business plan." },
  { id: "creative", label: "Creative & media", icon: "color-palette-outline", hint: "Good stories start somewhere", intro: "Find someone to share your next story with." },
  { id: "legal", label: "Law & legal", icon: "document-text-outline", hint: "A conversation beyond the case", intro: "Find a conversation beyond the case." },
  { id: "hospitality", label: "Hospitality & travel", icon: "airplane-outline", hint: "A plan for your next day off", intro: "Meet someone for your next day off." },
  { id: "engineering", label: "Engineering & operations", icon: "construct-outline", hint: "Something outside the blueprint", intro: "Find a connection outside the blueprint." },
  { id: "other", label: "Other paths", icon: "compass-outline", hint: "Your work is only part of your story", intro: "Different paths. A chance to connect." }
] as const;
export type WorkSector = (typeof WORK_CIRCLES)[number]["id"];
export const workCircle = (value: unknown) => WORK_CIRCLES.find(circle => circle.id === value);
