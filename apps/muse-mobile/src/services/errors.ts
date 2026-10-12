const OFFLINE = "You seem to be offline. Check your connection and try again.";
const WRONG_LOGIN = "That email and password don't match. Try again, or reset your password.";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": WRONG_LOGIN,
  "auth/invalid-login-credentials": WRONG_LOGIN,
  "auth/wrong-password": WRONG_LOGIN,
  "auth/user-not-found": WRONG_LOGIN,
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-email": "Enter your email address.",
  "auth/missing-password": "Enter your password.",
  "auth/email-already-in-use": "An account already uses this email. Try signing in instead.",
  "auth/weak-password": "Choose a stronger password with at least 8 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": OFFLINE,
  "auth/requires-recent-login": "For your security, enter your password again.",
  "auth/user-disabled": "This account has been disabled. Contact support if you think this is a mistake.",
  "auth/operation-not-allowed": "That sign-in method isn't turned on yet. Please use email, or contact support.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/account-exists-with-different-credential":
    "This email already has a Paire account. Sign in with your email and password instead.",
  "auth/unauthorized-domain": "Google sign-in isn't set up for this web address yet. Please use email for now.",
  "auth/user-mismatch": "Choose the same Google account you signed in with.",
  "functions/unavailable": OFFLINE,
  "functions/deadline-exceeded": "That took too long. Please try again.",
  "functions/unauthenticated": "Your session expired. Please sign in again.",
  unavailable: OFFLINE,
  "permission-denied": "You don't have access to that anymore.",
  "deadline-exceeded": "That took too long. Please try again."
};

/** Our Cloud Functions send user-facing messages with these error codes. */
const PASSTHROUGH_CODES = new Set([
  "functions/resource-exhausted",
  "functions/failed-precondition",
  "functions/not-found",
  "functions/invalid-argument",
  "functions/permission-denied"
]);

/** The member closed the Google window: not an error worth showing. */
export function isCancelledPopup(error: unknown): boolean {
  const code = errorCode(error);
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}

export function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const code = errorCode(error);
  if (code && PASSTHROUGH_CODES.has(code) && error instanceof Error && error.message) {
    return error.message;
  }
  if (code && MESSAGES[code]) {
    return MESSAGES[code];
  }
  if (error instanceof Error && /network|timed? ?out|offline/i.test(error.message)) {
    return OFFLINE;
  }
  return fallback;
}
