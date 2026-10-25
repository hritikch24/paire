/**
 * Accepting a like (acceptLike) through the Functions emulator, the real rules and the
 * same client SDK calls the app makes. Fictional members on isolated emulator accounts.
 */
import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, doc, Firestore, getFirestore, setDoc, terminate } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "demo-muse";
const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const EMULATORS = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
  firestore: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
  functions: process.env.MUSE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001"
};
const hostAndPort = (value: string): [string, number] => {
  const [host, port] = value.split(":");
  return [host, Number(port)];
};

if (!getAdminApps().length) initializeAdminApp({ projectId: PROJECT_ID });
const admin = getAdminFirestore();

type Client = { uid: string; app: FirebaseApp; db: Firestore; call: <T = unknown>(name: string, data?: unknown) => Promise<T> };
type Accepted = { matched: boolean; matchId: string };
type Likes = { profiles: Array<{ uid: string; note?: string; superLikedYou?: boolean }>; count: number; locked: boolean; hasMore: boolean; expiresAt: number | null; acceptable: boolean };
const clients: Client[] = [];
let counter = 0;

async function makeClient(label: string): Promise<Client> {
  counter += 1;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "demo-key", authDomain: `${PROJECT_ID}.firebaseapp.com` }, `al-${label}-${counter}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATORS.auth}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...hostAndPort(EMULATORS.firestore));
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, ...hostAndPort(EMULATORS.functions));
  const credential = await createUserWithEmailAndPassword(auth, `al.${label}.${Date.now()}.${counter}@example.com`, "Password123!");
  await getAdminAuth().updateUser(credential.user.uid, { emailVerified: true });
  await credential.user.getIdToken(true);
  const client: Client = { uid: credential.user.uid, app, db, call: async <T,>(name: string, data?: unknown) => (await httpsCallable(functions, name)(data)).data as T };
  clients.push(client);
  return client;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function onboard(client: Client, name: string, gender: "woman" | "man", settings: Record<string, unknown> = {}) {
  const now = Date.now();
  await setDoc(doc(client.db, "users", client.uid, "private", "settings"), {
    showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60, maxDistanceKm: 100, locationEnabled: true,
    location: { lat: 19.076, lng: 72.8777, updatedAt: now }, sharedVibesOnly: false, openToCasual: false, notifications: { matches: true, messages: true }, updatedAt: now, ...settings
  });
  await setDoc(doc(client.db, "users", client.uid), {
    uid: client.uid, displayName: name, age: 27, gender, pronouns: "", city: "Mumbai", bio: `Hi, I'm ${name}.`, photoUrls: [`https://example.com/${name}.jpg`],
    interests: ["canvas"], intentions: ["long-term"], vibes: ["cozy"], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true,
    createdAt: now, updatedAt: now, lastActiveAt: now
  });
  await waitFor(async () => (await admin.doc(`discovery/${client.uid}`).get()).get("visible") === true);
}

const matchIdOf = (a: Client, b: Client) => [a.uid, b.uid].sort().join("_");
const matchesBetween = async (a: Client, b: Client) =>
  (await admin.collection("matches").where("participants", "array-contains", a.uid).get()).docs.filter((d) => (d.get("participants") as string[]).includes(b.uid));
const acceptFlow = (on: boolean) => admin.doc("runtime/trust").set({ requireVerification: false, acceptFlow: on });

beforeAll(async () => { await acceptFlow(true); });
afterAll(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false });
  await Promise.all(clients.map(async (client) => { await terminate(client.db); await deleteApp(client.app); }));
});

/** A fresh pair: he (a man) liked her, nothing else has happened. */
async function pair(label: string, type: "like" | "super" = "like", note?: string, hisSettings: Record<string, unknown> = {}) {
  const [she, he] = await Promise.all([makeClient(`${label}-she`), makeClient(`${label}-he`)]);
  await Promise.all([onboard(she, `Asha ${label}`, "woman"), onboard(he, `Dev ${label}`, "man", hisSettings)]);
  await he.call("swipe", { targetUid: she.uid, type, ...(note ? { note } : {}) });
  return { she, he };
}

describe("acceptLike", () => {
  test("a woman accepts a like: match, her own like, no daily like used, and a retry changes nothing", async () => {
    const { she, he } = await pair("ok", "super", "Loved your canvas bio");
    const result = await she.call<Accepted>("acceptLike", { targetUid: he.uid });
    expect(result).toEqual({ matched: true, matchId: matchIdOf(she, he) });

    const match = await admin.doc(`matches/${result.matchId}`).get();
    expect(match.get("participants")).toEqual([she.uid, he.uid].sort());
    expect(match.get("active")).toBe(true);
    expect(match.get("superLikedBy")).toEqual([he.uid]);
    expect(JSON.stringify(match.get("sparks"))).toContain("Loved your canvas bio");
    const hers = await admin.doc(`swipes/${she.uid}/outgoing/${he.uid}`).get();
    expect(hers.get("type")).toBe("like");
    // Accepting is not a swipe: it uses none of her daily likes.
    const limits = await admin.collection(`limits/${she.uid}/daily`).get();
    expect(limits.docs.reduce((sum, d) => sum + (Number(d.get("likes")) || 0), 0)).toBe(0);
    expect(limits.docs.some((d) => d.get("acceptChecks") === 1)).toBe(true);

    // Same answer again, and nothing was written a second time.
    const firstCreatedAt = match.get("createdAt");
    const swipeCreatedAt = hers.get("createdAt");
    expect(await she.call<Accepted>("acceptLike", { targetUid: he.uid })).toEqual(result);
    expect((await matchesBetween(she, he)).length).toBe(1);
    expect((await admin.doc(`matches/${result.matchId}`).get()).get("createdAt").isEqual(firstCreatedAt)).toBe(true);
    expect((await admin.doc(`swipes/${she.uid}/outgoing/${he.uid}`).get()).get("createdAt").isEqual(swipeCreatedAt)).toBe(true);
  });

  test("a plain like carries no super like", async () => {
    const { she, he } = await pair("plain");
    const { matchId } = await she.call<Accepted>("acceptLike", { targetUid: he.uid });
    expect((await admin.doc(`matches/${matchId}`).get()).get("superLikedBy")).toEqual([]);
  });

  test("two taps at once (two tabs) make exactly one match", async () => {
    const { she, he } = await pair("race");
    const results = await Promise.all([1, 2, 3].map(() => she.call<Accepted>("acceptLike", { targetUid: he.uid })));
    expect(new Set(results.map((r) => r.matchId)).size).toBe(1);
    expect((await matchesBetween(she, he)).length).toBe(1);
  });

  test("is refused while the acceptFlow switch is off", async () => {
    const { she, he } = await pair("off");
    await acceptFlow(false);
    try {
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/failed-precondition" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    } finally { await acceptFlow(true); }
  });

  test("a man cannot accept", async () => {
    const { she, he } = await pair("man");
    const other = await makeClient("man-other");
    await onboard(other, "Other Dev", "man");
    await she.call("swipe", { targetUid: other.uid, type: "like" });
    await expect(other.call("acceptLike", { targetUid: she.uid })).rejects.toMatchObject({ code: "functions/permission-denied" });
    await expect(he.call("acceptLike", { targetUid: she.uid })).rejects.toMatchObject({ code: "functions/permission-denied" });
    expect((await matchesBetween(she, he)).length).toBe(0);
    expect((await matchesBetween(she, other)).length).toBe(0);
  });

  test("needs a pending like from that person", async () => {
    const [she, stranger] = await Promise.all([makeClient("none-she"), makeClient("none-he")]);
    await Promise.all([onboard(she, "Asha none", "woman"), onboard(stranger, "Dev none", "man")]);
    await expect(she.call("acceptLike", { targetUid: stranger.uid })).rejects.toMatchObject({ code: "functions/not-found" });
    // A pass is not a like.
    await stranger.call("swipe", { targetUid: she.uid, type: "nope" });
    await expect(she.call("acceptLike", { targetUid: stranger.uid })).rejects.toMatchObject({ code: "functions/not-found" });
    await expect(she.call("acceptLike", { targetUid: she.uid })).rejects.toThrow();
    expect((await matchesBetween(she, stranger)).length).toBe(0);
  });

  describe("a stale like", () => {
    test("after she blocks him", async () => {
      const { she, he } = await pair("block");
      await she.call("blockUser", { targetUid: he.uid });
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    });

    test("after he blocks her", async () => {
      const { she, he } = await pair("blocked");
      await he.call("blockUser", { targetUid: she.uid });
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    });

    test("after the match was ended (unmatch): no new match, no reactivation", async () => {
      const { she, he } = await pair("unmatch");
      const { matchId } = await she.call<Accepted>("acceptLike", { targetUid: he.uid });
      await admin.doc(`matches/${matchId}`).update({ active: false, endReason: "unmatch" });
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await admin.doc(`matches/${matchId}`).get()).get("active")).toBe(false);
    });

    test("after he is banned", async () => {
      const { she, he } = await pair("ban");
      await admin.doc(`moderation/${he.uid}`).set({ status: "banned" }, { merge: true });
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    });

    test("after he is hidden by moderation", async () => {
      const { she, he } = await pair("hidden");
      await admin.doc(`moderation/${he.uid}`).set({ status: "hidden" }, { merge: true });
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    });

    test("after he is no longer verified", async () => {
      const { she, he } = await pair("unverified");
      await admin.doc(`moderation/${he.uid}`).set({ emailVerified: false }, { merge: true });
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    });

    test("after he hides his profile", async () => {
      const { she, he } = await pair("gone");
      await admin.doc(`users/${he.uid}`).update({ isDiscoverable: false });
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    });

    test("after he deletes his like", async () => {
      const { she, he } = await pair("withdrawn");
      await admin.doc(`swipes/${he.uid}/outgoing/${she.uid}`).delete();
      await expect(she.call("acceptLike", { targetUid: he.uid })).rejects.toMatchObject({ code: "functions/not-found" });
      expect((await matchesBetween(she, he)).length).toBe(0);
    });
  });

  describe("the likes list for a woman without Plus", () => {
    test("with acceptFlow on she sees the man, his note and acceptable:true, with no Plus expiry", async () => {
      const { she, he } = await pair("list-on", "super", "Loved your canvas bio");
      const likes = await she.call<Likes>("getLikesYou", {});
      expect(likes).toMatchObject({ count: 1, locked: false, acceptable: true, expiresAt: null, hasMore: false });
      expect(likes.profiles).toEqual([expect.objectContaining({ uid: he.uid, note: "Loved your canvas bio", superLikedYou: true })]);
      // The card is what she accepts: acceptLike works on exactly this person.
      expect(await she.call<Accepted>("acceptLike", { targetUid: he.uid })).toEqual({ matched: true, matchId: matchIdOf(she, he) });
      expect((await she.call<Likes>("getLikesYou", {})).count).toBe(0);
    });

    test("with acceptFlow off it is today's anonymous count: locked, no identity, not acceptable", async () => {
      const { she, he } = await pair("list-off", "like", "A private note");
      await acceptFlow(false);
      try {
        const likes = await she.call<Likes>("getLikesYou", {});
        expect(likes).toMatchObject({ count: 1, locked: true, profiles: [], acceptable: false, expiresAt: null });
        for (const secret of [he.uid, "Dev list-off", "private note"]) expect(JSON.stringify(likes)).not.toContain(secret);
      } finally { await acceptFlow(true); }
    });

    test("a man without Plus never sees who liked him, even with the switch on", async () => {
      const { she } = await pair("list-man");
      const he = await makeClient("list-man-other");
      await onboard(he, "Dev other", "man");
      await she.call("swipe", { targetUid: he.uid, type: "like", note: "Hello from her" });
      const likes = await he.call<Likes>("getLikesYou", {});
      expect(likes).toMatchObject({ count: 1, locked: true, profiles: [], acceptable: false });
      for (const secret of [she.uid, "Asha list-man", "Hello from her"]) expect(JSON.stringify(likes)).not.toContain(secret);
    });

    test("blocked, hidden, banned and unverified likers stay out of her list and count", async () => {
      const { she, he } = await pair("list-ok");
      const [blocked, banned, unverified, hidden] = await Promise.all(["blk", "ban", "unv", "hid"].map(async (label) => {
        const man = await makeClient(`list-${label}`);
        await onboard(man, `Dev ${label}`, "man");
        await man.call("swipe", { targetUid: she.uid, type: "like" });
        return man;
      }));
      expect((await she.call<Likes>("getLikesYou", {})).count).toBe(5);
      await she.call("blockUser", { targetUid: blocked.uid });
      await admin.doc(`moderation/${banned.uid}`).set({ status: "banned" }, { merge: true });
      await admin.doc(`moderation/${unverified.uid}`).set({ emailVerified: false }, { merge: true });
      await admin.doc(`users/${hidden.uid}`).update({ isDiscoverable: false });
      const likes = await she.call<Likes>("getLikesYou", {});
      expect(likes.count).toBe(1);
      expect(likes.profiles.map((p) => p.uid)).toEqual([he.uid]);
      expect(likes).toMatchObject({ locked: false, acceptable: true });
    });
  });
});
