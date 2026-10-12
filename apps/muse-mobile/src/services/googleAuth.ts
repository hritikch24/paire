import { doc, getDoc } from "@firebase/firestore/dist/index.cjs.js";
import { Platform } from "react-native";
import { legal } from "../config/legal";
import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup } from "./authSdk";
import { auth, db } from "./firebase";
import { updatePrivateInfo } from "./profileService";

/**
 * "Continue with Google" uses Firebase's own Google provider (enable it in the
 * Firebase console; no client id is needed in the app). Browser only for now:
 * the Android/iOS apps need a native Google Sign-In library and signing keys.
 */
export const googleSignInAvailable = Platform.OS === "web";

function provider() {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: "select_account" });
  return google;
}

/**
 * Signs in (or up) with Google. The first time, it records the Terms/Privacy
 * version accepted on the screen that offered the button, as email sign-up does.
 * New members then go through the 18+ birthday step like everyone else.
 */
export async function signInWithGoogle(): Promise<void> {
  const credential = await signInWithPopup(auth, provider());
  const { uid, email } = credential.user;
  const info = await getDoc(doc(db, "users", uid, "private", "info")).catch(() => null);
  if (!info?.get("termsAcceptedAt")) {
    await updatePrivateInfo(uid, {
      ...(email ? { email: email.toLowerCase() } : {}),
      termsAcceptedAt: Date.now(),
      termsVersion: legal.termsVersion
    });
  }
}

/** Members who joined with Google confirm sensitive actions with Google instead of a password. */
export function hasPasswordLogin(): boolean {
  return Boolean(auth.currentUser?.providerData.some((entry) => entry.providerId === "password"));
}

export async function reauthenticateWithGoogle(): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in");
  await reauthenticateWithPopup(auth.currentUser, provider());
}
