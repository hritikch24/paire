import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from "./authSdk";
import { legal } from "../config/legal";
import { useAuthStore } from "../store/authStore";
import { useMatchesStore } from "../store/matchesStore";
import { isDisposableEmail } from "../utils/disposableEmail";
import { errorCode } from "./errors";
import { auth, callFunction } from "./firebase";
import { unregisterPushToken } from "./notificationService";
import { reauthenticateWithGoogle } from "./googleAuth";
import { updatePrivateInfo } from "./profileService";
import { queryClient } from "./queryClient";

export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, normalizeEmail(email), password);
}

/** Creates the account and records which Terms/Privacy version the member accepted. */
export async function signUp(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
  await updatePrivateInfo(credential.user.uid, {
    email: credential.user.email ?? normalizeEmail(email),
    termsAcceptedAt: Date.now(),
    termsVersion: legal.termsVersion
  });
  // Paire needs a real inbox: the member confirms it before setting up a profile.
  await sendEmailVerification(credential.user).catch(() => undefined);
  return credential;
}

export async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await sendEmailVerification(user);
}

/**
 * "confirmed" once the member has opened the link in the confirmation email.
 * Refreshes the session token (the rules read `email_verified` from it) and asks
 * the server to record it, which unlocks discovery. "throwaway" means a temporary
 * inbox, which Paire doesn't accept even when confirmed.
 */
export async function checkEmailVerified(): Promise<"confirmed" | "pending" | "throwaway"> {
  const user = auth.currentUser;
  if (!user) return "pending";
  await user.reload();
  const current = auth.currentUser;
  if (!current?.emailVerified) return "pending";
  if (isDisposableEmail(current.email)) return "throwaway";
  await current.getIdToken(true);
  // Best effort: the server re-checks on its own when the profile is first saved.
  await callFunction("syncAccountChecks").catch(() => undefined);
  useAuthStore.getState().markEmailVerified();
  return "confirmed";
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, normalizeEmail(email));
}

async function reauthenticate(password: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("Not signed in");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

function clearLocalSession() {
  queryClient.clear();
  useMatchesStore.getState().reset();
  useAuthStore.getState().reset();
}

export async function signOut() {
  const uid = auth.currentUser?.uid;
  if (uid) {
    // Stop pushes to this device for the account that is leaving.
    await unregisterPushToken(uid).catch(() => undefined);
  }
  await firebaseSignOut(auth);
  clearLocalSession();
}

const SESSION_GONE = new Set([
  "auth/user-token-expired",
  "auth/user-not-found",
  "auth/invalid-user-token",
  "auth/user-disabled"
]);

/**
 * Test-server builds: checks the saved session once the server is reachable. At
 * startup Firebase may have checked it against an old server address and kept
 * it; if the host has since reset the test data, the account is gone.
 */
export async function revalidateSession() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return;
  try {
    await user.reload();
  } catch (error) {
    if (SESSION_GONE.has(errorCode(error) ?? "")) await signOut();
  }
}

/**
 * Permanently deletes the account. The password (or, for Google accounts, a fresh
 * Google sign-in) is checked first so a borrowed, unlocked phone can't be used to
 * wipe someone's account.
 */
export async function deleteAccount(password: string | null) {
  if (password === null) await reauthenticateWithGoogle();
  else await reauthenticate(password);
  const uid = auth.currentUser?.uid;
  if (uid) {
    await unregisterPushToken(uid).catch(() => undefined);
  }
  await callFunction("deleteAccount");
  await firebaseSignOut(auth).catch(() => undefined);
  clearLocalSession();
}
