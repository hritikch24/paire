import { UserProfile } from "../src/types/models";
import { basicsLines, cardBasics, formatHeight, languageLabels } from "../src/data/basics";
import {
  defaultSettings,
  defaultShowMeFor,
  firstIncompleteStep,
  gendersForShowMe,
  needsOnboarding,
  profileCompleteness,
  showMeOptionFor,
  withSettingsDefaults
} from "../src/utils/profile";

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    displayName: "Anya",
    age: 26,
    gender: "woman",
    photoUrls: ["https://example.com/a.jpg"],
    interests: ["canvas"],
    isDiscoverable: true,
    onboardingComplete: true,
    ...overrides
  };
}

describe("onboarding gate", () => {
  it("lets complete adult profiles into the app, with or without a photo", () => {
    expect(needsOnboarding(profile())).toBe(false);
    expect(needsOnboarding(profile({ photoUrls: [] }))).toBe(false);
  });

  it("sends incomplete or invalid profiles to onboarding", () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding(profile({ onboardingComplete: false }))).toBe(true);
    expect(needsOnboarding(profile({ age: 17 }))).toBe(true);
    expect(needsOnboarding(profile({ gender: undefined as never }))).toBe(true);
  });

  it("resumes sign-up at the first missing step", () => {
    expect(firstIncompleteStep(null)).toBe("Basics");
    expect(firstIncompleteStep(profile({ gender: undefined as never }))).toBe("Basics");
    expect(firstIncompleteStep(profile({ onboardingComplete: false }))).toBe("Interests");
    expect(firstIncompleteStep(profile({ interests: [] }))).toBe("Interests");
    expect(firstIncompleteStep(profile({ onboardingComplete: false, photoUrls: [] }))).toBe("Photos");
  });
});

describe("Show me preferences", () => {
  it("maps options to genders and back", () => {
    expect(gendersForShowMe("women")).toEqual(["woman"]);
    expect(gendersForShowMe("men")).toEqual(["man"]);
    expect(gendersForShowMe("everyone")).toEqual(["woman", "man"]);
    expect(showMeOptionFor(["man"])).toBe("men");
    expect(showMeOptionFor(["woman", "man"])).toBe("everyone");
    expect(showMeOptionFor(undefined)).toBe("everyone");
  });

  it("defaults the age range to ±5 years without going under 18", () => {
    expect(defaultSettings(19, ["man"])).toMatchObject({ ageMin: 18, ageMax: 24, showMe: ["man"] });
    expect(defaultSettings(40, ["woman"])).toMatchObject({ ageMin: 35, ageMax: 45 });
  });

  it("fills missing settings with safe defaults", () => {
    const settings = withSettingsDefaults({ ageMin: 21 });
    expect(settings.ageMin).toBe(21);
    expect(settings.ageMax).toBe(100);
    expect(settings.showMe).toEqual(["woman", "man"]);
    expect(settings.notifications).toEqual({ matches: true, messages: true, previews: false });
    expect(withSettingsDefaults({ notifications: { matches: true, messages: true, previews: true } }).notifications.previews).toBe(true);
    expect(settings.openToCasual).toBe(false);
    expect(withSettingsDefaults({ openToCasual: true }).openToCasual).toBe(true);
    expect(withSettingsDefaults({ maxDistanceKm: null }).maxDistanceKm).toBeNull();
  });
});

describe("profile completeness", () => {
  it("reports what is missing", () => {
    const result = profileCompleteness(profile());
    expect(result.percent).toBeLessThan(100);
    expect(result.missing).toContain("Add at least 3 photos");
    expect(result.missing).toContain("Write a short bio");
  });
});

describe("men and women", () => {
  it("defaults Show me to the other gender, with Both available", () => {
    expect(defaultShowMeFor("woman")).toBe("men");
    expect(defaultShowMeFor("man")).toBe("women");
    expect(gendersForShowMe("everyone")).toEqual(["woman", "man"]);
  });

  it("keeps every privacy control off unless chosen", () => {
    expect(withSettingsDefaults({})).toMatchObject({
      requireNote: false,
      firstMove: false,
      incognito: false,
      privatePhotos: false,
      sameIntentOnly: false,
      sharedLanguageOnly: false
    });
    expect(withSettingsDefaults({ incognito: true }).incognito).toBe(true);
  });
});

describe("basics", () => {
  it("formats height in feet and inches", () => {
    expect(formatHeight(165)).toBe("5′5″");
    expect(formatHeight(183)).toBe("6′0″");
    expect(formatHeight(undefined)).toBeNull();
  });

  it("summarises basics for cards and profiles", () => {
    expect(cardBasics({ heightCm: 170, diet: "veg" }, ["hindi", "punjabi", "english"])).toBe("5′7″ · Vegetarian · Hindi, Punjabi");
    expect(cardBasics(undefined, undefined)).toBeNull();
    expect(basicsLines({ religion: "sikh", drinking: "socially" }).map((line) => line.label)).toEqual(["Sikh", "Drinks: socially"]);
    expect(languageLabels(["tamil", "klingon"])).toEqual(["Tamil"]);
  });
});

describe("older accounts", () => {
  it("send a gender Paire no longer offers back through basics, and drop it from Show me", () => {
    expect(needsOnboarding(profile({ gender: "nonbinary" as never }))).toBe(true);
    expect(firstIncompleteStep(profile({ gender: "nonbinary" as never }))).toBe("Basics");
    expect(withSettingsDefaults({ showMe: ["woman", "nonbinary" as never] }).showMe).toEqual(["woman"]);
    expect(withSettingsDefaults({ showMe: ["nonbinary" as never] }).showMe).toEqual(["woman", "man"]);
  });
});
