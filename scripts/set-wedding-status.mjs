#!/usr/bin/env node
/**
 * Hides (or restores) a Wedding Nods wedding. A hidden wedding shows no guests and takes no
 * nods or joins; nothing is deleted. Run it yourself; it needs admin credentials:
 *
 *   gcloud auth application-default login
 *   node scripts/set-wedding-status.mjs --project muse-352ba --wedding <weddingId> --status hidden --confirm
 *
 * The wedding id is on the wedding document (Firebase console → Firestore → weddings), or in
 * a report about a wedding guest (reports/{id}.weddingId). --status open restores it.
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
const weddingId = value("--wedding");
const status = value("--status");

if (!project || !/^[A-Za-z0-9]{20}$/.test(weddingId ?? "") || !["hidden", "open"].includes(status ?? "") || !args.includes("--confirm")) {
  console.error("Usage: node scripts/set-wedding-status.mjs --project <firebase-project-id> --wedding <weddingId> --status hidden|open --confirm");
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST is set; unset it to change a live project.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: project });
const ref = getFirestore().doc(`weddings/${weddingId}`);
if (!(await ref.get()).exists) {
  console.error("No such wedding.");
  process.exit(1);
}
await ref.update({ status, statusChangedAt: FieldValue.serverTimestamp() });
console.log(`Wedding ${weddingId} is now ${status}.`);
