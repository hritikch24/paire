/**
 * "See them again" (Paire Plus): once everyone new is seen, a Plus member's feed
 * brings back people they passed on, and they can like them this time. Run
 * in-process against the Firestore emulator with billing on.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.MUSE_BILLING_ENABLED = "true";
process.env.MUSE_UNCACHED_RUNTIME = "true";
delete process.env.FUNCTIONS_EMULATOR;

if (!getApps().length) initializeApp({ projectId: "demo-muse" });
const admin = getFirestore();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const discovery = require("../src/discovery") as typeof import("../src/discovery");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { swipe } = require("../src/swipes") as typeof import("../src/swipes");

type Feed = { profiles: Array<{ uid: string }>; cursor: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = <T,>(fn: { run: (request: any) => T }, uid: string, data: unknown = {}) =>
  fn.run({ data, auth: { uid, token: { email: `${uid}@example.com`, email_verified: true } }, rawRequest: {}, acceptsStreaming: false });

const PUNE = { lat: 18.52, lng: 73.85 };
const run = Date.now().toString(36);
let counter = 0;

async function member(gender: "woman" | "man", showMe: string[]): Promise<string> {
  counter += 1;
  const uid = `revisit${counter}_${run}`;
  const now = Date.now();
  await admin.doc(`users/${uid}/private/settings`).set({
    showMe, ageMin: 18, ageMax: 60, maxDistanceKm: 50, locationEnabled: true, location: { ...PUNE, updatedAt: now },
    sharedVibesOnly: false, aiVibeMatching: false, updatedAt: now
  });
  await admin.doc(`users/${uid}`).set({
    uid, displayName: `Member ${counter}`, age: 30, gender, city: "Pune", bio: "Hi.", photoUrls: [`https://example.com/${uid}.jpg`],
    interests: ["canvas"], intentions: ["long-term"], vibes: ["cozy"], quickAnswers: [], isDiscoverable: true,
    onboardingComplete: true, safetyConfirmed: true, createdAt: now, updatedAt: now, lastActiveAt: now
  });
  await admin.doc(`moderation/${uid}`).set({ status: "ok", emailVerified: true, cohort: "test" });
  await discovery.syncDiscoveryIndex(uid);
  return uid;
}

const plus = (uid: string) => admin.doc(`billing/${uid}`).set({ expiresAt: Date.now() + 24 * 60 * 60_000, checkedAt: Date.now() });

/** Every page of the feed, as uids. */
async function wholeFeed(uid: string, revisit = false): Promise<string[]> {
  const seen: string[] = [];
  let cursor: unknown = null;
  for (let page = 0; page < 20; page += 1) {
    const result = (await call(discovery.getDiscoverFeed, uid, revisit ? { cursor, revisit: true } : { cursor })) as Feed;
    seen.push(...result.profiles.map((profile) => profile.uid));
    cursor = result.cursor;
    if (!cursor) break;
  }
  return seen;
}

beforeAll(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false });
});

describe("seeing people again with Paire Plus", () => {
  test("free members are asked for Plus; Plus brings back passes (never likes) and lets them like this time", async () => {
    const viewer = await member("woman", ["man"]);
    const [passed, liked, fresh] = [await member("man", ["woman"]), await member("man", ["woman"]), await member("man", ["woman"])];

    expect(await call(swipe, viewer, { targetUid: passed, type: "nope" })).toMatchObject({ matched: false });
    await call(swipe, viewer, { targetUid: liked, type: "like" });
    const free = await wholeFeed(viewer);
    expect(free).toContain(fresh);
    expect(free).not.toContain(passed);
    expect(free).not.toContain(liked);

    // Without Plus, the "see them again" feed is refused, and a second swipe changes nothing.
    await expect(call(discovery.getDiscoverFeed, viewer, { revisit: true })).rejects.toThrow(/comes with Paire Plus/);
    await call(swipe, viewer, { targetUid: passed, type: "like" });
    expect((await admin.doc(`swipes/${viewer}/outgoing/${passed}`).get()).get("type")).toBe("nope");

    await plus(viewer);
    const again = await wholeFeed(viewer, true);
    expect(again).toContain(passed);
    expect(again).toContain(fresh);
    expect(again).not.toContain(liked);

    // A second look turns the pass into a like, and it matches if they liked back.
    await call(swipe, passed, { targetUid: viewer, type: "like" });
    expect(await call(swipe, viewer, { targetUid: passed, type: "like" })).toMatchObject({ matched: true });
    expect((await admin.doc(`swipes/${viewer}/outgoing/${passed}`).get()).get("type")).toBe("like");
    expect(await wholeFeed(viewer, true)).not.toContain(passed);
  });

  test("blocked people never come back", async () => {
    const viewer = await member("man", ["woman"]);
    const blocked = await member("woman", ["man"]);
    await plus(viewer);
    await call(swipe, viewer, { targetUid: blocked, type: "nope" });
    await admin.doc(`blocks/${blocked}/blocked/${viewer}`).set({ at: Date.now() });
    expect(await wholeFeed(viewer, true)).not.toContain(blocked);
  });
});
