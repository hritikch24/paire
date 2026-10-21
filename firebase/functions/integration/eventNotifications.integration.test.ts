import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

jest.mock("../src/push", () => ({ sendPushToUser: jest.fn(async () => undefined) }));
if (!getApps().length) initializeApp({ projectId: "demo-muse" });
// Handlers use real emulator records; the external delivery transport is mocked.
const { swipe } = require("../src/swipes") as typeof import("../src/swipes");
const { onMessageCreated } = require("../src/messages") as typeof import("../src/messages");
const { sendPushToUser } = require("../src/push") as typeof import("../src/push");
const db = getFirestore();
async function pair() {
  const a = `notify_${randomUUID().replace(/-/g, "")}_a`, b = `${a}_b`;
  const batch = db.batch();
  for (const [uid, gender] of [[a, "woman"], [b, "man"]]) {
    batch.set(db.doc(`users/${uid}`), { uid, displayName: uid === a ? "Fictional A" : "Fictional B", gender, age: 28, onboardingComplete: true, isDiscoverable: true, photoUrls: [] });
    batch.set(db.doc(`moderation/${uid}`), { status: "ok", emailVerified: true, cohort: "test" });
    batch.set(db.doc(`users/${uid}/private/settings`), { showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60 });
  }
  await batch.commit(); return { a, b };
}
const like = (uid: string, targetUid: string) => swipe.run({ auth: { uid, token: { email_verified: true } }, data: { targetUid, type: "like" } } as never);
beforeAll(async () => { await db.doc("runtime/trust").set({ requireVerification: false }, { merge: true }); });
beforeEach(() => jest.clearAllMocks());

test("random fictional users receive a match event only after genuine reciprocal likes, once", async () => {
  const { a, b } = await pair();
  expect((await like(a, b)).matched).toBe(false);
  expect(sendPushToUser).not.toHaveBeenCalled();
  const result = await like(b, a);
  expect(result.matched).toBe(true);
  expect((await db.doc(`matches/${result.matchId}`).get()).get("participants")).toEqual([a, b].sort());
  expect(sendPushToUser).toHaveBeenCalledTimes(1);
  expect(sendPushToUser).toHaveBeenCalledWith(a, expect.objectContaining({ kind: "matches", data: { type: "match", matchId: result.matchId } }));
  await like(b, a);
  expect(sendPushToUser).toHaveBeenCalledTimes(1);
});
test("a real message event notifies the other participant with the correct chat destination", async () => {
  const { a, b } = await pair(); await like(a, b); const { matchId } = await like(b, a); jest.clearAllMocks();
  const ref = await db.collection(`matches/${matchId}/messages`).add({ senderId: a, text: "Hello! What do you enjoy painting?", createdAt: Date.now() });
  await onMessageCreated.run({ data: await ref.get(), params: { matchId, messageId: ref.id } } as never);
  expect(sendPushToUser).toHaveBeenCalledTimes(1);
  expect(sendPushToUser).toHaveBeenCalledWith(b, expect.objectContaining({ kind: "messages", body: "Hello! What do you enjoy painting?", data: { type: "message", matchId } }));
});
test("ended matches and server system notes do not generate customer message notifications", async () => {
  const { a, b } = await pair(); await like(a, b); const { matchId } = await like(b, a); jest.clearAllMocks();
  await db.doc(`matches/${matchId}`).update({ active: false });
  const ref = await db.collection(`matches/${matchId}/messages`).add({ senderId: a, text: "Hello" });
  await onMessageCreated.run({ data: await ref.get(), params: { matchId, messageId: ref.id } } as never);
  await db.doc(`matches/${matchId}`).update({ active: true });
  await ref.set({ senderId: "system", text: "A member left the chat." });
  await onMessageCreated.run({ data: await ref.get(), params: { matchId, messageId: ref.id } } as never);
  expect(sendPushToUser).not.toHaveBeenCalled();
});
