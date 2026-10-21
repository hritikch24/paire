import { randomUUID } from "crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

process.env.MUSE_BILLING_ENABLED = "true";
process.env.MUSE_UNCACHED_RUNTIME = "true";
if (!getApps().length) initializeApp({ projectId: "demo-muse", storageBucket: "demo-muse.appspot.com" });
const db = getFirestore();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const grants = require("../src/adminPremium") as typeof import("../src/adminPremium");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getLikesYou } = require("../src/likes") as typeof import("../src/likes");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { swipe } = require("../src/swipes") as typeof import("../src/swipes");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncPremium } = require("../src/billing") as typeof import("../src/billing");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncDiscoveryIndex, getDiscoverFeed } = require("../src/discovery") as typeof import("../src/discovery");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dailyLimitRef } = require("../src/quota") as typeof import("../src/quota");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readRevenue } = require("../src/revenue") as typeof import("../src/revenue");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { deleteAccount } = require("../src/account") as typeof import("../src/account");

const DAY = 86_400_000;
let owner: { uid: string; email: string };
async function member(claims: Record<string, boolean> = {}, gender: "woman" | "man" = "woman") {
  const email = `plus-${randomUUID()}@example.com`;
  const user = await getAuth().createUser({ email, emailVerified: true });
  await getAuth().setCustomUserClaims(user.uid, claims);
  const batch = db.batch();
  batch.set(db.doc(`moderation/${user.uid}`), { status: "ok", emailVerified: true, cohort: "test" });
  batch.set(db.doc(`users/${user.uid}`), { uid: user.uid, displayName: `Private name ${user.uid}`, gender, age: 29, photoUrls: [`https://example.com/private/${user.uid}.jpg`], onboardingComplete: true, isDiscoverable: true, intentions: ["long-term"], languages: ["hindi"], vibes: ["cozy"], lastActiveAt: Date.now(), createdAt: Date.now() });
  batch.set(db.doc(`users/${user.uid}/private/settings`), { showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60, maxDistanceKm: 300, locationEnabled: true, location: { lat: 19.08, lng: 72.88 }, notifications: { matches: false, messages: false } });
  if (claims.supportAccess) batch.set(db.doc(`supportOperators/${user.uid}`), { enabled: true });
  await batch.commit();
  await syncDiscoveryIndex(user.uid);
  return { uid: user.uid, email };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call<T>(fn: { run: (request: any) => T }, uid: string, data: unknown = {}) {
  const account = await getAuth().getUser(uid);
  return fn.run({ data, auth: { uid, token: { ...account.customClaims, email: account.email, email_verified: true } }, rawRequest: {}, acceptsStreaming: false });
}
const grant = (target: { email: string }, requestId = randomUUID()) => call(grants.adminGrantPlusMonth, owner.uid, { email: target.email, requestId });
beforeAll(async () => {
  await db.doc("runtime/trust").set({ requireVerification: false });
  owner = await member({ moderator: true, supportAccess: true });
});

test("only an enabled owner can grant; stale/forged roles, support identities and ordinary moderators cannot", async () => {
  const ordinary = await member(); const mod = await member({ moderator: true });
  const data = { email: ordinary.email, requestId: randomUUID() };
  for (const uid of [ordinary.uid, mod.uid]) await expect(call(grants.adminGrantPlusMonth, uid, data)).rejects.toThrow(/Owner support access/);
  await expect(grants.adminGrantPlusMonth.run({ data, auth: { uid: ordinary.uid, token: { moderator: true, supportAccess: true } } } as never)).rejects.toThrow(/Owner support access/);
  await expect(grants.adminGrantPlusMonth.run({ data, auth: { uid: "support_fake", token: { moderator: true, supportAccess: true } } } as never)).rejects.toThrow(/read-only/);
  await db.doc(`supportOperators/${owner.uid}`).update({ enabled: false });
  await expect(grant(ordinary)).rejects.toThrow(/Owner support access/);
  await db.doc(`supportOperators/${owner.uid}`).update({ enabled: true });
  await expect(call(grants.adminPreviewPlusGrant, owner.uid, { email: "missing@example.com" })).rejects.toThrow(/No member/);
  await expect(call(grants.adminGrantPlusMonth, owner.uid, { ...data, requestId: "bad" })).rejects.toThrow(/reference/);
  await getAuth().updateUser(ordinary.uid, { disabled: true });
  await expect(grant(ordinary)).rejects.toThrow(/unavailable/);
  await getAuth().updateUser(ordinary.uid, { disabled: false });
  await db.doc(`moderation/${ordinary.uid}`).update({ status: "banned" });
  await expect(grant(ordinary)).rejects.toThrow(/unavailable/);
});

test("30-day gifts extend existing validity once, survive refresh, preserve recovery and permanent chat, and add no revenue", async () => {
  const revenue = await readRevenue();
  const target = await member(); const now = Date.now(), until = now + 7 * DAY;
  const recovery = { uid: target.uid, status: "active", startsAt: now, expiresAt: until, amountReportedPaise: 9900, currency: "INR", coveredOrderIds: ["unverified-order"] };
  await db.doc(`supportPlusGrants/${target.uid}`).set(recovery);
  await db.doc(`billing/${target.uid}`).set({ expiresAt: until, checkedAt: now });
  await db.doc(`chatUnlocks/${target.uid}`).set({ status: "active", source: "grant" });
  expect(await call(grants.adminPreviewPlusGrant, owner.uid, { email: target.email })).toMatchObject({ uid: target.uid, addedDays: 30, startsAt: until, expiresAt: until + 30 * DAY });
  const requestId = randomUUID();
  const first = await grant(target, requestId); const retry = await grant(target, requestId);
  expect(first).toMatchObject({ expiresAt: until + 30 * DAY, alreadyGranted: false });
  expect(retry).toMatchObject({ expiresAt: until + 30 * DAY, alreadyGranted: true });
  expect((await db.doc(`supportPlusGrants/${target.uid}`).get()).data()).toEqual(recovery);
  expect(await syncPremium(target.uid)).toMatchObject({ active: true, expiresAt: until + 30 * DAY });
  expect((await db.doc(`moderation/${target.uid}`).get()).get("chatAccess")).toMatchObject({ unlimited: true, premiumUntil: until + 30 * DAY });
  const audit = (await db.doc(`billingSupportAudit/complimentary-${owner.uid}-${requestId}`).get()).data();
  expect(audit).toMatchObject({ action: "goodwill-grant", actorUid: owner.uid, uid: target.uid, days: 30, amountReportedPaise: 0 });
  expect(await readRevenue()).toEqual(revenue);
  const other = await member();
  await expect(grant(other, requestId)).rejects.toThrow(/another member/);
});

test("concurrent retries share one grant; another intentional grant adds another month", async () => {
  const target = await member(); const requestId = randomUUID();
  const results = await Promise.all([grant(target, requestId), grant(target, requestId)]);
  expect(results[0].expiresAt).toBe(results[1].expiresAt);
  expect(results.filter((r) => !r.alreadyGranted)).toHaveLength(1);
  expect((await grant(target)).expiresAt).toBe(results[0].expiresAt + 30 * DAY);
});

test("account deletion removes gifted access while retaining the zero-value owner audit", async () => {
  const target = await member(); const requestId = randomUUID();
  await grant(target, requestId);
  await call(deleteAccount, target.uid);
  expect((await db.doc(`complimentaryPlusGrants/${target.uid}`).get()).exists).toBe(false);
  expect((await db.doc(`billing/${target.uid}`).get()).exists).toBe(false);
  expect((await db.doc(`billingSupportAudit/complimentary-${owner.uid}-${requestId}`).get()).get("amountReportedPaise")).toBe(0);
});

test("free responses hide every identity and Plus reveals out-of-range/filter likes, respecting private photos, blocks and expiry", async () => {
  const viewer = await member(); const liker = await member({}, "man");
  await db.doc(`users/${viewer.uid}/private/settings`).set({ showMe: ["woman"], ageMin: 40, ageMax: 50, maxDistanceKm: 1 }, { merge: true });
  await db.doc(`users/${liker.uid}/private/settings`).set({ location: { lat: 18.52, lng: 73.85 } }, { merge: true });
  await db.doc(`swipes/${liker.uid}/outgoing/${viewer.uid}`).set({ fromUid: liker.uid, toUid: viewer.uid, type: "super", note: "A sensitive thoughtful note", createdAt: Timestamp.now() });
  const free = await call(getLikesYou, viewer.uid);
  expect(free).toMatchObject({ count: 1, profiles: [], locked: true });
  for (const secret of [liker.uid, "Private name", "sensitive", "https://example.com/private"]) expect(JSON.stringify(free)).not.toContain(secret);
  const given = await grant(viewer);
  await db.doc(`billing/${viewer.uid}`).update({ checkedAt: Date.now() - 11 * 60_000 });
  const revealed = await call(getLikesYou, viewer.uid);
  expect(revealed).toMatchObject({ count: 1, locked: false, expiresAt: given.expiresAt, profiles: [expect.objectContaining({ uid: liker.uid, note: "A sensitive thoughtful note", superLikedYou: true })] });
  await db.doc(`users/${liker.uid}/private/settings`).set({ privatePhotos: true }, { merge: true });
  expect((await call(getLikesYou, viewer.uid)).profiles[0]).toMatchObject({ photosPrivate: true, photoUrls: [] });
  await db.doc(`blocks/${liker.uid}/blocked/${viewer.uid}`).set({ targetUid: viewer.uid });
  expect((await call(getLikesYou, viewer.uid)).count).toBe(0);
  await db.doc(`blocks/${liker.uid}/blocked/${viewer.uid}`).delete();
  await db.doc(`users/${liker.uid}`).update({ isDiscoverable: false });
  expect((await call(getLikesYou, viewer.uid)).count).toBe(0);
  await db.doc(`users/${liker.uid}`).update({ isDiscoverable: true });
  await db.doc(`complimentaryPlusGrants/${viewer.uid}`).update({ expiresAt: Date.now() - 1 });
  await db.doc(`billing/${viewer.uid}`).set({ expiresAt: Date.now() - 1, checkedAt: Date.now() });
  expect(await call(getLikesYou, viewer.uid)).toMatchObject({ profiles: [], locked: true, count: 1 });
  // Search filters never prevent an explicit answer to an existing incoming like.
  expect(await call(swipe, viewer.uid, { targetUid: liker.uid, type: "like" })).toMatchObject({ matched: true });
  expect((await call(getLikesYou, viewer.uid)).count).toBe(0);
});

test("discovery doesn't reveal a free member's Super Liker identity through a badge", async () => {
  const viewer = await member(); const liker = await member({}, "man");
  await db.doc(`superLikes/${viewer.uid}/from/${liker.uid}`).set({ fromUid: liker.uid });
  const free = await call(getDiscoverFeed, viewer.uid);
  expect(free.profiles.find((p) => p.uid === liker.uid)?.superLikedYou).toBe(false);
  await grant(viewer);
  expect((await call(getDiscoverFeed, viewer.uid)).profiles.find((p) => p.uid === liker.uid)?.superLikedYou).toBe(true);
});

test("quota errors offer an upgrade for free likes, while Plus keeps its real daily cap", async () => {
  const viewer = await member(); const target = await member({}, "man");
  await dailyLimitRef(viewer.uid).set({ likes: 10 });
  await expect(call(swipe, viewer.uid, { targetUid: target.uid, type: "like" })).rejects.toMatchObject({ code: "resource-exhausted", details: { reason: "daily-swipe-limit", kind: "like", upgradeAvailable: true } });
  await grant(viewer);
  expect(await call(swipe, viewer.uid, { targetUid: target.uid, type: "like" })).toMatchObject({ remaining: { likes: 89 } });
  const other = await member({}, "man");
  await dailyLimitRef(viewer.uid).set({ likes: 100 });
  await expect(call(swipe, viewer.uid, { targetUid: other.uid, type: "like" })).rejects.toMatchObject({ code: "resource-exhausted", details: { upgradeAvailable: false } });
});
