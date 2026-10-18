import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
jest.mock("../src/webPush", () => ({ WEB_PUSH_SECRETS: [], sendWebPushToUser: jest.fn(async () => ({ accepted: 1, failed: 0 })) }));
if (!getApps().length) initializeApp({ projectId: "demo-muse" });
// Imports after emulator Admin initialization, using no real provider credentials.
const { remindMember, recordReminderOpen } = require("../src/reminders") as typeof import("../src/reminders");
const { sendWebPushToUser } = require("../src/webPush") as typeof import("../src/webPush");
const db = getFirestore();
const now = Date.parse("2026-10-27T13:00:00Z"); // Tuesday after Garba.
const day = 86_400_000;
const prefix = `reminder_${randomUUID().replace(/-/g, "")}`;
const viewer = `${prefix}_viewer`, target = `${prefix}_target`;
beforeAll(async () => {
  await db.doc("runtime/trust").set({ requireVerification: false }, { merge: true });
  await getAuth().createUser({ uid: viewer, email: `${prefix}@example.com`, emailVerified: true });
  for (const [uid, gender] of [[viewer, "man"], [target, "woman"]]) {
    const profile = { uid, displayName: "Fictional", age: 99, gender, onboardingComplete: true, isDiscoverable: true, createdAt: now - (uid === viewer ? 10 : 1) * day, lastActiveAt: now - (uid === viewer ? 2 : 1) * day, photoUrls: [] };
    await db.doc(`users/${uid}`).set(profile);
    await db.doc(`users/${uid}/private/settings`).set({ showMe: [gender === "man" ? "woman" : "man"], ageMin: 99, ageMax: 99, notifications: { reminders: true } });
    await db.doc(`moderation/${uid}`).set({ emailVerified: true, status: "ok" });
    const { buildDiscoveryEntry } = require("../src/lib/discovery") as typeof import("../src/lib/discovery");
    await db.doc(`discovery/${uid}`).set(buildDiscoveryEntry(uid, profile as never, (await db.doc(`users/${uid}/private/settings`).get()).data(), { emailVerified: true }));
  }
  await db.doc(`webPushSubscriptions/${prefix}`).set({ uid: viewer });
});
beforeEach(async () => {
  jest.clearAllMocks();
  await db.doc(`notificationReminders/${viewer}`).set({ enabled: true });
  await db.doc(`users/${viewer}/private/settings`).update({ "notifications.reminders": true });
  await db.doc(`blocks/${viewer}/blocked/${target}`).delete();
  await db.doc(`users/${target}/private/settings`).update({ incognito: false });
});
afterAll(async () => { await getAuth().deleteUser(viewer); });

test("overlapping scheduler attempts reserve one reminder and an open is counted once for its recipient", async () => {
  await Promise.all([remindMember(viewer, now), remindMember(viewer, now)]);
  expect(sendWebPushToUser).toHaveBeenCalledTimes(1);
  const state = await db.doc(`notificationReminders/${viewer}`).get();
  expect(state.get("recentAttempts")).toEqual([now]);
  const request = (uid: string) => ({ auth: { uid, token: {} }, data: { id: state.get("latestId") }, rawRequest: {}, acceptsStreaming: false });
  await recordReminderOpen.run(request(target) as never);
  expect((await state.ref.get()).get("openedAt")).toBe(0);
  await recordReminderOpen.run(request(viewer) as never);
  const opened = (await state.ref.get()).get("openedAt");
  await recordReminderOpen.run(request(viewer) as never);
  expect((await state.ref.get()).get("openedAt")).toBe(opened);
});
test("opt-outs, blocks and incognito produce no reminder even with a stale visible discovery entry", async () => {
  await db.doc(`users/${viewer}/private/settings`).update({ "notifications.reminders": false });
  await remindMember(viewer, now);
  await db.doc(`users/${viewer}/private/settings`).update({ "notifications.reminders": true });
  await db.doc(`blocks/${viewer}/blocked/${target}`).set({ targetUid: target });
  await remindMember(viewer, now);
  await db.doc(`blocks/${viewer}/blocked/${target}`).delete();
  await db.doc(`users/${target}/private/settings`).update({ incognito: true });
  await remindMember(viewer, now);
  expect(sendWebPushToUser).not.toHaveBeenCalled();
});
