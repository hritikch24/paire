import { UserProfile } from "../types/models";

export function createGuestProfile() {
  const now = Date.now();
  const uid = `guest_${now}`;

  const profile: UserProfile = {
    uid,
    displayName: "Guest",
    pronouns: "",
    age: 25,
    city: "India",
    bio: "Exploring Muse in guest mode.",
    photoUrls: [],
    interests: ["Music", "Food"],
    intentions: ["Still figuring it out"],
    vibes: ["Cozy", "Curious"],
    vibePreference: "any",
    maxDistanceKm: 25,
    quickAnswers: [],
    location: null,
    shareLocation: false,
    createdAt: now,
    updatedAt: now,
    onboardingComplete: true,
    safetyConfirmed: true,
    lastActiveAt: now,
    isDiscoverable: false
  };

  return profile;
}
