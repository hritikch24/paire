// Browser persistence survives refresh; RN's auth build has no browser storage.
export * from "@firebase/auth/dist/browser-cjs/index.js";
export { browserLocalPersistence as webPersistence } from "@firebase/auth/dist/browser-cjs/index.js";
import { browserLocalPersistence } from "@firebase/auth/dist/browser-cjs/index.js";
export function getReactNativePersistence(_storage: unknown) { return browserLocalPersistence; }
