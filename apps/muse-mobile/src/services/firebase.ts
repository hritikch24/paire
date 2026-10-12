import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
// Firebase is imported by explicit CommonJS path on purpose. The React Native
// auth build `require`s "@firebase/app", while a bare ES import resolves (via the
// package "exports" map) to the ESM build: two copies of the component registry,
// and "Component auth has not been registered yet" at startup. Keep every
// runtime Firebase import on the same component registry (lint enforces the
// paths). Metro selects Firestore's RN transport on mobile and pins its app
// dependency to CJS, so native networking never uses browser Fetch streams.
import { getApp, getApps, initializeApp } from "@firebase/app/dist/index.cjs.js";
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth
} from "./authSdk";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore
} from "@firebase/firestore/dist/index.cjs.js";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  httpsCallableFromURL
} from "@firebase/functions/dist/index.cjs.js";
import { env } from "../config/env";
import { resolveEmulatorHost } from "../utils/emulatorHost";
import { PLACEHOLDER_HOST, PLACEHOLDER_ORIGIN } from "../utils/serverAddress";
import { installServerRouting, loadServerOrigin } from "./testServer";

if (env.testServer) {
  // Before any Firebase request: they go to a placeholder that is pointed at the
  // current test-server address as each one is sent.
  installServerRouting();
  void loadServerOrigin();
}

const app = getApps().length ? getApp() : initializeApp(env.firebase);

export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

export const db =
  Platform.OS === "web"
    ? getFirestore(app)
    : initializeFirestore(app, {
        // React Native's networking stalls on Firestore's streaming transport.
        experimentalForceLongPolling: true,
        ...(env.testServer ? { host: PLACEHOLDER_HOST, ssl: true } : {})
      });

export const functions = getFunctions(app, env.functionsRegion);

/** Host the emulators are reachable on from this device, when emulators are in use. */
export const emulatorHost = env.useEmulator
  ? resolveEmulatorHost(env.emulatorHost, Platform.OS, NativeModules?.SourceCode?.scriptURL ?? "")
  : null;

if (env.testServer) {
  connectAuthEmulator(auth, PLACEHOLDER_ORIGIN, { disableWarnings: true });
} else if (emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectFunctionsEmulator(functions, emulatorHost, 5001);
}

/** Base URL for the Firebase Storage REST API (photo uploads). */
export const storageApiBase = env.testServer
  ? PLACEHOLDER_ORIGIN
  : emulatorHost
    ? `http://${emulatorHost}:9199`
    : "https://firebasestorage.googleapis.com";

export const storageBucket = env.firebase.storageBucket;

/** Calls an HTTPS callable Cloud Function and returns its data. */
export async function callFunction<TResult>(name: string, data?: unknown, timeout = 30_000): Promise<TResult> {
  const options = { timeout };
  const callable = env.testServer
    ? httpsCallableFromURL(functions, `${PLACEHOLDER_ORIGIN}/${env.firebase.projectId}/${env.functionsRegion}/${name}`, options)
    : httpsCallable(functions, name, options);
  const result = await callable(data ?? {});
  return result.data as TResult;
}
