#!/usr/bin/env node
/** Inspect the opted-in browser audience; --confirm runs the normal consent/cap-checked job once. */
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
const { values } = parseArgs({ options: { project: { type: "string" }, confirm: { type: "boolean", default: false } } });
if (!/^[a-z][a-z0-9-]{4,62}$/.test(values.project ?? "")) throw Error("Usage: node scripts/run-engagement-reminders.mjs --project ID [--confirm]");
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error("Unset emulator variables; this operation uses the explicitly selected production project.");
const binary = process.env.PATH.split(":").map(dir => join(dir, "firebase")).find(existsSync);
if (!binary) throw Error("Install Firebase CLI and run firebase login first.");
const require = createRequire(import.meta.url), auth = require(resolve(dirname(realpathSync(binary)), "../auth.js"));
const account = auth.getProjectDefaultAccount(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
if (!account?.tokens?.refresh_token) throw Error("Run firebase login first.");
const token = await auth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/userinfo.email", "openid"]);
async function api(url, body, allowMissing = false) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (allowMissing && response.status === 404) return {};
  const data = await response.json();
  if (!response.ok) throw Error(`Admin request failed (${response.status}): ${data.error?.message ?? "unknown error"}`);
  return data;
}
const firestore = `https://firestore.googleapis.com/v1/projects/${values.project}/databases/(default)/documents`;
async function records(collectionId, fields, where) {
  const result = await api(`${firestore}:runQuery`, { structuredQuery: { from: [{ collectionId }], select: { fields: fields.map(fieldPath => ({ fieldPath })) }, ...(where ? { where } : {}) } });
  return result.flatMap(row => row.document ? [row.document] : []);
}
const [subscriptions, optedIn, runtime, jobs] = await Promise.all([
  records("webPushSubscriptions", ["uid"]),
  records("notificationReminders", ["enabled"], { fieldFilter: { field: { fieldPath: "enabled" }, op: "EQUAL", value: { booleanValue: true } } }),
  api(`${firestore}/runtime/notifications`, undefined, true),
  api(`https://cloudscheduler.googleapis.com/v1/projects/${values.project}/locations/us-central1/jobs`)
]);
const subscribed = new Set(subscriptions.map(doc => doc.fields?.uid?.stringValue).filter(Boolean));
const enabled = optedIn.map(doc => doc.name.split("/").at(-1));
const audience = enabled.filter(uid => subscribed.has(uid)).length;
const job = (jobs.jobs ?? []).find(job => job.name.endsWith("/firebase-schedule-sendEngagementReminders-us-central1"));
const switchEnabled = runtime.fields?.remindersEnabled?.booleanValue === true;
console.log(JSON.stringify({ project: values.project, mode: values.confirm ? "send normal eligible reminders" : "dry-run", registeredBrowsers: subscriptions.length, registeredMembers: subscribed.size, optedInMembers: enabled.length, optedInMembersWithBrowser: audience, remindersEnabled: switchEnabled, scheduler: job ? { name: job.name, state: job.state, schedule: job.schedule, timeZone: job.timeZone } : null, eligibility: "The server additionally checks inactivity, current profiles, blocks, visibility, verification, opt-out and the 2/week + 72-hour cap. No enrolment or fabricated events." }, null, 2));
if (!values.confirm) process.exit(0);
if (!switchEnabled || job?.state !== "ENABLED") throw Error("Reminder switch/job is disabled; this script will not change it.");
if (!audience) { console.log("No opted-in browser audience. No notifications sent and no preferences changed."); process.exit(0); }
const day = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
const stats = async () => {
  const data = await api(`${firestore}/notificationStats/${day}`, undefined, true);
  return Object.fromEntries(["attempts", "acceptedMembers", "acceptedPushes", "failedPushes"].map(field => [field, Number(data.fields?.[field]?.integerValue ?? 0)]));
};
const before = await stats();
await api(`https://cloudscheduler.googleapis.com/v1/${job.name}:run`, {});
console.log("Cloud Scheduler accepted the requested run. Existing consent, relevance and frequency checks still apply.");
await new Promise(resolve => setTimeout(resolve, 5000));
const after = await stats();
console.log(JSON.stringify({ before, after, deltaSoFar: Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]])), note: "Counters may continue updating. Push-service acceptance is not proof of notification display or reading." }, null, 2));
