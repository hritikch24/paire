/** Paire is for men and women. */
export const GENDERS = ["woman", "man"] as const;
export type Gender = (typeof GENDERS)[number];

export type SwipeType = "like" | "nope" | "super";

/**
 * Age-gap dating: "older" is a Silver Fox (man) or Cougar (woman), 35+;
 * "intoOlder" is someone into an older partner. Only Plus members can filter by it or see it.
 */
export const AGE_GAP_SIDES = ["older", "intoOlder"] as const;
export type AgeGapSide = (typeof AGE_GAP_SIDES)[number];

export type QuickAnswer = { questionId: string; answer: string };

/** users/{uid}: public profile, readable by the owner and active matches. */
export type PublicProfile = {
  uid: string;
  displayName: string;
  age: number;
  gender: Gender;
  pronouns?: string;
  city?: string;
  bio?: string;
  photoUrls: string[];
  interests: string[];
  intentions?: string[];
  vibes?: string[];
  quickAnswers?: QuickAnswer[];
  /** Languages spoken (ids from the app's catalogue). */
  languages?: string[];
  /** Optional Indian "basics": height, education, work, religion, diet, drinking, smoking. */
  basics?: ProfileBasics;
  isDiscoverable: boolean;
  onboardingComplete: boolean;
  safetyConfirmed?: boolean;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
};

export type ProfileBasics = {
  heightCm?: number;
  education?: string;
  work?: string;
  religion?: string;
  diet?: string;
  drinking?: string;
  smoking?: string;
};

export type LatLng = { lat: number; lng: number };

/** users/{uid}/private/settings: owner-only preferences and precise location. */
export type UserSettings = {
  showMe?: Gender[];
  ageMin?: number;
  ageMax?: number;
  maxDistanceKm?: number | null;
  locationEnabled?: boolean;
  location?: (LatLng & { updatedAt?: number }) | null;
  /** Explicit opt-in to external AI processing of fixed profile choices. */
  aiVibeMatching?: boolean;
  sharedVibesOnly?: boolean;
  /** Open to a one-night stand. Private: only ever revealed to someone who also opted in. */
  openToCasual?: boolean;
  notifications?: { matches?: boolean; messages?: boolean; previews?: boolean };
  /** "Her rules": privacy and control options, free for everyone. */
  /** Likes must carry a note (unless I liked them first). */
  requireNote?: boolean;
  /** After a match, only I can send the first message. */
  firstMove?: boolean;
  /** Only people I've liked can see me in discovery. */
  incognito?: boolean;
  /** My photos stay hidden from discovery and likes until we match. */
  privatePhotos?: boolean;
  /** Only show me to, and show me, people with an overlapping dating intention. */
  sameIntentOnly?: boolean;
  /** Only show me to, and show me, people who share a language with me. */
  sharedLanguageOnly?: boolean;
  /** My age-gap side (see AgeGapSide); null or missing = not taking part. */
  ageGap?: AgeGapSide | null;
  /** Garba Nights: the nights ("YYYY-MM-DD", IST) I'm going to Garba this Navratri. */
  garbaNights?: string[] | null;
};

/**
 * "test" accounts (Play reviewers, QA) only ever see each other, so they never
 * appear to real members. Set moderation/{uid}.cohort = "test" in the console.
 */
export type Cohort = "public" | "test";

/** moderation/{uid}: server-only moderation state, managed by functions and admins. */
export type ModerationRecord = { status?: string; cohort?: string; emailVerified?: boolean };

/** discovery/{uid}: server-only index used to build feeds. Location is coarsened. */
export type DiscoveryEntry = {
  uid: string;
  visible: boolean;
  cohort: Cohort;
  gender: Gender | null;
  age: number | null;
  showMe: Gender[];
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number | null;
  lat: number | null;
  lng: number | null;
  interests: string[];
  vibes: string[];
  intentions?: string[];
  /** Mirrors settings.openToCasual; server-only. Missing on older entries (= false). */
  casual?: boolean;
  /** Missing on older entries, which always had photos. */
  hasPhoto?: boolean;
  languages?: string[];
  /** Settings mirrored for matching; missing on older entries (= false). */
  sameIntentOnly?: boolean;
  sharedLanguageOnly?: boolean;
  incognito?: boolean;
  privatePhotos?: boolean;
  requireNote?: boolean;
  /** Mirrors settings.ageGap once eligible ("older" needs 35+); null otherwise. */
  ageGap?: AgeGapSide | null;
  /** Garba Nights season id while the member has nights to come in it; null otherwise. */
  garba?: string | null;
  /** Their upcoming Garba nights (server-only; only shared nights ever reach other members). */
  garbaNights?: string[];
  /** Profile creation time in ms (for the "new here" boost); 0 when unknown. */
  createdAt?: number;
  lastActiveAt: number;
};

/** Why two people might click, shown on cards. The app turns ids into labels. */
export type MatchReason =
  | { kind: "interests"; ids: string[] }
  | { kind: "vibes"; ids: string[] }
  | { kind: "intentions"; ids: string[] }
  | { kind: "casual" }
  | { kind: "answer"; questionId: string; answer: string }
  | { kind: "nearby"; km: number }
  | { kind: "active" };

export type DiscoverProfile = {
  uid: string;
  displayName: string;
  age: number;
  gender: Gender;
  pronouns?: string;
  city?: string;
  bio?: string;
  photoUrls: string[];
  interests: string[];
  intentions: string[];
  vibes: string[];
  quickAnswers: QuickAnswer[];
  languages: string[];
  basics: ProfileBasics;
  lastActiveAt: number;
  distanceKm: number | null;
  superLikedYou: boolean;
  /** They only accept likes that carry a note. */
  requiresNote: boolean;
  /** Their photos are hidden until you match (photoUrls is empty). */
  photosPrivate: boolean;
  /** Joined in the last few days. */
  isNew: boolean;
  /** "Likes you" only: the note they sent with their like. */
  note?: string;
  /** 0–100, from the matchmaker. */
  photoVerified?: boolean;
  matchingSource?: "rules" | "ai";
  compatibility: number;
  reasons: MatchReason[];
  /** Both people are open to a one-night stand. */
  casualMatch: boolean;
  /** Their age-gap side; only sent to Plus members. */
  ageGap?: AgeGapSide;
  /** Garba edition only: how many of your Garba nights they're going to (never which ones). */
  garbaShared?: number;
};

export type FeedCursor = { lastActiveAt: number; uid: string };

export type MatchProfileSnippet = { displayName: string; photoUrl: string | null };

/** duos/{duoId}: two friends dating together. Written only by Cloud Functions. */
export type Duo = {
  id: string;
  /** Sorted uids. */
  members: string[];
  status: "active" | "ended";
  profiles: Record<string, MatchProfileSnippet>;
  createdAt: unknown;
  updatedAt: unknown;
  /** Most recent activity of either member, in ms; orders the duo feed. */
  lastActiveAt: number;
};

/** A pair in the Duo deck. Members are shaped like feed profiles (without any casual signal). */
export type DuoCard = {
  duoId: string;
  members: DiscoverProfile[];
  photoVerified?: boolean;
  matchingSource?: "rules" | "ai";
  compatibility: number;
  reasons: MatchReason[];
  /** This pair already liked yours. */
  likedYou: boolean;
};
