import { ProfileBasics } from "../types/models";

/** Indian "basics": the things people here want to know up front. Never caste. */

export type BasicOption = { id: string; label: string; emoji?: string };

export const LANGUAGES: BasicOption[] = [
  { id: "hindi", label: "Hindi" },
  { id: "english", label: "English" },
  { id: "punjabi", label: "Punjabi" },
  { id: "bengali", label: "Bengali" },
  { id: "marathi", label: "Marathi" },
  { id: "gujarati", label: "Gujarati" },
  { id: "tamil", label: "Tamil" },
  { id: "telugu", label: "Telugu" },
  { id: "kannada", label: "Kannada" },
  { id: "malayalam", label: "Malayalam" },
  { id: "urdu", label: "Urdu" },
  { id: "odia", label: "Odia" },
  { id: "assamese", label: "Assamese" },
  { id: "bhojpuri", label: "Bhojpuri" },
  { id: "haryanvi", label: "Haryanvi" },
  { id: "rajasthani", label: "Rajasthani" },
  { id: "konkani", label: "Konkani" },
  { id: "kashmiri", label: "Kashmiri" }
];
export const MAX_LANGUAGES = 6;

export const EDUCATION: BasicOption[] = [
  { id: "school", label: "School" },
  { id: "diploma", label: "Diploma" },
  { id: "bachelors", label: "Graduate" },
  { id: "masters", label: "Post-graduate" },
  { id: "doctorate", label: "PhD" },
  { id: "professional", label: "Professional (CA, MBBS, LLB…)" }
];

export const RELIGION: BasicOption[] = [
  { id: "hindu", label: "Hindu" },
  { id: "muslim", label: "Muslim" },
  { id: "sikh", label: "Sikh" },
  { id: "christian", label: "Christian" },
  { id: "jain", label: "Jain" },
  { id: "buddhist", label: "Buddhist" },
  { id: "parsi", label: "Parsi" },
  { id: "jewish", label: "Jewish" },
  { id: "spiritual", label: "Spiritual" },
  { id: "none", label: "Not religious" },
  { id: "other", label: "Other" }
];

export const DIET: BasicOption[] = [
  { id: "veg", label: "Vegetarian", emoji: "🥗" },
  { id: "eggetarian", label: "Eggetarian", emoji: "🥚" },
  { id: "non-veg", label: "Non-veg", emoji: "🍗" },
  { id: "vegan", label: "Vegan", emoji: "🌱" },
  { id: "jain-food", label: "Jain food", emoji: "🍃" }
];

export const HABIT: BasicOption[] = [
  { id: "never", label: "Never" },
  { id: "socially", label: "Socially" },
  { id: "regularly", label: "Regularly" }
];

export const HEIGHT_MIN_CM = 135;
export const HEIGHT_MAX_CM = 215;

const labelIn = (options: BasicOption[], id: string | undefined) => options.find((option) => option.id === id)?.label;

/** 165 → 5′5″ (people in India talk height in feet and inches). */
export function formatHeight(cm: number | undefined): string | null {
  if (typeof cm !== "number" || !Number.isFinite(cm)) return null;
  const totalInches = Math.round(cm / 2.54);
  return `${Math.floor(totalInches / 12)}′${totalInches % 12}″`;
}

export function languageLabels(ids: string[] | undefined): string[] {
  return (ids ?? []).map((id) => labelIn(LANGUAGES, id)).filter((label): label is string => Boolean(label));
}

/** Readable basics, in a stable order, for cards and profiles. */
export function basicsLines(basics: ProfileBasics | undefined): Array<{ key: string; icon: string; label: string }> {
  if (!basics) return [];
  const lines: Array<{ key: string; icon: string; label: string | null | undefined }> = [
    { key: "height", icon: "📏", label: formatHeight(basics.heightCm) },
    { key: "work", icon: "💼", label: basics.work },
    { key: "education", icon: "🎓", label: labelIn(EDUCATION, basics.education) },
    { key: "religion", icon: "🪔", label: labelIn(RELIGION, basics.religion) },
    { key: "diet", icon: DIET.find((item) => item.id === basics.diet)?.emoji ?? "🍽️", label: labelIn(DIET, basics.diet) },
    { key: "drinking", icon: "🍷", label: basics.drinking ? `Drinks: ${labelIn(HABIT, basics.drinking)?.toLowerCase()}` : null },
    { key: "smoking", icon: "🚬", label: basics.smoking ? `Smokes: ${labelIn(HABIT, basics.smoking)?.toLowerCase()}` : null }
  ];
  return lines.filter((line): line is { key: string; icon: string; label: string } => Boolean(line.label));
}

/** A one-line summary for discovery cards: height · diet · languages. */
export function cardBasics(basics: ProfileBasics | undefined, languages: string[] | undefined): string | null {
  const parts = [
    formatHeight(basics?.heightCm),
    labelIn(DIET, basics?.diet),
    languageLabels(languages).slice(0, 2).join(", ") || null
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
