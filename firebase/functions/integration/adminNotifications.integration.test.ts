import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
jest.mock("../src/webPush", () => ({ WEB_PUSH_SECRETS: [], sendWebPushToUser: jest.fn(async () => ({ accepted: 1, failed: 0 })) }));
if (!getApps().length) initializeApp({ projectId: "demo-muse" });
const api = require("../src/adminNotifications") as typeof import("../src/adminNotifications");
const { sendWebPushToUser } = require("../src/webPush") as typeof import("../src/webPush");
const { buildDiscoveryEntry } = require("../src/lib/discovery") as typeof import("../src/lib/discovery");
const db = getFirestore(), day = 86_400_000;
let owner: string, viewer: string, target: string;
async function member(claims: Record<string, boolean> = {}, gender = "man") {
  const account = await getAuth().createUser({ email: `${randomUUID()}@example.com`, emailVerified: true });
  await getAuth().setCustomUserClaims(account.uid, claims);
  const now = Date.now();
  const profile = { uid: account.uid, displayName: "Fictional console QA", gender, age: 98, onboardingComplete: true, isDiscoverable: true, photoUrls: [], createdAt: now - 10 * day, lastActiveAt: now - 2 * day };
  const settings = { showMe: [gender === "man" ? "woman" : "man"], ageMin: 98, ageMax: 98, notifications: { reminders: true, matches: true, messages: true } };
  await db.doc(`users/${account.uid}`).set(profile);
  await db.doc(`users/${account.uid}/private/settings`).set(settings);
  await db.doc(`moderation/${account.uid}`).set({ status: "ok", emailVerified: true });
  await db.doc(`discovery/${account.uid}`).set(buildDiscoveryEntry(account.uid, profile as never, settings as never, { emailVerified: true }));
  if (claims.supportAccess) await db.doc(`supportOperators/${account.uid}`).set({ enabled: true });
  return account.uid;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call<T>(fn: { run: (request: any) => T }, uid: string, data: unknown = {}) {
  const user = await getAuth().getUser(uid);
  return fn.run({ auth: { uid, token: user.customClaims ?? {} }, data, rawRequest: {}, acceptsStreaming: false });
}
beforeAll(async () => {
  await db.doc("runtime/trust").set({ requireVerification: false }, { merge: true });
  owner = await member({ moderator: true, supportAccess: true }); viewer = await member(); target = await member({}, "woman");
  await db.doc(`webPushSubscriptions/console_${viewer}`).set({ uid: viewer });
});
beforeEach(async () => {
  jest.clearAllMocks();
  await db.doc("runtime/notifications").set({ remindersEnabled: true });
  await db.doc(`notificationReminders/${viewer}`).set({ enabled: true });
  await db.doc(`users/${viewer}/private/settings`).update({ "notifications.reminders": true });
});
afterAll(async () => { for (const uid of [owner, viewer, target]) await getAuth().deleteUser(uid); });

test("console, sends and self-tests reject members, ordinary moderators, forged/revoked roles and support sessions", async () => {
  const mod = await member({ moderator: true });
  for (const fn of [api.adminGetNotificationConsole, api.adminSendReminderRun, api.adminSendNotificationTest]) {
    for (const uid of [viewer, mod]) await expect(call<unknown>(fn, uid, { requestId: randomUUID() })).rejects.toThrow(/Owner support access/);
    await expect(fn.run({ auth: { uid: viewer, token: { moderator: true, supportAccess: true } }, data: {} } as never)).rejects.toThrow(/Owner support access/);
    await expect(fn.run({ auth: { uid: "support_fake", token: { supportSession: "fake", moderator: true, supportAccess: true } }, data: {} } as never)).rejects.toThrow(/read-only/);
  }
  await db.doc(`supportOperators/${owner}`).update({ enabled: false });
  await expect(call(api.adminGetNotificationConsole, owner)).rejects.toThrow(/Owner support access/);
  await db.doc(`supportOperators/${owner}`).update({ enabled: true });
  await getAuth().deleteUser(mod);
});
test("a preview reports the real overlap and eligible copy without reserving or sending", async () => {
  const result = await call(api.adminGetNotificationConsole, owner);
  expect(result.reachableMembers).toBeGreaterThanOrEqual(1); expect(result.preview.ready).toBeGreaterThanOrEqual(1);
  expect(result.preview.samples.length).toBeGreaterThan(0);
  expect(JSON.stringify(result.preview)).not.toContain(viewer);
  expect((await db.doc(`notificationReminders/${viewer}`).get()).get("recentAttempts")).toBeUndefined();
  expect(sendWebPushToUser).not.toHaveBeenCalled();
});
test("manual runs are audited, idempotent and share the scheduled reminder cap", async () => {
  const requestId = randomUUID();
  const results = await Promise.all([call(api.adminSendReminderRun, owner, { requestId }), call(api.adminSendReminderRun, owner, { requestId })]);
  expect(results.some(result => result.status === "complete")).toBe(true);
  expect((sendWebPushToUser as jest.Mock).mock.calls.filter(args => args[0] === viewer)).toHaveLength(1);
  const run = await db.doc(`notificationCampaigns/${owner}_${requestId}`).get();
  expect(run.get("actorUid")).toBe(owner); expect(run.get("summary.attempted")).toBeGreaterThanOrEqual(1);
  const count = (sendWebPushToUser as jest.Mock).mock.calls.length;
  await call(api.adminSendReminderRun, owner, { requestId });
  await call(api.adminSendReminderRun, owner, { requestId: randomUUID() });
  expect(sendWebPushToUser).toHaveBeenCalledTimes(count);
});
test("disabled automation and opted-out recipients are never overridden; caller copy/targets are rejected", async () => {
  await db.doc("runtime/notifications").update({ remindersEnabled: false });
  await expect(call(api.adminSendReminderRun, owner, { requestId: randomUUID() })).rejects.toThrow(/switched off/);
  await db.doc("runtime/notifications").update({ remindersEnabled: true });
  await db.doc(`users/${viewer}/private/settings`).update({ "notifications.reminders": false });
  await call(api.adminSendReminderRun, owner, { requestId: randomUUID() });
  expect((sendWebPushToUser as jest.Mock).mock.calls.filter(args => args[0] === viewer)).toHaveLength(0);
  await expect(call(api.adminSendReminderRun, owner, { requestId: randomUUID(), uid: viewer, body: "You got a match" })).rejects.toThrow(/reference/);
});
test("an explicit test is clearly labelled and goes only to the owner, ignoring a supplied target", async () => {
  await call(api.adminSendNotificationTest, owner, { uid: viewer });
  expect(sendWebPushToUser).toHaveBeenCalledTimes(1);
  expect(sendWebPushToUser).toHaveBeenCalledWith(owner, expect.objectContaining({ kind: "test", title: "Paire test notification", data: { type: "test" } }), expect.anything());
});
