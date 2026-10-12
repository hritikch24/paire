import { readFileSync } from "fs";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
export const adminAuth = () => getAuth();
export const bucket = () => getStorage().bucket();

let pushApp: App | undefined;

/**
 * FCM sender. Deployed functions use the project's own credentials. The test
 * server (Firebase emulators) can't deliver pushes itself, so when
 * MUSE_PUSH_CREDENTIALS points at a service-account key for the real project it
 * sends through the real FCM instead (see docs/test-backend.md).
 */
export const messaging = () => {
  const keyFile = process.env.MUSE_PUSH_CREDENTIALS;
  if (keyFile && !pushApp) {
    const key = JSON.parse(readFileSync(keyFile, "utf8")) as { project_id: string };
    pushApp = initializeApp({ credential: cert(keyFile), projectId: key.project_id }, "push");
  }
  return getMessaging(pushApp);
};
