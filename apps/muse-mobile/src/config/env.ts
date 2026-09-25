const envFirebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? ""
};

const productionFirebase = {
  apiKey: "AIzaSyD30LSvbx2NCWulfLira3hD7cd6TxVjc4o",
  authDomain: "muse-352ba.firebaseapp.com",
  projectId: "muse-352ba",
  storageBucket: "muse-352ba.appspot.com",
  messagingSenderId: "125120459010",
  appId: "1:125120459010:web:1c94b8e4f62c323ddc521b"
};

const hasEnvFirebase =
  Boolean(envFirebase.apiKey) &&
  Boolean(envFirebase.authDomain) &&
  Boolean(envFirebase.projectId) &&
  envFirebase.projectId !== "demo-muse";

const isDev = typeof __DEV__ === "boolean" ? __DEV__ : false;
const allowEmulator = isDev;

const emulatorFlag = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR;
const explicitUseEmulator = emulatorFlag === "true";
const explicitDisableEmulator = emulatorFlag === "false";

const useEmulator =
  allowEmulator &&
  !explicitDisableEmulator &&
  (explicitUseEmulator || envFirebase.projectId === "demo-muse");

const emulatorProjectId = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_PROJECT_ID || "demo-muse";
const emulatorFirebase = {
  apiKey: envFirebase.apiKey || "AIzaSyD-LOCAL-DEV-KEY-0000000000000",
  authDomain: `${emulatorProjectId}.firebaseapp.com`,
  projectId: emulatorProjectId,
  storageBucket: envFirebase.storageBucket || `${emulatorProjectId}.appspot.com`,
  messagingSenderId: envFirebase.messagingSenderId || "000000000000",
  appId: envFirebase.appId || "1:000000000000:web:0000000000000000000000"
};

export const env = {
  firebase: useEmulator
    ? emulatorFirebase
    : hasEnvFirebase
      ? envFirebase
      : productionFirebase,
  useEmulator,
  emulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1"
};
