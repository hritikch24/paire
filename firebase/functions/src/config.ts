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

/**
 * Activity-based presence ("Online" in matches and chat). Online means recently
 * interacting with Paire in a foreground session, never just an open tab. The
 * live values come from runtime/presence (see docs/presence-and-paid-chat.md);
 * these are the defaults and the bounds an admin can set them within.
 */
export const PRESENCE = {
  /** Offline after this long without a meaningful interaction. */
  idleTimeoutMs: 2 * 60_000,
  idleTimeoutBoundsMs: [10_000, 30 * 60_000],
  /** A session's lease lapses this long after its last heartbeat (crashes, lost connections). */
  leaseMs: 90_000,
  leaseBoundsMs: [10_000, 10 * 60_000],
  /** Beats closer together than this, for the same session and state, are ignored. */
  minBeatIntervalMs: 5_000,
  /** Sessions kept per member (tabs and devices); the stalest are dropped first. */
  maxSessions: 10,
  /** Sessions whose lease lapsed this long ago are pruned on the next beat. */
  pruneAfterMs: 15 * 60_000,
  /** Members one getPresence call can ask about. */
  maxTargets: 50,
  /** "Last active" is not shown beyond this. */
  lastActiveHorizonMs: 30 * 24 * 60 * 60_000,
  /** Discovery recency for members who hide their activity is kept only in steps this big. */
  hiddenRecencyStepMs: 60 * 60_000
} as const;

/**
 * Unlimited Chat: a one-time, account-wide unlock that lets the buyer send
 * messages in every current and future mutual match. Messaging only: never
 * Paire Plus's likes, priority or filters. Price in paise, GST inclusive.
 * Never trust a client amount.
 */
export const CHAT_UNLOCK = {
  product: "paire_unlimited_chat",
  amountPaise: 4900,
  currency: "INR",
  /** Shown in Razorpay Checkout and on the receipt. */
  label: "Paire Unlimited Chat · one-time ₹49 unlock",
  /** An open checkout is reused (not replaced) for this long, so two tabs can't take two payments. */
  checkoutReuseMs: 6 * 60 * 60_000,
  /** A checkout being created blocks a second one for this long. */
  creatingLockMs: 30_000,
  ordersPerDay: 20,
  accessChecksPerDay: 400
} as const;
