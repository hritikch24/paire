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
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --upi-sales on --confirm      # UPI to MUSE_UPI_VPA (chat + Plus)
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --razorpay-plus off --confirm # stop new Razorpay Plus sales
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --ccavenue-sales on --confirm # CCAvenue (chat + Plus)
 *
 *   # Accept likes and women reply free (both off by default; Gifts stay off until built and approved):
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --backfill-free-sender --confirm # mirror freeSender for every woman (and clear it for anyone no longer one), first
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --accept-flow on --confirm      # women can accept likes
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --women-send-free on --confirm  # women send free in all their chats
 *   node scripts/set-runtime-flags.mjs --project muse-352ba --gift-sales on --confirm       # gifted Plus passes
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
const { getFirestore, FieldValue, FieldPath } = require("firebase-admin/firestore");
import { freeSenderClearMerge, freeSenderMerge, planFreeSenderBackfill, planFreeSenderClear, womenUids } from "./lib/free-sender-backfill.mjs";

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
  console.error("Usage: node scripts/set-runtime-flags.mjs --project <id> [--status] [--presence on|off] [--idle-minutes N] [--paid-chat on|off] [--enforce-from ISO] [--legacy-grace-days N] [--unlock-sales on|off] [--upi-sales on|off] [--razorpay-plus on|off] [--ccavenue-sales on|off] [--accept-flow on|off] [--women-send-free on|off] [--gift-sales on|off] [--backfill-chat-access] [--backfill-free-sender] [--confirm]");
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
const razorpayPlus = onOff("--razorpay-plus");
if (razorpayPlus !== undefined) chat.razorpayPlusSales = razorpayPlus;
const ccavenueSales = onOff("--ccavenue-sales");
if (ccavenueSales !== undefined) chat.ccavenueSales = ccavenueSales;
const acceptFlow = onOff("--accept-flow");
if (acceptFlow !== undefined) chat.acceptFlow = acceptFlow;
const womenSendFree = onOff("--women-send-free");
if (womenSendFree !== undefined) chat.womenSendFree = womenSendFree;
const giftSales = onOff("--gift-sales");
if (giftSales !== undefined) chat.giftSales = giftSales;

async function show() {
  const [presenceDoc, chatDoc] = await db.getAll(db.doc("runtime/presence"), db.doc("runtime/trust"));
  const iso = (ms) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : "—");
  console.log(`runtime/presence on ${project}:`, presenceDoc.exists ? { ...presenceDoc.data(), updatedAt: undefined } : "(missing: presence is off)");
  const c = chatDoc.data() ?? {};
  console.log(`paid chat (runtime/trust) on ${project}:`, chatDoc.exists ? { requireVerification: c.requireVerification, enforcePaidChat: c.enforcePaidChat === true, enforceFrom: iso(c.enforceFrom), legacyGraceUntil: iso(c.legacyGraceUntil), unlockSales: c.unlockSales === true, upiSales: c.upiSales === true, razorpayPlusSales: c.razorpayPlusSales !== false, ccavenueSales: c.ccavenueSales === true, acceptFlow: c.acceptFlow === true, womenSendFree: c.womenSendFree === true, giftSales: c.giftSales === true } : "(missing: sending is free)");
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

/**
 * Mirrors freeSender = true onto moderation/{uid}.chatAccess for every woman (users.gender == "woman"),
 * so the rules can let her send free once womenSendFree is on. It also CLEARS (sets false) freeSender for
 * members whose mirror says true but whose users/{uid}.gender is no longer "woman". Existing unlimited,
 * premiumUntil and premiumLifetime are kept (merge). Only existing accounts: deleted ones have no users
 * doc and get nothing.
 */
async function backfillFreeSender() {
  const now = Date.now();
  let women = 0;
  let alreadySet = 0;
  let written = 0;
  let after;
  for (;;) {
    let query = db.collection("users").where("gender", "==", "woman").orderBy(FieldPath.documentId()).select("gender").limit(300);
    if (after) query = query.startAfter(after);
    const page = await query.get();
    if (page.empty) break;
    const uids = womenUids(page.docs.map((doc) => ({ uid: doc.id, gender: doc.get("gender") })));
    const mirrors = new Map();
    for (const doc of uids.length ? await db.getAll(...uids.map((uid) => db.doc(`moderation/${uid}`)), { fieldMask: ["chatAccess"] }) : []) mirrors.set(doc.id, doc.get("chatAccess"));
    const plan = planFreeSenderBackfill(uids, mirrors);
    women += uids.length;
    alreadySet += plan.alreadySet;
    if (confirm && plan.toWrite.length) {
      const batch = db.batch();
      for (const uid of plan.toWrite) batch.set(db.doc(`moderation/${uid}`), freeSenderMerge(now), { merge: true });
      await batch.commit();
    }
    written += plan.toWrite.length;
    after = page.docs[page.docs.length - 1];
  }
  console.log(`${confirm ? "Mirrored" : "Would mirror"} freeSender for ${written} of ${women} women (${alreadySet} already had it).`);

  // Stale flags: the mirror says freeSender but the account is not a woman's any more.
  let flagged = 0;
  let cleared = 0;
  let keptFlag = 0;
  let missing = 0;
  let afterFlag;
  for (;;) {
    let query = db.collection("moderation").where("chatAccess.freeSender", "==", true).orderBy(FieldPath.documentId()).select().limit(300);
    if (afterFlag) query = query.startAfter(afterFlag);
    const page = await query.get();
    if (page.empty) break;
    const uids = page.docs.map((doc) => doc.id);
    const users = new Map();
    for (const doc of await db.getAll(...uids.map((uid) => db.doc(`users/${uid}`)), { fieldMask: ["gender"] })) users.set(doc.id, { exists: doc.exists, gender: doc.get("gender") });
    const plan = planFreeSenderClear(uids, users);
    flagged += uids.length;
    keptFlag += plan.kept;
    missing += plan.skippedMissing;
    if (confirm && plan.toClear.length) {
      const batch = db.batch();
      for (const uid of plan.toClear) batch.set(db.doc(`moderation/${uid}`), freeSenderClearMerge(now), { merge: true });
      await batch.commit();
    }
    cleared += plan.toClear.length;
    afterFlag = page.docs[page.docs.length - 1];
  }
  console.log(`${confirm ? "Cleared" : "Would clear"} freeSender for ${cleared} of ${flagged} flagged members who are no longer women (${keptFlag} still women, ${missing} without an account left alone).`);
}

if (has("--backfill-chat-access")) await backfill();
if (has("--backfill-free-sender")) await backfillFreeSender();
for (const [path, edits] of [["runtime/presence", presence], ["runtime/trust", chat]]) {
  if (!Object.keys(edits).length) continue;
  if (confirm) await db.doc(path).set({ ...edits, ...stamp }, { merge: true });
  console.log(`${confirm ? "Set" : "Would set"} ${path}:`, edits);
}
if (!confirm && (Object.keys(presence).length || Object.keys(chat).length || has("--backfill-chat-access") || has("--backfill-free-sender"))) console.log("Dry run. Add --confirm to write.");
await show();
