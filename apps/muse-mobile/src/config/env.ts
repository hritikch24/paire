import Constants from "expo-constants";

/**
 * Runtime environment. Release builds talk to the production Firebase project;
 * emulators and test hooks are development-only (`__DEV__`). The one exception
 * is a test-server build ("Paire Test", scripts/android/build-test-apk.sh), which
 * talks to the emulators on a developer's computer through a tunnel. That is set
 * in app.config.js, so the app's package name and its backend can't disagree.
 */
const isDev = typeof __DEV__ === "boolean" ? __DEV__ : false;
// Development builds read the native config baked into the installed app, so the
// variable (inlined by Metro) also turns it on: EXPO_PUBLIC_TEST_SERVER=true npx expo start
const isTestServer =
  Constants.expoConfig?.extra?.testServer === true || process.env.EXPO_PUBLIC_TEST_SERVER === "true";

// Firebase web config values are public identifiers, not secrets. Access is
// enforced by security rules and Cloud Functions.
const productionFirebase = {
  apiKey: "AIzaSyD30LSvbx2NCWulfLira3hD7cd6TxVjc4o",
  authDomain: "muse-352ba.firebaseapp.com",
  projectId: "muse-352ba",
  storageBucket: "muse-352ba.firebasestorage.app",
  messagingSenderId: "125120459010",
  appId: "1:125120459010:web:1c94b8e4f62c323ddc521b"
};

const envFirebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? ""
};

const isDemoProject = (projectId: string) => projectId.startsWith("demo-");

const hasEnvFirebase =
  Boolean(envFirebase.apiKey && envFirebase.authDomain && envFirebase.projectId) &&
  !isDemoProject(envFirebase.projectId);

const useEmulator =
  !isTestServer &&
  isDev &&
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR !== "false" &&
  (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true" || isDemoProject(envFirebase.projectId));

const emulatorProjectId = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_PROJECT_ID || "demo-muse";
const emulatorFirebase = {
  apiKey: "demo-api-key",
  authDomain: `${emulatorProjectId}.firebaseapp.com`,
  projectId: emulatorProjectId,
  storageBucket: `${emulatorProjectId}.appspot.com`,
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

export const env = {
  isDev,
  firebase: useEmulator || isTestServer ? emulatorFirebase : hasEnvFirebase ? envFirebase : productionFirebase,
  useEmulator,
  /** Test-server build: the server address is set in the app (services/testServer.ts). */
  testServer: isTestServer,
  emulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1",
  /** Must match the Cloud Functions region (FUNCTIONS_REGION). */
  functionsRegion: process.env.EXPO_PUBLIC_FUNCTIONS_REGION?.trim() || "us-central1",
  /** Maestro end-to-end runs against emulators; only honoured in development builds. */
  isE2E: isDev && process.env.EXPO_PUBLIC_E2E === "true"
};
