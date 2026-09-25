import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
import { env } from "../config/env";
import { resolveEmulatorHost } from "../utils/emulatorHost";

const { initializeApp, getApp, getApps } = require("@firebase/app");
const {
  getAuth,
  connectAuthEmulator,
  initializeAuth,
  getReactNativePersistence
} = require("@firebase/auth/dist/rn");
const { getFirestore, connectFirestoreEmulator, initializeFirestore } = require("@firebase/firestore/dist/index.cjs.js");
const { getStorage, connectStorageEmulator } = require("@firebase/storage/dist/index.cjs.js");
const { getFunctions, connectFunctionsEmulator } = require("@firebase/functions/dist/index.cjs.js");

const firebaseConfig = env.firebase;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
      });
export const db =
  Platform.OS === "web"
    ? getFirestore(app)
    : initializeFirestore(app, {
        // React Native needs long polling to avoid stalled requests.
        experimentalForceLongPolling: true,
        useFetchStreams: false
      });
export const storage = getStorage(app);
export const functions = getFunctions(app);

if (env.useEmulator) {
  const rawHost = env.emulatorHost;
  const scriptURL = NativeModules?.SourceCode?.scriptURL ?? "";
  const host = resolveEmulatorHost(rawHost, Platform.OS, scriptURL);
  connectAuthEmulator(auth, `http://${host}:9099`);
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
  connectFunctionsEmulator(functions, host, 5001);
}
