/**
 * getLikesYou `acceptable` and identity reveal, called directly with billing on so Plus can be
 * simulated (the emulated Functions run with billing off). Fictional members, local emulators only.
 */
import { randomUUID } from "crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

process.env.MUSE_BILLING_ENABLED = "true";
process.env.MUSE_UNCACHED_RUNTIME = "true";
if (!getApps().length) initializeApp({ projectId: "demo-muse", storageBucket: "demo-muse.appspot.com" });
const db = getFirestore();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getLikesYou } = require("../src/likes") as typeof import("../src/likes");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncDiscoveryIndex } = require("../src/discovery") as typeof import("../src/discovery");

const DAY = 86_400_000;
async function member(gender: "woman" | "man") {
  const user = await getAuth().createUser({ email: `acc-${randomUUID()}@example.com`, emailVerified: true });
  const batch = db.batch();
  batch.set(db.doc(`moderation/${user.uid}`), { status: "ok", emailVerified: true, cohort: "test" });
  batch.set(db.doc(`users/${user.uid}`), { uid: user.uid, displayName: `Member ${user.uid}`, gender, age: 29, photoUrls: [`https://example.com/${user.uid}.jpg`], onboardingComplete: true, isDiscoverable: true, intentions: ["long-term"], vibes: ["cozy"], lastActiveAt: Date.now(), createdAt: Date.now() });
  batch.set(db.doc(`users/${user.uid}/private/settings`), { showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60, maxDistanceKm: 300, locationEnabled: true, location: { lat: 19.08, lng: 72.88 }, notifications: { matches: false, messages: false } });
  await batch.commit();
  await syncDiscoveryIndex(user.uid);
  return user.uid;
}
const plus = (uid: string) => db.doc(`billing/${uid}`).set({ expiresAt: Date.now() + 7 * DAY, checkedAt: Date.now() });
const acceptFlow = (on: boolean) => db.doc("runtime/trust").set({ requireVerification: false, acceptFlow: on });
async function likes(uid: string) {
  const account = await getAuth().getUser(uid);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getLikesYou.run({ data: {}, auth: { uid, token: { email: account.email, email_verified: true } }, rawRequest: {}, acceptsStreaming: false } as any);
}
async function likedBy(fromUid: string, toUid: string) {
  await db.doc(`swipes/${fromUid}/outgoing/${toUid}`).set({ fromUid, toUid, type: "like", note: "Hello there", createdAt: Timestamp.now() });
}

beforeAll(async () => { await acceptFlow(true); });
afterAll(async () => { await db.doc("runtime/trust").set({ requireVerification: false }); });

test("acceptFlow on: a free woman gets the full list, acceptable:true and no Plus expiry", async () => {
  const she = await member("woman"); const he = await member("man");
  await likedBy(he, she);
  expect(await likes(she)).toMatchObject({ count: 1, locked: false, acceptable: true, expiresAt: null, profiles: [expect.objectContaining({ uid: he, note: "Hello there" })] });
});

test("acceptFlow on: a Plus woman gets the full list, acceptable:true and her Plus expiry", async () => {
  const she = await member("woman"); const he = await member("man");
  await likedBy(he, she); await plus(she);
  const result = await likes(she);
  expect(result).toMatchObject({ count: 1, locked: false, acceptable: true, profiles: [expect.objectContaining({ uid: he })] });
  expect(result.expiresAt).toBeGreaterThan(Date.now());
});

test("acceptFlow on: a man never gets acceptable, with or without Plus; free men see only the count", async () => {
  const free = await member("man"); const paid = await member("man"); const her = await member("woman");
  await likedBy(her, free); await likedBy(her, paid); await plus(paid);
  const freeResult = await likes(free);
  expect(freeResult).toMatchObject({ count: 1, locked: true, acceptable: false, profiles: [], expiresAt: null });
  expect(JSON.stringify(freeResult)).not.toContain(her);
  const paidResult = await likes(paid);
  expect(paidResult).toMatchObject({ count: 1, locked: false, acceptable: false, profiles: [expect.objectContaining({ uid: her })] });
  expect(paidResult.expiresAt).toBeGreaterThan(Date.now());
});

test("acceptFlow off: acceptable is false for everyone and behaviour is today's", async () => {
  await acceptFlow(false);
  try {
    const freeWoman = await member("woman"); const plusWoman = await member("woman"); const he = await member("man");
    await likedBy(he, freeWoman); await likedBy(he, plusWoman); await plus(plusWoman);
    expect(await likes(freeWoman)).toMatchObject({ count: 1, locked: true, acceptable: false, profiles: [], expiresAt: null });
    const paid = await likes(plusWoman);
    expect(paid).toMatchObject({ count: 1, locked: false, acceptable: false, profiles: [expect.objectContaining({ uid: he })] });
    expect(paid.expiresAt).toBeGreaterThan(Date.now());
  } finally { await acceptFlow(true); }
});
