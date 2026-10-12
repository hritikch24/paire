/**
 * Region for every function. Keep it in the same location as the Firestore
 * database (Firebase console → Firestore → location) and mirror it in the app's
 * EXPO_PUBLIC_FUNCTIONS_REGION. Override with FUNCTIONS_REGION in functions/.env.
 */
export const REGION = process.env.FUNCTIONS_REGION || "us-central1";

/**
 * Free daily allowance, the same for everyone. Fewer, better likes: a scarce like
 * is a considered one, which cuts the flood women get and makes each like count.
 */
export const LIMITS = {
  likesPerDay: 25,
  supersPerDay: 1,
  passesPerDay: 1000,
  feedCallsPerDay: 500,
  aiOpenersPerDay: 60,
  aiBiosPerDay: 20,
  duoLikesPerDay: 60,
  duoFeedCallsPerDay: 100,
  /** Codes entered per day: keeps guessing codes hopeless (31^6 possibilities). */
  duoCodeTriesPerDay: 10,
  chatProfilesPerDay: 100
} as const;

/** Paire Plus (a fixed-duration pass) raises the allowance and gives priority likes. */
export const PLUS_LIMITS = { likesPerDay: 100, supersPerDay: 5 } as const;

export const SPARKS = {
  /** A note sent with a like. */
  noteMaxLength: 140,
  /** New members get a gentle ranking boost for this long. */
  newMemberHours: 72
} as const;

export const DUOS = {
  /** How long a friend has to accept an invite code. */
  inviteHours: 48,
  /** Either friend can take back a like for this long (if it hasn't matched yet). */
  undoMinutes: 10,
  /** A duo's lastActiveAt is refreshed at most this often (it orders everyone's deck). */
  activityRefreshMinutes: 10,
  /** Active duos scanned per feed call, newest activity first. */
  feedScan: 300,
  pageSize: 20
} as const;

export const FEED = {
  /** Profiles returned per call. */
  pageSize: 20,
  /** Discovery index docs read per query round. */
  scanBatch: 100,
  /** Upper bound on index docs scanned per call, to cap cost. */
  maxScan: 600
} as const;

export const MODERATION = {
  /** Distinct reporters within the window before a profile is auto-hidden for review. */
  hideAfterDistinctReporters: 3,
  windowDays: 30
} as const;

export const MESSAGE_PREVIEW_LENGTH = 120;

export const CHAT_SAFETY = {
  /**
   * A sender is hidden from discovery for review after this many open serious
   * (high) flags within the window in at least `minChats` different chats
   * (a Duo chat counts once, however many people are in it), or
   * `hideAfterHighFlagsAlone` in any. One under-18 flag hides at once.
   */
  hideAfterHighFlags: 3,
  minChats: 2,
  hideAfterHighFlagsAlone: 5,
  windowDays: 30,
  /** Flag records delete themselves after this (TTL policy on chatFlags.expireAt). */
  flagRetentionDays: 365,
  /** AI second opinions per sender per day (cost cap); rules alone after that. */
  aiReviewsPerDay: 40,
  /** A small, fast model: the recipient's notification waits for it. */
  model: process.env.MUSE_SAFETY_MODEL || "claude-haiku-5-5",
  timeoutMs: 6000,
  /** Shown in the chat list instead of a hidden message. */
  hiddenPreview: "Message hidden by Paire AI"
} as const;
