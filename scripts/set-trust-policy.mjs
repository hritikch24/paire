#!/usr/bin/env node
/**
 * Sets the live photo-verification policy (Firestore runtime/trust) for a real
 * Firebase project. Run it yourself; it needs admin credentials:
 *
 *   gcloud auth application-default login
 *   node scripts/set-trust-policy.mjs --project muse-352ba --require-verification false --confirm
 *
 * true  (default, safest): only members with an approved live photo check can
 *       discover, match or message. Needs Didit configured (docs/production-integrations.md).
 * false (beta without Didit): everyone can date; reports, chat safety, blocking and
 *       moderation still apply. Switch to true as soon as live checks work.
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../firebase/functions/package.json", import.meta.url));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const project = value("--project");
const required = value("--require-verification");

if (!project || !["true", "false"].includes(required ?? "") || !args.includes("--confirm")) {
  console.error("Usage: node scripts/set-trust-policy.mjs --project <firebase-project-id> --require-verification true|false --confirm");
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST is set; unset it to change a live project (emulators use scripts/prepare-qa-emulators.cjs).");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: project });
await getFirestore()
  .doc("runtime/trust")
  .set({ requireVerification: required === "true", updatedAt: FieldValue.serverTimestamp(), updatedBy: "scripts/set-trust-policy.mjs" });
console.log(`runtime/trust.requireVerification = ${required} on ${project}`);
