/**
 * Presence and the paid-chat gate end to end, through the Functions emulator,
 * the real security rules and the same client SDK calls the app makes. Uses
 * only isolated emulator accounts; nothing here touches a real member.
 */
import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  Firestore,
  getDocs,
  getFirestore,
  increment,
  serverTimestamp,
  setDoc,
  terminate,
  updateDoc,
  writeBatch
} from "firebase/firestore";
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
const clients: Client[] = [];
let counter = 0;

async function makeClient(label: string): Promise<Client> {
  counter += 1;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "demo-key", authDomain: `${PROJECT_ID}.firebaseapp.com` }, `pc-${label}-${counter}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATORS.auth}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...hostAndPort(EMULATORS.firestore));
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, ...hostAndPort(EMULATORS.functions));
  const credential = await createUserWithEmailAndPassword(auth, `pc.${label}.${Date.now()}.${counter}@example.com`, "Password123!");
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function onboard(client: Client, name: string, gender: "woman" | "man") {
  const now = Date.now();
  await setDoc(doc(client.db, "users", client.uid, "private", "settings"), {
    showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60, maxDistanceKm: 100, locationEnabled: true,
    location: { lat: 28.6139, lng: 77.209, updatedAt: now }, sharedVibesOnly: false, openToCasual: false, notifications: { matches: true, messages: true }, updatedAt: now
  });
  await setDoc(doc(client.db, "users", client.uid), {
    uid: client.uid, displayName: name, age: 27, gender, pronouns: "", city: "Delhi", bio: `Hi, I'm ${name}.`, photoUrls: [`https://example.com/${client.uid}.jpg`],
    interests: ["canvas"], intentions: ["long-term"], vibes: ["cozy"], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true,
    createdAt: now, updatedAt: now, lastActiveAt: now
  });
  await waitFor(async () => (await admin.doc(`discovery/${client.uid}`).get()).get("visible") === true);
}

/** A real mutual match: both like each other through the swipe function. */
async function match(a: Client, b: Client): Promise<string> {
  await a.call("swipe", { targetUid: b.uid, type: "like" });
  const result = await b.call<{ matched: boolean; matchId: string }>("swipe", { targetUid: a.uid, type: "like" });
  expect(result.matched).toBe(true);
  return result.matchId;
}

function send(client: Client, matchId: string, others: string[], text = "Hello") {
  const batch = writeBatch(client.db);
  batch.set(doc(collection(client.db, "matches", matchId, "messages")), { senderId: client.uid, text, createdAt: serverTimestamp() });
  batch.update(doc(client.db, "matches", matchId), {
    lastMessage: { text, senderId: client.uid, createdAt: serverTimestamp() },
    lastActivityAt: serverTimestamp(),
    ...Object.fromEntries(others.map((other) => [`unread.${other}`, increment(1)]))
  });
  return batch.commit();
}

type View = { state: "online"; onlineUntil: number } | { state: "offline"; lastActiveAt: number | null } | { state: "unavailable" };
type PresenceReply = { enabled: boolean; idleTimeoutMs: number; serverNow: number; members: Record<string, View> };
type ChatAccess = { enforced: boolean; canSend: boolean; unlimited: boolean; premiumUntil: number | null; unlock: { status: string; reason?: string; priceInr: number } };

const beat = (client: Client, sessionId: string, state: "active" | "background" | "ended", idleMs = 0) =>
  client.call<{ enabled: boolean; sharing: boolean }>("presenceBeat", { sessionId, platform: "web", state, idleMs });

beforeAll(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false });
});

afterAll(async () => {
  await admin.doc("runtime/presence").delete();
  await admin.doc("runtime/trust").set({ requireVerification: false });
  await Promise.all(clients.map(async (client) => {
    await terminate(client.db);
    await deleteApp(client.app);
  }));
});

describe("activity-based presence", () => {
  let riya: Client;
  let kabir: Client;
  let stranger: Client;
  const tab = "riya-tab-aaaaaaaa";

  beforeAll(async () => {
    [riya, kabir, stranger] = await Promise.all([makeClient("riya"), makeClient("kabir"), makeClient("stranger")]);
    await Promise.all([onboard(riya, "Riya", "woman"), onboard(kabir, "Kabir", "man"), onboard(stranger, "Stranger", "man")]);
    await match(riya, kabir);
  });

  test("is off until enabled, and stores nothing while off", async () => {
    await admin.doc("runtime/presence").delete();
    expect(await beat(riya, tab, "active")).toMatchObject({ enabled: false });
    expect((await admin.doc(`presence/${riya.uid}`).get()).exists).toBe(false);
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid]).toEqual({ state: "unavailable" });
    await admin.doc("runtime/presence").set({ enabled: true, idleTimeoutMs: 20_000, leaseMs: 30_000 });
  });

  test("matches see an active member online; strangers see nothing", async () => {
    await beat(riya, tab, "active");
    const seen = await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid, stranger.uid] });
    expect(seen.enabled).toBe(true);
    expect(seen.members[riya.uid]).toMatchObject({ state: "online" });
    expect(seen.members[stranger.uid]).toEqual({ state: "unavailable" });
    expect((await stranger.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid]).toEqual({ state: "unavailable" });
    // Only timestamps and session state are stored.
    const stored = (await admin.doc(`presence/${riya.uid}`).get()).data()!;
    expect(Object.keys(stored).sort()).toEqual(["lastActiveAt", "sessions", "updatedAt"]);
    expect(Object.keys(stored.sessions[tab]).sort()).toEqual(["activeAt", "createdAt", "foreground", "heartbeatAt", "platform"]);
  });

  test("an open tab that only heartbeats goes offline after the idle timeout, without any new write", async () => {
    await beat(riya, tab, "ended");
    const idleTab = "riya-idle-cccccccc";
    // Last tap 13 s ago with a 20 s timeout: online for a few more seconds only.
    await beat(riya, idleTab, "active", 13_000);
    const before = await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] });
    expect(before.members[riya.uid].state).toBe("online");
    const until = (before.members[riya.uid] as { onlineUntil: number }).onlineUntil;
    expect(until - before.serverNow).toBeLessThanOrEqual(7_500);
    await sleep(until - before.serverNow + 600);
    // A heartbeat with no interaction doesn't bring her back.
    await beat(riya, idleTab, "active", 21_000);
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid]).toMatchObject({ state: "offline", lastActiveAt: expect.any(Number) });
  });

  test("hidden tabs don't count, other devices do, and logging out ends a session", async () => {
    const phone = "riya-phone-bbbbbbbb";
    await beat(riya, tab, "active");
    await riya.call("presenceBeat", { sessionId: phone, platform: "android", state: "active", idleMs: 0 });
    await beat(riya, tab, "background");
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid].state).toBe("online");
    await riya.call("presenceBeat", { sessionId: phone, platform: "android", state: "ended", idleMs: 0 });
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid].state).toBe("offline");
    // Foregrounding again starts a fresh active session.
    await beat(riya, tab, "active");
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid].state).toBe("online");
  });

  test("members can only write their own sessions, and can't read the raw data", async () => {
    await expect(setDoc(doc(kabir.db, "presence", riya.uid), { sessions: {} })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(setDoc(doc(riya.db, "presence", riya.uid), { lastActiveAt: Date.now() })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(riya.call("presenceBeat", { sessionId: "bad id!", platform: "web", state: "active", idleMs: 0 })).rejects.toThrow(/Invalid presence/);
    await expect(kabir.call("getPresence", { uids: Array.from({ length: 51 }, (_, index) => `u${index}`) })).rejects.toThrow(/at most 50/);
  });

  test("hiding activity stops exposing online and last-active everywhere, including discovery", async () => {
    await beat(riya, tab, "active");
    await updateDoc(doc(riya.db, "users", riya.uid, "private", "settings"), { showPresence: false });
    await waitFor(async () => !(await admin.doc(`presence/${riya.uid}`).get()).exists && (await admin.doc(`users/${riya.uid}`).get()).get("lastActiveAt") === undefined);
    await waitFor(async () => (await admin.doc(`discovery/${riya.uid}`).get()).get("presenceHidden") === true);
    // An older app or a second device that still writes lastActiveAt has it taken back out.
    await updateDoc(doc(riya.db, "users", riya.uid), { lastActiveAt: Date.now() });
    await waitFor(async () => (await admin.doc(`users/${riya.uid}`).get()).get("lastActiveAt") === undefined);
    // Even if a presence document were left behind, the setting alone hides it.
    await admin.doc(`presence/${riya.uid}`).set({ sessions: { stale: { platform: "web", foreground: true, activeAt: Date.now(), heartbeatAt: Date.now(), createdAt: Date.now() } }, lastActiveAt: Date.now() });
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid]).toEqual({ state: "unavailable" });
    await admin.doc(`presence/${riya.uid}`).delete();
    expect(await beat(riya, tab, "active")).toMatchObject({ enabled: true, sharing: false });
    expect((await admin.doc(`presence/${riya.uid}`).get()).exists).toBe(false);
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid]).toEqual({ state: "unavailable" });
    // Discovery recency still works (it only orders feeds), but strangers never see it.
    const indexed = (await admin.doc(`discovery/${riya.uid}`).get()).get("lastActiveAt");
    await admin.doc(`discovery/${riya.uid}`).update({ lastActiveAt: 1 });
    await riya.call("touchActivity");
    expect((await admin.doc(`discovery/${riya.uid}`).get()).get("lastActiveAt")).toBeGreaterThanOrEqual(indexed);
    const feed = await stranger.call<{ profiles: Array<{ uid: string; lastActiveAt: number; reasons: Array<{ kind: string }> }> }>("getDiscoverFeed", {});
    const card = feed.profiles.find((profile) => profile.uid === riya.uid);
    expect(card).toBeDefined();
    expect(card!.lastActiveAt).toBe(0);
    expect(card!.reasons.map((reason) => reason.kind)).not.toContain("active");
    // Sharing again works as before.
    await updateDoc(doc(riya.db, "users", riya.uid, "private", "settings"), { showPresence: true });
    await waitFor(async () => (await admin.doc(`discovery/${riya.uid}`).get()).get("presenceHidden") === false);
    await beat(riya, tab, "active");
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid].state).toBe("online");
  });

  test("blocking or unmatching ends visibility; a ban erases presence", async () => {
    await beat(riya, tab, "active");
    await riya.call("blockUser", { targetUid: kabir.uid });
    expect((await kabir.call<PresenceReply>("getPresence", { uids: [riya.uid] })).members[riya.uid]).toEqual({ state: "unavailable" });
    await admin.doc(`moderation/${riya.uid}`).set({ status: "banned" }, { merge: true });
    await waitFor(async () => !(await admin.doc(`presence/${riya.uid}`).get()).exists);
    await beat(riya, tab, "active");
    expect((await admin.doc(`presence/${riya.uid}`).get()).exists).toBe(false);
  });
});

describe("paid chat gate", () => {
  let asha: Client;
  let dev: Client;
  let matchId: string;

  beforeAll(async () => {
    [asha, dev] = await Promise.all([makeClient("asha"), makeClient("dev")]);
    await Promise.all([onboard(asha, "Asha", "woman"), onboard(dev, "Dev", "man")]);
    matchId = await match(asha, dev);
  });
  // The paid-chat switches live in runtime/trust, next to the verification policy.
  const gate = (on: boolean) => admin.doc("runtime/trust").set({ requireVerification: false, ...(on ? { enforcePaidChat: true } : {}) });
  afterEach(async () => {
    await gate(false);
  });

  test("with the gate off (the default), everyone keeps chatting free", async () => {
    await send(asha, matchId, [dev.uid]);
    await send(dev, matchId, [asha.uid]);
    expect(await dev.call<ChatAccess>("getChatAccess")).toMatchObject({ enforced: false, canSend: false });
  });

  test("unpaid members can't send by direct writes; a paid sender reaches an unpaid recipient who can read but not reply", async () => {
    await gate(true);
    await expect(send(asha, matchId, [dev.uid])).rejects.toMatchObject({ code: "permission-denied" });
    // Asha's Unlimited Chat (granted here directly; the payment path is covered in chatPayments).
    await admin.doc(`chatUnlocks/${asha.uid}`).set({ status: "active", orderId: "order_TestGrant001", product: "paire_unlimited_chat" });
    expect(await asha.call<ChatAccess>("getChatAccess")).toMatchObject({ enforced: true, canSend: true, unlimited: true, unlock: { status: "owned" } });
    await send(asha, matchId, [dev.uid], "Paid hello");
    // Dev reads and marks read for free, but can't reply.
    const messages = await getDocs(collection(dev.db, "matches", matchId, "messages"));
    expect(messages.docs.map((message) => message.get("text"))).toContain("Paid hello");
    await updateDoc(doc(dev.db, "matches", matchId), { [`unread.${dev.uid}`]: 0, [`lastReadAt.${dev.uid}`]: serverTimestamp() });
    await expect(send(dev, matchId, [asha.uid])).rejects.toMatchObject({ code: "permission-denied" });
    const access = await dev.call<ChatAccess>("getChatAccess");
    expect(access).toMatchObject({ enforced: true, canSend: false, unlimited: false });
    // Sales aren't switched on in this environment: no checkout can open, nobody is charged.
    expect(access.unlock).toMatchObject({ status: "unavailable", reason: "sales-off", priceInr: 49 });
    await expect(dev.call("createChatUnlockOrder", { amount: 1 })).rejects.toThrow(/isn't available yet/);
    // Clients can't hand themselves the mirror.
    await expect(setDoc(doc(dev.db, "moderation", dev.uid), { chatAccess: { unlimited: true } }, { merge: true })).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("safety actions stay free, and payment never reopens a blocked chat", async () => {
    await gate(true);
    const reportId = doc(collection(dev.db, "reports")).id;
    await dev.call("submitReport", { reportId, targetUid: asha.uid, reason: "harassment", details: "Test report from an isolated emulator account", matchId });
    await dev.call("blockUser", { targetUid: asha.uid });
    await expect(send(asha, matchId, [dev.uid])).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("server-written system notices keep working under the gate", async () => {
    await gate(true);
    const members = await Promise.all(["d1", "d2", "d3", "d4"].map((label) => makeClient(label)));
    const [a, b, c, d] = members;
    const duoChat = `duo_${[a.uid, b.uid].sort().join("_")}__${[c.uid, d.uid].sort().join("_")}`;
    await admin.doc(`matches/${duoChat}`).set({
      kind: "duo", participants: members.map((member) => member.uid), memberHistory: members.map((member) => member.uid), active: true,
      sides: { ab: [a.uid, b.uid], cd: [c.uid, d.uid] }, profiles: { [a.uid]: { displayName: "Arjun", photoUrl: null } }, unread: {}, lastReadAt: {}
    });
    await expect(send(b, duoChat, [a.uid, c.uid, d.uid])).rejects.toMatchObject({ code: "permission-denied" });
    await a.call("leaveChat", { matchId: duoChat });
    const notes = await admin.collection(`matches/${duoChat}/messages`).where("senderId", "==", "system").get();
    expect(notes.docs.map((note) => note.get("text"))).toEqual(["Arjun left the chat."]);
  });
});
