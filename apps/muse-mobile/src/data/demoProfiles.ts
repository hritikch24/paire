import { UserProfile } from "../types/models";

const now = Date.now();

export const demoProfiles: UserProfile[] = [
  {
    uid: "demo_anya",
    displayName: "Anya",
    pronouns: "she/her",
    age: 26,
    city: "Mumbai",
    bio: "Weekend gallery crawls, midnight dosa runs, and good coffee.",
    photoUrls: [
      "https://picsum.photos/seed/muse-anya-1/800/1200",
      "https://picsum.photos/seed/muse-anya-2/800/1200"
    ],
    interests: ["Art", "Food", "Music"],
    intentions: ["Long-term"],
    vibes: ["Artsy", "Foodie", "Curious"],
    vibePreference: "any",
    maxDistanceKm: 25,
    quickAnswers: [
      { questionId: "ideal_date", answer: "Coffee + walk" },
      { questionId: "texting_style", answer: "Long chats" }
    ],
    location: null,
    shareLocation: false,
    createdAt: now,
    updatedAt: now,
    onboardingComplete: true,
    safetyConfirmed: true,
    lastActiveAt: now,
    isDiscoverable: true
  },
  {
    uid: "demo_rahul",
    displayName: "Rahul",
    pronouns: "he/him",
    age: 29,
    city: "Delhi",
    bio: "Slow mornings, fast bikes, and a lot of playlist sharing.",
    photoUrls: [
      "https://picsum.photos/seed/muse-rahul-1/800/1200",
      "https://picsum.photos/seed/muse-rahul-2/800/1200"
    ],
    interests: ["Outdoorsy", "Music", "Fitness"],
    intentions: ["Still figuring it out"],
    vibes: ["Adventurous", "Night Owl", "Ambitious"],
    vibePreference: "any",
    maxDistanceKm: 30,
    quickAnswers: [
      { questionId: "ideal_date", answer: "Live music" },
      { questionId: "perfect_sunday", answer: "Hike + recharge" }
    ],
    location: null,
    shareLocation: false,
    createdAt: now,
    updatedAt: now,
    onboardingComplete: true,
    safetyConfirmed: true,
    lastActiveAt: now,
    isDiscoverable: true
  },
  {
    uid: "demo_neha",
    displayName: "Neha",
    pronouns: "she/her",
    age: 24,
    city: "Bengaluru",
    bio: "Brunch spot scout, product nerd, and sunset chaser.",
    photoUrls: [
      "https://picsum.photos/seed/muse-neha-1/800/1200",
      "https://picsum.photos/seed/muse-neha-2/800/1200"
    ],
    interests: ["Design", "Food", "Travel"],
    intentions: ["New friends"],
    vibes: ["Cozy", "Wellness", "Curious"],
    vibePreference: "any",
    maxDistanceKm: 20,
    quickAnswers: [
      { questionId: "perfect_sunday", answer: "Brunch + market" },
      { questionId: "texting_style", answer: "Quick check-ins" }
    ],
    location: null,
    shareLocation: false,
    createdAt: now,
    updatedAt: now,
    onboardingComplete: true,
    safetyConfirmed: true,
    lastActiveAt: now,
    isDiscoverable: true
  }
];
