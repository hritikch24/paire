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

export type UserProfile = {
  uid: string;
  displayName: string;
  pronouns: string;
  age: number;
  city: string;
  bio: string;
  photoUrls: string[];
  interests: string[];
  intentions?: string[];
  vibes?: string[];
  vibePreference?: "any" | "shared";
  maxDistanceKm?: number;
  quickAnswers?: QuickAnswer[];
  location?: UserLocation | null;
  shareLocation?: boolean;
  createdAt: number;
  updatedAt: number;
  onboardingComplete: boolean;
  safetyConfirmed: boolean;
  lastActiveAt: number;
  isDiscoverable: boolean;
};

export type UserLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: number;
};

export type UserPrivateProfile = {
  email?: string;
  phone?: string;
};

export type SwipeType = "like" | "nope" | "super";

export type SwipeRecord = {
  fromUid: string;
  toUid: string;
  type: SwipeType;
  createdAt: number;
};

export type MatchSummary = {
  id: string;
  participants: string[];
  createdAt: number;
  updatedAt: number;
  active?: boolean;
  endedAt?: number;
  endedBy?: string;
  endReason?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCounts?: Record<string, number>;
  otherUserId?: string;
  otherUser?: UserProfile;
};

export type ChatMessage = {
  id: string;
  matchId: string;
  senderId: string;
  text?: string;
  imageUrl?: string;
  createdAt: number;
  readBy: string[];
};

export type ReportRecord = {
  id: string;
  reporterId: string;
  targetId: string;
  reason: string;
  createdAt: number;
};

export type BlockRecord = {
  id: string;
  blockedAt: number;
};
