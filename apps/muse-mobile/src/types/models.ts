import type { WorkSector } from "../data/workCircles";

export type MuseCard = {
  id: string;
  title: string;
  emoji: string;
  description: string;
};

export type QuickAnswer = {
  questionId: string;
  answer: string;
};

/** Paire is for men and women. */
export const GENDERS = ["woman", "man"] as const;
export type Gender = (typeof GENDERS)[number];

/** users/{uid}: public profile, visible to discovery (via the server) and to matches. */
export type UserProfile = {
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
  /** Language ids from data/basics. */
  languages?: string[];
  basics?: ProfileBasics;
  /** Optional public work sector, self-declared. */
  workSector?: WorkSector | null;
  isDiscoverable: boolean;
  onboardingComplete: boolean;
  safetyConfirmed?: boolean;
  createdAt?: number;
  updatedAt?: number;
  lastActiveAt?: number;
};

/** Optional Indian basics. There is deliberately no caste field. */
export type ProfileBasics = {
  heightCm?: number;
  education?: string;
  work?: string;
  religion?: string;
  diet?: string;
  drinking?: string;
  smoking?: string;
};

export type UserLocation = {
  lat: number;
  lng: number;
  updatedAt: number;
};

/** Age-gap dating: a Silver Fox / Cougar (35+), or someone into an older partner. */
export type AgeGapSide = "older" | "intoOlder";

/** users/{uid}/private/settings: owner-only preferences. */
export type UserSettings = {
  showMe: Gender[];
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number | null;
  locationEnabled: boolean;
  location: UserLocation | null;
  /** Explicit opt-in to external AI processing of fixed profile choices. */
  aiVibeMatching?: boolean;
  sharedVibesOnly: boolean;
  /** Open to a one-night stand. Private: only revealed to someone who also opted in. */
  openToCasual: boolean;
  notifications: { matches: boolean; messages: boolean; previews?: boolean; reminders?: boolean };
  /** Privacy and control ("her rules"), free for everyone. */
  requireNote?: boolean;
  firstMove?: boolean;
  incognito?: boolean;
  privatePhotos?: boolean;
  sameIntentOnly?: boolean;
  sharedLanguageOnly?: boolean;
  /** My age-gap side; only Paire Plus members see it or can filter by it. */
  ageGap?: AgeGapSide | null;
  /** Garba Nights: the nights ("YYYY-MM-DD", IST) I'm going to Garba this Navratri. */
  garbaNights?: string[] | null;
  /** Voluntary Diwali plans. Dates stay private; never describes living arrangements. */
  diwaliPlan?: { dates: string[]; vibes: string[] } | null;
  /** Show matches when I'm online and when I was last active. Missing = shown. */
  showPresence?: boolean;
  updatedAt?: number;
};

/** users/{uid}/private/info: owner-only account details. */
export type PrivateInfo = {
  email?: string;
  birthDate?: string;
  termsAcceptedAt?: number;
  termsVersion?: string;
};

/** A candidate returned by the getDiscoverFeed Cloud Function. */
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
  languages?: string[];
  basics?: ProfileBasics;
  /** Optional public work sector, self-declared. */
  workSector?: WorkSector | null;
  lastActiveAt: number;
  distanceKm: number | null;
  superLikedYou: boolean;
  /** They only accept likes that carry a note. */
  requiresNote?: boolean;
  /** Their photos stay hidden until you match (photoUrls is empty). */
  photosPrivate?: boolean;
  /** Joined in the last few days. */
  isNew?: boolean;
  /** "Likes you": the note they sent with their like. */
  note?: string;
  /** 0–100 ranking hint based on shared profile choices, not a probability. */
  photoVerified?: boolean;
  matchingSource?: "rules" | "ai";
  compatibility?: number;
  reasons?: MatchReason[];
  /** Both people are open to a one-night stand. */
  casualMatch?: boolean;
  /** Their age-gap side; only sent to Paire Plus members. */
  ageGap?: AgeGapSide;
  /** Garba edition only: how many of your Garba nights they're going to (never which ones). */
  garbaShared?: number;
  /** Only overlapping activity labels and a count, never another member’s dates. */
  diwaliShared?: { days: number; vibes: string[] };
};

/** Why two people might click. Server-generated; ids are formatted by utils/insights. */
export type MatchReason =
  | { kind: "interests"; ids: string[] }
  | { kind: "vibes"; ids: string[] }
  | { kind: "intentions"; ids: string[] }
  | { kind: "casual" }
  | { kind: "answer"; questionId: string; answer: string }
  | { kind: "nearby"; km: number }
  | { kind: "active" };

export type FeedCursor = { lastActiveAt: number; uid: string };

export type SwipeType = "like" | "nope" | "super";

export type SwipeResult = {
  matched: boolean;
  matchId: string | null;
  remaining: { likes: number | null; supers: number };
};

export type MatchProfileSnippet = { displayName: string; photoUrl: string | null };

export type Match = {
  id: string;
  /** "duo": two pairs of friends in one chat (up to 4 people). */
  kind: "pair" | "duo";
  /** Duo chats: each pair's duo id and its members still in the chat. */
  sides: Record<string, string[]>;
  participants: string[];
  active: boolean;
  createdAt: number;
  lastActivityAt: number;
  profiles: Record<string, MatchProfileSnippet>;
  lastMessage: { text: string; senderId: string; createdAt: number } | null;
  unread: Record<string, number>;
  lastReadAt: Record<string, number>;
  superLikedBy: string[];
  /** Notes sent with each person's like, by uid. */
  sparks?: Record<string, string>;
  /** "I'll message first": only this member can send the first message. */
  firstMoveBy?: string | null;
  endReason?: string;
};

/** Two friends dating together. */
export type Duo = {
  id: string;
  members: string[];
  profiles: Record<string, MatchProfileSnippet>;
};

/** A pair in the Duo deck. */
export type DuoCard = {
  duoId: string;
  members: DiscoverProfile[];
  photoVerified?: boolean;
  matchingSource?: "rules" | "ai";
  compatibility: number;
  reasons: MatchReason[];
  /** They already liked your pair. */
  likedYou: boolean;
};

/** A like or pass your pair sent, as both friends see it. */
export type DuoSwipeRecord = {
  targetDuoId: string;
  type: "like" | "nope";
  byUid: string;
  target: Array<{ uid: string; displayName: string; photoUrl: string | null }>;
  createdAt: number;
};

/** Someone who entered your code and is waiting for you to confirm. */
export type DuoJoinRequest = { uid: string; displayName: string; photoUrl: string | null; age: number | null };

export type DuoInvite = { code: string; expiresAt: number; request: DuoJoinRequest | null };

/** A code you entered: waiting for your friend to confirm. */
export type DuoPendingRequest = { toName: string; toPhotoUrl: string | null };

export type SafetyCategory =
  | "money"
  | "off_platform"
  | "harassment"
  | "threat"
  | "minor"
  | "solicitation"
  | "link";

/** Set by the server's chat-safety check on messages that look risky. */
export type MessageSafety = {
  category: SafetyCategory;
  severity: "low" | "medium" | "high";
  /** Abusive text is hidden behind a tap. */
  hidden: boolean;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  pending?: boolean;
  failed?: boolean;
  safety?: MessageSafety;
};

export const REPORT_REASONS = [
  { id: "fake_profile", label: "Fake profile or catfish" },
  { id: "inappropriate_content", label: "Inappropriate photos or messages" },
  { id: "harassment", label: "Harassment or threats" },
  { id: "underage", label: "May be under 18" },
  { id: "scam_or_spam", label: "Scam, spam or asking for money" },
  { id: "offline_behavior", label: "Unsafe behaviour when we met" },
  { id: "other", label: "Something else" }
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
