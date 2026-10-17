#!/usr/bin/env node
// Explicit owner-only provisioning. Never run as part of build or deployment.
import { createRequire } from "node:module";
const require = createRequire(new URL("../firebase/functions/package.json", import.meta.url));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
if (!args.includes("--project") || !args.includes("--email") || !["on", "off"].includes(value("--access"))) {
  console.error("Usage: node scripts/set-support-access.mjs --project <id> --email <owner-email> --access on|off [--confirm]");
  process.exit(1);
}
const projectId = value("--project");
if ((process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) && !projectId.startsWith("demo-")) throw new Error("Emulator provisioning requires a demo project.");
initializeApp({ projectId, ...(projectId.startsWith("demo-") ? {} : { credential: applicationDefault() }) });
const user = await getAuth().getUserByEmail(value("--email"));
if (user.uid.startsWith("support_") || user.disabled) throw new Error("Choose an enabled owner account.");
const enabled = value("--access") === "on";
console.log(`${args.includes("--confirm") ? "Applying" : "Dry run:"} support access ${enabled ? "on" : "off"} for ${user.uid} in ${projectId}.`);
if (args.includes("--confirm")) {
  // Disable the live check first when revoking; existing support tabs lose data access immediately.
  if (!enabled) await getFirestore().doc(`supportOperators/${user.uid}`).set({ enabled: false, updatedAt: Date.now() }, { merge: true });
  await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, ...(enabled ? { moderator: true } : {}), supportAccess: enabled });
  if (enabled) await getFirestore().doc(`supportOperators/${user.uid}`).set({ enabled: true, updatedAt: Date.now() }, { merge: true });
  console.log("Done. Sign out and back in to refresh the admin menu.");
}
