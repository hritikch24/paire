import { GENDERS, Gender, UserProfile, UserSettings } from "../types/models";
import { MAX_AGE, MIN_AGE } from "./age";

export const GENDER_LABELS: Record<Gender, string> = {
  woman: "Woman",
  man: "Man"
};

export type ShowMeOption = "women" | "men" | "everyone";

export const SHOW_ME_OPTIONS: Array<{ id: ShowMeOption; label: string; genders: Gender[] }> = [
  { id: "women", label: "Women", genders: ["woman"] },
  { id: "men", label: "Men", genders: ["man"] },
  { id: "everyone", label: "Both", genders: [...GENDERS] }
];

/** The usual "Show me" for a gender: the other one. Members can change it. */
export function defaultShowMeFor(gender: Gender): ShowMeOption {
  return gender === "woman" ? "men" : "women";
}

export function showMeOptionFor(genders: Gender[] | undefined): ShowMeOption {
  if (!genders?.length || genders.length === GENDERS.length) return "everyone";
  if (genders.length === 1 && genders[0] === "woman") return "women";
  if (genders.length === 1 && genders[0] === "man") return "men";
  return "everyone";
}

export function gendersForShowMe(option: ShowMeOption): Gender[] {
  return SHOW_ME_OPTIONS.find((item) => item.id === option)?.genders ?? [...GENDERS];
}

export function isAdultAge(age: unknown): age is number {
  return typeof age === "number" && age >= MIN_AGE && age <= MAX_AGE;
}

export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 6;

/**
 * Signed-in members reach the main app after the quick sign-up steps: name, age
 * and gender, an optional photo, and interests. The rest is encouraged afterwards.
 */
export function needsOnboarding(profile: UserProfile | null): boolean {
  return (
    !profile ||
    !profile.onboardingComplete ||
    !profile.displayName ||
    !(GENDERS as readonly string[]).includes(profile.gender) ||
    !isAdultAge(profile.age)
  );
}

export const ONBOARDING_STEPS = 3;

export type OnboardingStep = "Basics" | "Photos" | "Interests";

/** Where a returning member should resume sign-up. */
export function firstIncompleteStep(profile: UserProfile | null): OnboardingStep {
  // A gender Paire no longer offers (older accounts) goes back through the basics step.
  if (!profile || !profile.displayName || !(GENDERS as readonly string[]).includes(profile.gender) || !isAdultAge(profile.age)) {
    return "Basics";
  }
  return profile.photoUrls?.length ? "Interests" : "Photos";
}

export const CASUAL_LABEL = "Open to a one-night stand";
export const CASUAL_DESCRIPTION =
  "Private. Only people who also turned this on will ever know, and it helps Paire find people with the same preference. Change it anytime.";

/** Sensible defaults: ±5 years around the member's age, clamped to adults. */
export function defaultSettings(age: number, showMe: Gender[]): UserSettings {
  return {
    showMe,
    ageMin: Math.max(MIN_AGE, age - 5),
    ageMax: Math.min(MAX_AGE, age + 5),
    maxDistanceKm: 50,
    locationEnabled: false,
    location: null,
    aiVibeMatching: false,
    sharedVibesOnly: false,
    openToCasual: false,
    notifications: { matches: true, messages: true, previews: false },
    requireNote: false,
    firstMove: false,
    incognito: false,
    privatePhotos: false,
    sameIntentOnly: false,
    sharedLanguageOnly: false
  };
}

export function withSettingsDefaults(settings: Partial<UserSettings> | null | undefined): UserSettings {
  return {
    showMe: settings?.showMe?.some((gender) => (GENDERS as readonly string[]).includes(gender))
      ? settings.showMe.filter((gender) => (GENDERS as readonly string[]).includes(gender))
      : [...GENDERS],
    ageMin: settings?.ageMin ?? MIN_AGE,
    ageMax: settings?.ageMax ?? MAX_AGE,
    maxDistanceKm: settings?.maxDistanceKm === undefined ? 50 : settings.maxDistanceKm,
    locationEnabled: Boolean(settings?.locationEnabled),
    location: settings?.location ?? null,
    aiVibeMatching: settings?.aiVibeMatching === true,
    sharedVibesOnly: Boolean(settings?.sharedVibesOnly),
    openToCasual: Boolean(settings?.openToCasual),
    notifications: {
      matches: settings?.notifications?.matches ?? true,
      messages: settings?.notifications?.messages ?? true,
      previews: settings?.notifications?.previews === true,
      reminders: settings?.notifications?.reminders === true
    },
    requireNote: settings?.requireNote === true,
    firstMove: settings?.firstMove === true,
    incognito: settings?.incognito === true,
    privatePhotos: settings?.privatePhotos === true,
    sameIntentOnly: settings?.sameIntentOnly === true,
    sharedLanguageOnly: settings?.sharedLanguageOnly === true,
    ageGap: settings?.ageGap === "older" || settings?.ageGap === "intoOlder" ? settings.ageGap : null,
    garbaNights: Array.isArray(settings?.garbaNights) ? settings.garbaNights.filter((night) => typeof night === "string") : [],
    showPresence: settings?.showPresence !== false
  };
}

export function profileCompleteness(profile: UserProfile): { percent: number; missing: string[] } {
  const checks: Array<[boolean, string]> = [
    [(profile.photoUrls?.length ?? 0) >= 3, "Add at least 3 photos"],
    [Boolean(profile.bio?.trim()), "Write a short bio"],
    [(profile.interests?.length ?? 0) >= 3, "Pick 3 or more Interests"],
    [Boolean(profile.intentions?.length), "Say what you're looking for"],
    [Boolean(profile.languages?.length), "Add the languages you speak"],
    [Boolean(profile.basics && Object.keys(profile.basics).length >= 3), "Fill in your basics (height, work, diet…)"],
    [Boolean(profile.vibes?.length), "Choose your vibes"],
    [Boolean(profile.quickAnswers?.length), "Answer the rapid questions"],
    [Boolean(profile.city?.trim()), "Add your city"]
  ];
  const done = checks.filter(([ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label)
  };
}
