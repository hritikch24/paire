#!/usr/bin/env node
/**
 * Reads or changes the presence and paid-chat switches (Firestore runtime/presence,
 * and the paid-chat fields of runtime/trust, which the rules already read) on a real Firebase project, and backfills the chat-access
 * mirror before the gate goes on. Run it yourself; it needs admin credentials:
 *
 *   gcloud auth application-default login
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --status
 *
 *   # Presence ("Online" for matches), off by default:
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --presence on --idle-minutes 2 --confirm
 *
 *   # Paid chat. Announce first; enforcement starts at --enforce-from (ISO date/time):
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --backfill-chat-access --confirm
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --paid-chat on --enforce-from 2026-11-15T00:00:00+05:30 \
 *     [--legacy-grace-days 7] --confirm
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --unlock-sales on --confirm   # Razorpay
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --upi-sales on --confirm      # UPI to MUSE_UPI_VPA
 *
 *   # Roll back instantly (messages are never lost; sending is simply free again):
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --paid-chat off --confirm
 *
 * Without --confirm nothing is written: it prints what would change.
 * See docs/presence-and-paid-chat.md for the rollout order.
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
const has = (flag) => args.includes(flag);
const onOff = (flag) => {
  const raw = value(flag);
  if (raw === undefined) return undefined;
  if (raw !== "on" && raw !== "off") fail(`${flag} must be on or off`);
  return raw === "on";
};
function fail(message) {
  console.error(message);
  console.error("Usage: node scripts/set-runtime-flags.mjs --project <id> [--status] [--presence on|off] [--idle-minutes N] [--paid-chat on|off] [--enforce-from ISO] [--legacy-grace-days N] [--unlock-sales on|off] [--upi-sales on|off] [--backfill-chat-access] [--confirm]");
  process.exit(1);
}

const project = value("--project");
if (!project) fail("--project is required.");
if (process.env.FIRESTORE_EMULATOR_HOST) fail("FIRESTORE_EMULATOR_HOST is set; unset it to change a live project.");
const confirm = has("--confirm");

initializeApp({ credential: applicationDefault(), projectId: project });
const db = getFirestore();
const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: "scripts/set-runtime-flags.mjs" };

const presence = {};
const presenceOn = onOff("--presence");
if (presenceOn !== undefined) presence.enabled = presenceOn;
if (value("--idle-minutes") !== undefined) {
  const minutes = Number(value("--idle-minutes"));
  if (!Number.isFinite(minutes) || minutes < 0.5 || minutes > 30) fail("--idle-minutes must be between 0.5 and 30.");
  presence.idleTimeoutMs = Math.round(minutes * 60_000);
}

const chat = {};
const paidChat = onOff("--paid-chat");
if (paidChat !== undefined) chat.enforcePaidChat = paidChat;
if (value("--enforce-from") !== undefined) {
  const at = Date.parse(value("--enforce-from"));
  if (!Number.isFinite(at)) fail("--enforce-from must be an ISO date, e.g. 2026-11-15T00:00:00+05:30");
  chat.enforceFrom = at;
}
if (value("--legacy-grace-days") !== undefined) {
  const days = Number(value("--legacy-grace-days"));
  if (!Number.isFinite(days) || days < 0 || days > 90) fail("--legacy-grace-days must be between 0 and 90.");
  const from = chat.enforceFrom ?? (await db.doc("runtime/trust").get()).get("enforceFrom");
  if (!from) fail("--legacy-grace-days needs --enforce-from (the cutoff for older chats).");
  chat.legacyGraceUntil = days ? from + days * 24 * 60 * 60_000 : 0;
}
const sales = onOff("--unlock-sales");
if (sales !== undefined) chat.unlockSales = sales;
const upiSales = onOff("--upi-sales");
if (upiSales !== undefined) chat.upiSales = upiSales;

async function show() {
  const [presenceDoc, chatDoc] = await db.getAll(db.doc("runtime/presence"), db.doc("runtime/trust"));
  const iso = (ms) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : "—");
  console.log(`runtime/presence on ${project}:`, presenceDoc.exists ? { ...presenceDoc.data(), updatedAt: undefined } : "(missing: presence is off)");
  const c = chatDoc.data() ?? {};
  console.log(`paid chat (runtime/trust) on ${project}:`, chatDoc.exists ? { requireVerification: c.requireVerification, enforcePaidChat: c.enforcePaidChat === true, enforceFrom: iso(c.enforceFrom), legacyGraceUntil: iso(c.legacyGraceUntil), unlockSales: c.unlockSales === true, upiSales: c.upiSales === true } : "(missing: sending is free)");
}

/** Mirrors every member's current Plus and Unlimited Chat onto moderation/{uid}.chatAccess (what the rules read). */
async function backfill() {
  const now = Date.now();
  const access = new Map();
  for (const doc of (await db.collection("billing").where("expiresAt", ">", now).get()).docs) {
    access.set(doc.id, { unlimited: false, premiumUntil: doc.get("expiresAt") });
  }
  for (const doc of (await db.collection("chatUnlocks").where("status", "==", "active").get()).docs) {
    access.set(doc.id, { premiumUntil: 0, ...access.get(doc.id), unlimited: true });
  }
  let written = 0;
  for (const [uid, next] of access) {
    if (!(await db.doc(`users/${uid}`).get()).exists) continue; // Never recreate deleted accounts.
    if (confirm) await db.doc(`moderation/${uid}`).set({ chatAccess: { ...next, updatedAt: now } }, { merge: true });
    written += 1;
  }
  console.log(`${confirm ? "Mirrored" : "Would mirror"} chat access for ${written} member(s) with Plus or Unlimited Chat.`);
}

if (has("--backfill-chat-access")) await backfill();
for (const [path, edits] of [["runtime/presence", presence], ["runtime/trust", chat]]) {
  if (!Object.keys(edits).length) continue;
  if (confirm) await db.doc(path).set({ ...edits, ...stamp }, { merge: true });
  console.log(`${confirm ? "Set" : "Would set"} ${path}:`, edits);
}
if (!confirm && (Object.keys(presence).length || Object.keys(chat).length || has("--backfill-chat-access"))) console.log("Dry run. Add --confirm to write.");
await show();
