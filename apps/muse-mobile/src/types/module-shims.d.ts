// The app imports Firebase's React Native / CommonJS builds by path (see
// src/services/firebase.ts). These declarations map them to the public typings.

declare module "@firebase/app/dist/index.cjs.js" {
  export * from "firebase/app";
}

declare module "@firebase/auth/dist/rn" {
  import type { Persistence } from "firebase/auth";
  export * from "firebase/auth";
  export function getReactNativePersistence(storage: unknown): Persistence;
}

declare module "@firebase/auth/dist/browser-cjs/index.js" {
  export * from "firebase/auth";
}

declare module "@firebase/firestore/dist/index.cjs.js" {
  export * from "firebase/firestore";
}

declare module "@firebase/functions/dist/index.cjs.js" {
  export * from "firebase/functions";
}
