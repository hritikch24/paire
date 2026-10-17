/**
 * End-to-end tests for the Cloud Functions against the Firebase emulators, using
 * the same client SDK calls the app makes. Run with:
 *   firebase emulators:exec --project demo-muse --only auth,firestore,functions,storage \
 *     "npm --prefix firebase/functions run test:integration"
 */
import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  Firestore,
  getDoc,
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
import { activeGarbaSeason, seasonNights, upcomingGarbaNights } from "../src/lib/garba";

const PROJECT_ID = "demo-muse";
const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const MUMBAI = { lat: 19.076, lng: 72.8777 };

// Set by `firebase emulators:exec` (functions: by scripts/verify.sh); defaults match firebase.json.
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

type Client = {
  uid: string;
  app: FirebaseApp;
  db: Firestore;
  call: <T = unknown>(name: string, data?: unknown) => Promise<T>;
};

type FeedResult = { profiles: Array<Record<string, unknown> & { uid: string }>; cursor: unknown };

const clients: Client[] = [];
let counter = 0;

/** A signed-in member; `confirmEmail: false` leaves the email unconfirmed. */
async function makeClient(label: string, { confirmEmail = true } = {}): Promise<Client> {
  counter += 1;
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: "demo-key", authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `${label}-${counter}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATORS.auth}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...hostAndPort(EMULATORS.firestore));
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, ...hostAndPort(EMULATORS.functions));
  const credential = await createUserWithEmailAndPassword(
    auth,
    `${label}.${Date.now()}.${counter}@example.com`,
    "Password123!"
  );
  if (confirmEmail) {
    await getAdminAuth().updateUser(credential.user.uid, { emailVerified: true });
    await credential.user.getIdToken(true);
  }
  const client: Client = {
    uid: credential.user.uid,
    app,
    db,
    call: async <T,>(name: string, data?: unknown) =>
      (await httpsCallable(functions, name)(data)).data as T
  };
  clients.push(client);
  return client;
}

type Persona = {
  name: string;
  gender: "woman" | "man";
  showMe: Array<"woman" | "man">;
  age: number;
  /** Open to a one-night stand. */
  casual?: boolean;
  /** Defaults to one photo. */
  photo?: boolean;
};

async function onboard(client: Client, persona: Persona) {
  const now = Date.now();
  await setDoc(doc(client.db, "users", client.uid, "private", "settings"), {
    showMe: persona.showMe,
    ageMin: 18,
    ageMax: 60,
    maxDistanceKm: 100,
    locationEnabled: true,
    location: { ...MUMBAI, updatedAt: now },
    sharedVibesOnly: false,
    openToCasual: persona.casual ?? false,
    notifications: { matches: true, messages: true },
    updatedAt: now
  });
  await setDoc(doc(client.db, "users", client.uid), {
    uid: client.uid,
    displayName: persona.name,
    age: persona.age,
    gender: persona.gender,
    pronouns: "",
    city: "Mumbai",
    bio: `Hi, I'm ${persona.name}.`,
    photoUrls: persona.photo === false ? [] : [`https://example.com/${persona.name}.jpg`],
    interests: ["canvas", "soundscape"],
    intentions: ["long-term"],
    vibes: ["cozy"],
    quickAnswers: [],
    isDiscoverable: true,
    onboardingComplete: true,
    safetyConfirmed: true,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now
  });
  await waitFor(async () => (await admin.doc(`discovery/${client.uid}`).get()).get("visible") === true);
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function sendMessage(client: Client, matchId: string, otherUid: string, text: string) {
  const batch = writeBatch(client.db);
  batch.set(doc(collection(client.db, "matches", matchId, "messages")), {
    senderId: client.uid,
    text,
    createdAt: serverTimestamp()
  });
  batch.update(doc(client.db, "matches", matchId), {
    lastMessage: { text, senderId: client.uid, createdAt: serverTimestamp() },
    lastActivityAt: serverTimestamp(),
    [`unread.${otherUid}`]: increment(1)
  });
  await batch.commit();
}

beforeAll(async () => { await admin.doc("runtime/trust").set({ requireVerification: false }); });

afterAll(async () => {
  // Stop emulator streams before deleting app instances, including clients whose
  // intentionally denied writes left a reconnecting transport during teardown.
  await Promise.all(clients.map(async (client) => {
    await terminate(client.db);
    await deleteApp(client.app);
  }));
});

describe("trust and free allowance", () => {
  it("returns only the caller's approval, invalidates changed photos and refuses a forged approval", async () => {
    const member = await makeClient("verification-member");
    await onboard(member, { name: "NCR member", gender: "woman", showMe: ["man"], age: 27 });
    expect(await member.call("getVerificationStatus", { uid: "someone-else", verified: true })).toEqual({ state: "unverified", captureAvailable: false, method: null, required: false });
    const photoUrls = (await admin.doc(`users/${member.uid}`).get()).get("photoUrls");
    await expect(setDoc(doc(member.db, "moderation", member.uid), { verification: { status: "verified" } })).rejects.toMatchObject({ code: "permission-denied" });
    await admin.doc(`moderation/${member.uid}`).set({ emailVerified: true,  status: "ok", verification: { schemaVersion: 2, storageBound: true, status: "verified", photoUrls, verifiedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 } });
    expect(await member.call("getVerificationStatus")).toEqual({ state: "verified", captureAvailable: false, method: null, required: false });
    await updateDoc(doc(member.db, "users", member.uid), { photoUrls: ["https://example.com/replaced.jpg"] });
    expect(await member.call("getVerificationStatus")).toEqual({ state: "needs_recheck", captureAvailable: false, method: null, required: false });
  });

  it("unconfirmed and throwaway emails can't make a profile or date", async () => {
    const member = await makeClient("unconfirmed-member", { confirmEmail: false });
    await expect(onboard(member, { name: "Unconfirmed", gender: "woman", showMe: ["man"], age: 26 })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(member.call("getDiscoverFeed")).rejects.toMatchObject({ code: "functions/failed-precondition", message: expect.stringMatching(/Confirm your email/) });
    expect(await member.call("syncAccountChecks")).toEqual({ emailVerified: false, disposableEmail: false });
    // Opening the emailed link confirms the address; the app then asks the server to re-check.
    await getAdminAuth().updateUser(member.uid, { emailVerified: true });
    expect(await member.call("syncAccountChecks")).toEqual({ emailVerified: true, disposableEmail: false });
    expect((await admin.doc(`moderation/${member.uid}`).get()).get("emailVerified")).toBe(true);

    const throwaway = await makeClient("throwaway-member");
    await getAdminAuth().updateUser(throwaway.uid, { email: `throwaway.${Date.now()}@mailinator.com`, emailVerified: true });
    expect(await throwaway.call("syncAccountChecks")).toEqual({ emailVerified: false, disposableEmail: true });
  });

  it("checks allowances without spending them, reports UTC expiry and reads only the caller", async () => {
    const member = await makeClient("allowance-member");
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const ref = admin.doc(`limits/${member.uid}/daily/${day}`);
    const initial = await member.call<{ remaining: { likes: number; supers: number }; limits: { likes: number; supers: number }; resetsAt: number }>("getDailyAllowance", { uid: "someone-else" });
    expect(initial.remaining).toEqual(initial.limits);
    expect((await ref.get()).exists).toBe(false);
    expect(new Date(initial.resetsAt).getUTCHours()).toBe(0);
    expect(initial.resetsAt).toBeGreaterThan(Date.now());
    await ref.set({ likes: 7, supers: 1 });
    const next = await member.call<typeof initial>("getDailyAllowance");
    expect(next.remaining).toEqual({ likes: initial.limits.likes - 7, supers: initial.limits.supers - 1 });
    expect((await ref.get()).get("likes")).toBe(7);
  });
});

describe("discovery, matching and chat", () => {
  let alexa: Client;
  let jules: Client;
  let casey: Client;
  let matchId: string;

  beforeAll(async () => {
    [alexa, jules, casey] = await Promise.all([
      makeClient("alexa"),
      makeClient("jules"),
      makeClient("casey")
    ]);
    await onboard(alexa, { name: "Alexa", gender: "woman", showMe: ["man"], age: 28 });
    await onboard(jules, { name: "Jules", gender: "man", showMe: ["woman"], age: 30 });
    await onboard(casey, { name: "Casey", gender: "woman", showMe: ["woman"], age: 27 });
  });

  test("feeds respect both people's preferences and never leak private data", async () => {
    const alexaFeed = await alexa.call<FeedResult>("getDiscoverFeed", {});
    const alexaSees = alexaFeed.profiles.map((profile) => profile.uid);
    expect(alexaSees).toContain(jules.uid);
    expect(alexaSees).not.toContain(casey.uid);
    expect(alexaSees).not.toContain(alexa.uid);

    const julesView = alexaFeed.profiles.find((profile) => profile.uid === jules.uid)!;
    expect(julesView.displayName).toBe("Jules");
    expect(julesView.distanceKm).toBe(1);
    expect(julesView).not.toHaveProperty("location");
    expect(julesView).not.toHaveProperty("email");
    expect(julesView).not.toHaveProperty("showMe");

    // Casey wants women, Alexa only wants men: not mutual, so neither sees the other.
    const caseyFeed = await casey.call<FeedResult>("getDiscoverFeed", {});
    expect(caseyFeed.profiles.map((profile) => profile.uid)).not.toContain(alexa.uid);
  });

  test("a match is created only when the like is mutual", async () => {
    const first = await alexa.call<{ matched: boolean }>("swipe", { targetUid: jules.uid, type: "like" });
    expect(first.matched).toBe(false);

    const julesFeed = await jules.call<FeedResult>("getDiscoverFeed", {});
    expect(julesFeed.profiles.map((profile) => profile.uid)).toContain(alexa.uid);

    const second = await jules.call<{ matched: boolean; matchId: string; remaining: { supers: number } }>(
      "swipe",
      { targetUid: alexa.uid, type: "super" }
    );
    expect(second.matched).toBe(true);
    expect(second.remaining.supers).toBe(0);
    matchId = second.matchId;

    const match = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(match.active).toBe(true);
    expect(match.participants).toEqual([alexa.uid, jules.uid].sort());
    expect(match.profiles[alexa.uid].displayName).toBe("Alexa");
    expect(match.superLikedBy).toEqual([jules.uid]);

    // Already-swiped people stay out of the feed.
    const alexaFeed = await alexa.call<FeedResult>("getDiscoverFeed", {});
    expect(alexaFeed.profiles.map((profile) => profile.uid)).not.toContain(jules.uid);
  });

  test("swipes are validated and idempotent", async () => {
    await expect(alexa.call("swipe", { targetUid: alexa.uid, type: "like" })).rejects.toThrow();
    await expect(alexa.call("swipe", { targetUid: "does-not-exist", type: "like" })).rejects.toThrow();
    const again = await alexa.call<{ matched: boolean; matchId: string }>("swipe", {
      targetUid: jules.uid,
      type: "like"
    });
    expect(again.matched).toBe(false);
    expect(again.matchId).toBe(matchId);
  });

  test("messages update the preview and the other person's unread count", async () => {
    await sendMessage(alexa, matchId, jules.uid, "Hey Jules!");
    let match = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(match.lastMessage.text).toBe("Hey Jules!");
    expect(match.unread[jules.uid]).toBe(1);
    expect(match.unread[alexa.uid]).toBe(0);

    await updateDoc(doc(jules.db, "matches", matchId), {
      [`unread.${jules.uid}`]: 0,
      [`lastReadAt.${jules.uid}`]: serverTimestamp()
    });
    match = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(match.unread[jules.uid]).toBe(0);
  });

  test("profile edits refresh the name shown on matches", async () => {
    await updateDoc(doc(alexa.db, "users", alexa.uid), { displayName: "Alexa R", updatedAt: Date.now() });
    await waitFor(
      async () =>
        (await admin.doc(`matches/${matchId}`).get()).get(`profiles.${alexa.uid}.displayName`) === "Alexa R"
    );
  });

  test("passes can be undone, likes cannot", async () => {
    const dev = await makeClient("dev");
    await onboard(dev, { name: "Dev", gender: "man", showMe: ["woman"], age: 29 });
    await casey.call("swipe", { targetUid: dev.uid, type: "nope" });
    await casey.call("undoSwipe", { targetUid: dev.uid });
    expect((await admin.doc(`swipes/${casey.uid}/outgoing/${dev.uid}`).get()).exists).toBe(false);
    await expect(alexa.call("undoSwipe", { targetUid: jules.uid })).rejects.toThrow();
  });

  test("blocking ends the match and stops messages both ways", async () => {
    await jules.call("blockUser", { targetUid: alexa.uid });
    const match = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(match.active).toBe(false);
    expect(match.endReason).toBe("block");
    await expect(sendMessage(alexa, matchId, jules.uid, "Hello?")).rejects.toThrow();
    await expect(sendMessage(jules, matchId, alexa.uid, "Hello?")).rejects.toThrow();
  });

  test("deleting an account erases the member's data", async () => {
    await jules.call("deleteAccount");
    expect((await admin.doc(`users/${jules.uid}`).get()).exists).toBe(false);
    expect((await admin.doc(`users/${jules.uid}/private/settings`).get()).exists).toBe(false);
    expect((await admin.doc(`discovery/${jules.uid}`).get()).exists).toBe(false);
    expect((await admin.doc(`matches/${matchId}`).get()).exists).toBe(false);
    expect((await admin.doc(`swipes/${alexa.uid}/outgoing/${jules.uid}`).get()).exists).toBe(false);
    expect((await admin.doc(`blocks/${jules.uid}/blocked/${alexa.uid}`).get()).exists).toBe(false);
    await expect(getAdminAuth().getUser(jules.uid)).rejects.toThrow();
  });
});

describe("matchmaker, likes and AI suggestions", () => {
  let ria: Client;
  let omar: Client;
  let neil: Client;
  let zoya: Client;
  type Card = FeedResult["profiles"][number] & {
    compatibility: number;
    reasons: Array<{ kind: string }>;
    casualMatch: boolean;
    superLikedYou: boolean;
  };
  const card = (feed: { profiles: unknown[] }, uid: string) =>
    (feed.profiles as Card[]).find((profile) => profile.uid === uid);

  beforeAll(async () => {
    [ria, omar, neil, zoya] = await Promise.all([
      makeClient("ria"),
      makeClient("omar"),
      makeClient("neil"),
      makeClient("zoya")
    ]);
    await onboard(ria, { name: "Ria", gender: "woman", showMe: ["man"], age: 26, casual: true });
    await onboard(omar, { name: "Omar", gender: "man", showMe: ["woman"], age: 29, casual: true });
    await onboard(neil, { name: "Neil", gender: "man", showMe: ["woman"], age: 31 });
    await onboard(zoya, { name: "Zoya", gender: "woman", showMe: ["man"], age: 25, photo: false });
  });

  test("every card says why you'd click; a one-night-stand match shows only when both opted in", async () => {
    const riaFeed = await ria.call<FeedResult>("getDiscoverFeed", {});
    const omarCard = card(riaFeed, omar.uid)!;
    expect(omarCard.casualMatch).toBe(true);
    expect(omarCard.reasons[0]).toEqual({ kind: "casual" });
    expect(omarCard.compatibility).toBeGreaterThanOrEqual(62);
    expect(omarCard.compatibility).toBeLessThanOrEqual(98);

    const neilCard = card(riaFeed, neil.uid)!;
    expect(neilCard.casualMatch).toBe(false);
    expect(neilCard.reasons.map((reason) => reason.kind)).not.toContain("casual");

    // Neil didn't opt in, so he never learns that Ria did.
    const riaForNeil = card(await neil.call<FeedResult>("getDiscoverFeed", {}), ria.uid)!;
    expect(riaForNeil.casualMatch).toBe(false);
    expect(riaForNeil.reasons.map((reason) => reason.kind)).not.toContain("casual");
  });

  test("profiles without a photo can still be discovered", async () => {
    const omarFeed = await omar.call<FeedResult>("getDiscoverFeed", {});
    expect(card(omarFeed, zoya.uid)).toBeDefined();
  });

  test("likes you lists people waiting for an answer, until you answer", async () => {
    await omar.call("swipe", { targetUid: ria.uid, type: "like" });
    await neil.call("swipe", { targetUid: ria.uid, type: "super" });
    let likes = await ria.call<{ profiles: Card[] }>("getLikesYou", {});
    expect(card(likes, omar.uid)).toMatchObject({ superLikedYou: false, casualMatch: true });
    expect(card(likes, neil.uid)).toMatchObject({ superLikedYou: true, casualMatch: false });

    const result = await ria.call<{ matched: boolean; matchId: string }>("swipe", { targetUid: omar.uid, type: "like" });
    expect(result.matched).toBe(true);
    likes = await ria.call<{ profiles: Card[] }>("getLikesYou", {});
    expect(card(likes, omar.uid)).toBeUndefined();
    expect(card(likes, neil.uid)).toBeDefined();
  });

  test("AI suggestions work only in your own chats and always offer three", async () => {
    const matchId = [ria.uid, omar.uid].sort().join("_");
    const openers = await ria.call<{ suggestions: string[]; source: string }>("suggestOpeners", { matchId });
    expect(openers.suggestions).toHaveLength(3);
    expect(openers.source).toBe("muse");
    await expect(neil.call("suggestOpeners", { matchId })).rejects.toThrow();
    await expect(ria.call("suggestOpeners", { matchId: "../nope" })).rejects.toThrow();

    const bios = await ria.call<{ suggestions: string[] }>("suggestBio", {});
    expect(bios.suggestions).toHaveLength(3);
  });
});

describe("test cohort (Play review / QA accounts)", () => {
  test("test accounts only see each other and never appear to real members", async () => {
    const [reviewer, tester, member] = await Promise.all([
      makeClient("reviewer"),
      makeClient("tester"),
      makeClient("member")
    ]);
    // Admins flag test accounts in the console; the trigger re-indexes them.
    await admin.doc(`moderation/${reviewer.uid}`).set({ emailVerified: true,  status: "ok", cohort: "test" });
    await admin.doc(`moderation/${tester.uid}`).set({ emailVerified: true,  status: "ok", cohort: "test" });
    await onboard(reviewer, { name: "Reviewer", gender: "man", showMe: ["woman"], age: 35 });
    await onboard(tester, { name: "Tester", gender: "woman", showMe: ["man"], age: 33 });
    await onboard(member, { name: "Member", gender: "woman", showMe: ["man"], age: 34 });
    await waitFor(async () => (await admin.doc(`discovery/${tester.uid}`).get()).get("cohort") === "test");

    const reviewerFeed = await reviewer.call<FeedResult>("getDiscoverFeed", {});
    const seenByReviewer = reviewerFeed.profiles.map((profile) => profile.uid);
    expect(seenByReviewer).toContain(tester.uid);
    expect(seenByReviewer).not.toContain(member.uid);

    const memberFeed = await member.call<FeedResult>("getDiscoverFeed", {});
    expect(memberFeed.profiles.map((profile) => profile.uid)).not.toContain(reviewer.uid);
  });
});

describe("duos: double dates with a friend", () => {
  test("two pairs of friends team up, match, chat as four, and can leave", async () => {
    const [riya, neha, arjun, kabir] = await Promise.all([
      makeClient("riya"),
      makeClient("neha"),
      makeClient("arjun"),
      makeClient("kabir")
    ]);
    await onboard(riya, { name: "Riya", gender: "woman", showMe: ["man"], age: 26, casual: true });
    await onboard(neha, { name: "Neha", gender: "woman", showMe: ["man"], age: 27 });
    await onboard(arjun, { name: "Arjun", gender: "man", showMe: ["woman"], age: 28, casual: true });
    await onboard(kabir, { name: "Kabir", gender: "man", showMe: ["woman"], age: 29 });

    // Invites: one friend makes a code, the other enters it, and the first confirms.
    const { code } = await riya.call<{ code: string }>("createDuoInvite");
    await expect(riya.call("acceptDuoInvite", { code })).rejects.toThrow(/own code/);
    await expect(neha.call("acceptDuoInvite", { code: "ZZZZZ2" })).rejects.toThrow();
    const stranger = await makeClient("stranger");
    await onboard(stranger, { name: "Stranger", gender: "man", showMe: ["woman"], age: 30 });
    await neha.call("acceptDuoInvite", { code: code.toLowerCase() });
    // A code only takes one request, and nothing happens until the inviter says yes.
    await expect(stranger.call("acceptDuoInvite", { code })).rejects.toThrow(/Someone else/);
    expect((await admin.doc(`users/${riya.uid}/private/duoInvite`).get()).get("request.displayName")).toBe("Neha");
    await expect(riya.call("getDuoFeed")).rejects.toThrow(/Team up/);
    const { duoId: girls } = await riya.call<{ duoId: string }>("answerDuoRequest", { accept: true });
    expect((await admin.doc(`users/${neha.uid}/private/duoRequest`).get()).exists).toBe(false);

    // Declining uses the code up; guessing codes is limited per day.
    const { code: code2 } = await arjun.call<{ code: string }>("createDuoInvite");
    await stranger.call("acceptDuoInvite", { code: code2 });
    expect((await arjun.call<{ duoId: string | null }>("answerDuoRequest", { accept: false })).duoId).toBeNull();
    await expect(kabir.call("acceptDuoInvite", { code: code2 })).rejects.toThrow(/expired/);
    for (let i = 0; i < 8; i += 1) await stranger.call("acceptDuoInvite", { code: "ZZZZZ2" }).catch(() => undefined);
    await expect(stranger.call("acceptDuoInvite", { code: "ZZZZZ3" })).rejects.toThrow(/limit/);

    const { code: code3 } = await arjun.call<{ code: string }>("createDuoInvite");
    await kabir.call("acceptDuoInvite", { code: code3 });
    const { duoId: boys } = await arjun.call<{ duoId: string }>("answerDuoRequest", { accept: true });
    await expect(riya.call("createDuoInvite")).rejects.toThrow(/already in a Duo/);

    // Each pair sees the other in its deck; the casual flag never shows.
    type Feed = { duos: Array<{ duoId: string; likedYou: boolean; members: Array<Record<string, unknown>> }> };
    const riyaFeed = await riya.call<Feed>("getDuoFeed");
    const boysCard = riyaFeed.duos.find((card) => card.duoId === boys)!;
    expect(boysCard.members.map((member) => member.displayName).sort()).toEqual(["Arjun", "Kabir"]);
    expect(boysCard.members.every((member) => member.casualMatch === false)).toBe(true);
    expect(boysCard.members[0]).not.toHaveProperty("location");

    // A like can be taken back within a few minutes; either friend's like counts for the pair.
    await riya.call("duoSwipe", { targetDuoId: boys, type: "like" });
    await neha.call("undoDuoSwipe", { targetDuoId: boys });
    expect((await admin.doc(`duoSwipes/${girls}/outgoing/${boys}`).get()).exists).toBe(false);
    const first = await riya.call<{ matched: boolean }>("duoSwipe", { targetDuoId: boys, type: "like" });
    expect(first.matched).toBe(false);
    const kabirFeed = await kabir.call<Feed>("getDuoFeed");
    expect(kabirFeed.duos.find((card) => card.duoId === girls)?.likedYou).toBe(true);
    const second = await kabir.call<{ matched: boolean; matchId: string }>("duoSwipe", { targetDuoId: girls, type: "like" });
    expect(second.matched).toBe(true);
    await expect(riya.call("undoDuoSwipe", { targetDuoId: boys })).rejects.toThrow(/already matched/);

    const matchId = second.matchId;
    const chat = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(chat.kind).toBe("duo");
    expect(chat.participants).toHaveLength(4);
    expect(Object.keys(chat.profiles)).toHaveLength(4);

    // Everyone can message the group; a scam warning reaches the other three only.
    const sendToGroup = async (client: Client, text: string) => {
      const others = chat.participants.filter((uid: string) => uid !== client.uid);
      const batch = writeBatch(client.db);
      const ref = doc(collection(client.db, "matches", matchId, "messages"));
      batch.set(ref, { senderId: client.uid, text, createdAt: serverTimestamp() });
      batch.update(doc(client.db, "matches", matchId), {
        lastMessage: { text, senderId: client.uid, createdAt: serverTimestamp() },
        lastActivityAt: serverTimestamp(),
        ...Object.fromEntries(others.map((uid: string) => [`unread.${uid}`, increment(1)]))
      });
      await batch.commit();
      return ref.id;
    };
    await sendToGroup(neha, "Hi both! Gig this weekend?");
    const scamId = await sendToGroup(arjun, "Please share the OTP you just got");
    const warning = admin.doc(`matches/${matchId}/safety/${scamId}`);
    await waitFor(async () => (await warning.get()).exists);
    expect(((await warning.get()).get("recipientIds") as string[]).sort()).toEqual([riya.uid, neha.uid, kabir.uid].sort());
    await expect(getDoc(doc(riya.db, "matches", matchId, "safety", scamId))).resolves.toBeTruthy();
    await expect(getDoc(doc(arjun.db, "matches", matchId, "safety", scamId))).rejects.toThrow();

    const openers = await riya.call<{ suggestions: string[] }>("suggestOpeners", { matchId });
    expect(openers.suggestions).toHaveLength(3);
    const { profiles } = await riya.call<{ profiles: Array<Record<string, unknown>> }>("getChatProfiles", { matchId });
    expect(profiles.map((profile) => profile.displayName).sort()).toEqual(["Arjun", "Kabir", "Neha"]);
    expect(profiles.every((profile) => profile.casualMatch === false)).toBe(true);

    // Name changes reach duos and the chat.
    await updateDoc(doc(neha.db, "users", neha.uid), { displayName: "Neha S", updatedAt: Date.now() });
    await waitFor(async () => (await admin.doc(`duos/${girls}`).get()).get(`profiles.${neha.uid}.displayName`) === "Neha S");

    // Leaving: the chat goes on while each pair still has someone, then closes.
    await arjun.call("leaveChat", { matchId });
    let after = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(after.participants).not.toContain(arjun.uid);
    expect(after.active).toBe(true);
    await expect(sendToGroup(arjun, "still here?")).rejects.toThrow();
    await kabir.call("leaveChat", { matchId });
    after = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(after.active).toBe(false);
    const notes = await admin.collection(`matches/${matchId}/messages`).where("senderId", "==", "system").get();
    expect(notes.size).toBe(2);

    // Deleting an account ends the member's duo and erases what they wrote, even in chats they'd left.
    await arjun.call("deleteAccount");
    const closed = (await admin.doc(`matches/${matchId}`).get()).data()!;
    expect(closed.profiles).not.toHaveProperty(arjun.uid);
    expect(closed.memberHistory).not.toContain(arjun.uid);
    const arjunMessages = await admin.collection(`matches/${matchId}/messages`).where("senderId", "==", arjun.uid).get();
    expect(arjunMessages.size).toBe(0);
    expect((await admin.doc(`matches/${matchId}/safety/${scamId}`).get()).exists).toBe(false);
    await neha.call("deleteAccount");
    expect((await admin.doc(`duos/${girls}`).get()).exists).toBe(false);
    await expect(riya.call("getDuoFeed")).rejects.toThrow(/Team up/);
  });
});

describe("moderation", () => {
  test("a profile reported by three different people is hidden from discovery", async () => {
    const target = await makeClient("target");
    await onboard(target, { name: "Spammer", gender: "man", showMe: ["woman"], age: 33 });
    const reporters = await Promise.all([makeClient("r1"), makeClient("r2"), makeClient("r3")]);
    for (const reporter of reporters) {
      await reporter.call("submitReport", {
        reportId: doc(collection(reporter.db, "reports")).id,
        targetUid: target.uid,
        reason: "scam_or_spam",
        details: "Asked for money"
      });
    }
    await waitFor(async () => (await admin.doc(`moderation/${target.uid}`).get()).get("status") === "hidden");
    await waitFor(async () => (await admin.doc(`discovery/${target.uid}`).get()).get("visible") === false);
  });

  test("chat safety flags scams for the recipient and hides repeat offenders for review", async () => {
    const [mira, scammer] = await Promise.all([makeClient("mira"), makeClient("scammer")]);
    await onboard(mira, { name: "Mira", gender: "woman", showMe: ["man"], age: 26 });
    await onboard(scammer, { name: "Rohan", gender: "man", showMe: ["woman"], age: 31 });
    await mira.call("swipe", { targetUid: scammer.uid, type: "like" });
    const { matchId } = await scammer.call<{ matchId: string }>("swipe", { targetUid: mira.uid, type: "like" });

    const messageIdOf = async (text: string) => {
      const messages = admin.collection(`matches/${matchId}/messages`).where("text", "==", text);
      let id = "";
      await waitFor(async () => {
        id = (await messages.get()).docs[0]?.id ?? "";
        return Boolean(id);
      });
      return id;
    };
    const flagOf = async (text: string) => {
      await sendMessage(scammer, matchId, mira.uid, text);
      const ref = admin.doc(`matches/${matchId}/safety/${await messageIdOf(text)}`);
      await waitFor(async () => (await ref.get()).exists);
      const { category, severity, hidden, recipientIds } = (await ref.get()).data()!;
      expect(recipientIds).toEqual([mira.uid]);
      return { category, severity, hidden };
    };

    // Ordinary chat is left alone.
    await sendMessage(scammer, matchId, mira.uid, "Hi Mira! How's your week going?");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const plainId = await messageIdOf("Hi Mira! How's your week going?");
    expect((await admin.doc(`matches/${matchId}/safety/${plainId}`).get()).exists).toBe(false);

    // Abuse is hidden in the chat and in the chat list preview.
    expect(await flagOf("you are such a randi")).toEqual({ category: "harassment", severity: "medium", hidden: true });
    await waitFor(
      async () => (await admin.doc(`matches/${matchId}`).get()).get("lastMessage.text") === "Message hidden by Paire AI"
    );

    const scams = [
      "Please share the OTP you just got",
      "Invest in my crypto trading app, guaranteed returns",
      "Send me a google play card",
      "Give me your bank account details",
      "I know where you live"
    ];
    expect(await flagOf(scams[0])).toEqual({ category: "money", severity: "high", hidden: false });
    // One person getting a few serious flags isn't enough to hide the sender...
    await flagOf(scams[1]);
    await flagOf(scams[2]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await admin.doc(`moderation/${scammer.uid}`).get()).get("status")).toBeUndefined();
    // ...but five are.
    await flagOf(scams[3]);
    await flagOf(scams[4]);

    // The warning is written first; the moderators' record follows a moment later.
    const flagsQuery = admin.collection("chatFlags").where("senderId", "==", scammer.uid);
    await waitFor(async () => (await flagsQuery.get()).size === 6);
    const flags = await flagsQuery.get();
    expect(flags.docs.map((doc) => doc.id)).toContain(`${matchId}_${flags.docs[0].get("messageId")}`);
    expect(flags.docs[0].get("recipientIds")).toEqual([mira.uid]);
    await waitFor(async () => (await admin.doc(`moderation/${scammer.uid}`).get()).get("status") === "hidden");
    expect((await admin.doc(`moderation/${scammer.uid}`).get()).get("reason")).toBe("auto:chat-safety");

    // Only the recipient can read a warning; nobody can read moderators' flags.
    const warning = `matches/${matchId}/safety/${flags.docs[0].get("messageId")}`;
    await expect(getDoc(doc(mira.db, warning))).resolves.toBeTruthy();
    await expect(getDoc(doc(scammer.db, warning))).rejects.toThrow();
    await expect(getDoc(doc(mira.db, "chatFlags", flags.docs[0].id))).rejects.toThrow();
  });

});

describe("production trust boundaries", () => {
  it("fails closed by default and rechecks both members inside a swipe", async () => {
    const a = await makeClient("trust-a"); const b = await makeClient("trust-b");
    await onboard(a, { name: "Trust A", gender: "woman", showMe: ["man"], age: 25 });
    await onboard(b, { name: "Trust B", gender: "man", showMe: ["woman"], age: 26 });
    try {
      await admin.doc("runtime/trust").delete();
      expect(await a.call("getVerificationStatus")).toMatchObject({ required: true, state: "unverified" });
      for (const name of ["getDiscoverFeed", "getLikesYou", "createDuoInvite"]) await expect(a.call(name)).rejects.toThrow(/verification is required/);
      await expect(a.call("swipe", { targetUid: b.uid, type: "like", verified: true })).rejects.toThrow(/verification is required/);
      for (const member of [a, b]) {
        const photos = (await admin.doc(`users/${member.uid}`).get()).get("photoUrls");
        await admin.doc(`moderation/${member.uid}`).set({ emailVerified: true,  verification: { schemaVersion: 2, storageBound: true, status: "verified", photoUrls: photos, verifiedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 } });
      }
      await a.call("swipe", { targetUid: b.uid, type: "like" });
      const result = await b.call<{ matched: boolean; matchId: string }>("swipe", { targetUid: a.uid, type: "like" });
      expect(result.matched).toBe(true);
      await sendMessage(a, result.matchId, b.uid, "Hello from a verified member");
      await updateDoc(doc(b.db, "users", b.uid), { photoUrls: ["changed-photo"] });
      await expect(sendMessage(a, result.matchId, b.uid, "This must be denied")).rejects.toMatchObject({ code: "permission-denied" });
      await expect(b.call("getLikesYou")).rejects.toThrow(/verification is required/);
      // Account controls remain available even after verification is lost.
      await b.call("blockUser", { targetUid: a.uid });
    } finally { await admin.doc("runtime/trust").set({ requireVerification: false }); }
  });

  it("requires moderator claims, successful liveness and review of every frozen photo", async () => {
    const member = await makeClient("review-member"); const reviewer = await makeClient("review-moderator");
    await onboard(member, { name: "Reviewed member", gender: "woman", showMe: ["man"], age: 25 });
    const sessionId = "12345678-1234-1234-1234-123456789abc";
    const originalPhotos = (await admin.doc(`users/${member.uid}`).get()).get("photoUrls");
    const frozenPhotos = ["https://example.com/immutable-test-fixture"];
    await admin.doc(`verificationSessions/${sessionId}`).set({ uid: member.uid, attempt: "test", originalPhotos, frozenPhotos, providerPassed: false, expiresAt: Date.now() + 60000 });
    await admin.doc(`moderation/${member.uid}`).set({ emailVerified: true,  verification: { status: "pending", sessionId } });
    const decision = { sessionId, approve: true, reviewedAllPhotos: true, authenticPhotos: true };
    await expect(member.call("getPhotoReviewQueue")).rejects.toThrow(/Moderator access/);
    await expect(member.call("reviewPhotoVerification", { ...decision, moderator: true })).rejects.toThrow(/Moderator access/);
    await getAdminAuth().setCustomUserClaims(reviewer.uid, { moderator: true });
    await getAuth(reviewer.app).currentUser!.getIdToken(true);
    await expect(reviewer.call("reviewPhotoVerification", decision)).rejects.toThrow(/successful live check/);
    await admin.doc(`verificationSessions/${sessionId}`).update({ providerPassed: true });
    await expect(reviewer.call("reviewPhotoVerification", { ...decision, reviewedAllPhotos: false })).rejects.toThrow(/Review every photo/);
    const queue = await reviewer.call<{ sessions: Array<{ sessionId: string; photos: string[] }> }>("getPhotoReviewQueue");
    expect(queue.sessions.find((session) => session.sessionId === sessionId)?.photos).toEqual(frozenPhotos);
    await reviewer.call("reviewPhotoVerification", decision);
    expect((await admin.doc(`users/${member.uid}`).get()).get("photoUrls")).toEqual(frozenPhotos);
    expect(await member.call("getVerificationStatus")).toMatchObject({ state: "verified" });
    await updateDoc(doc(member.db, "users", member.uid), { photoUrls: originalPhotos });
    expect(await member.call("getVerificationStatus")).toMatchObject({ state: "needs_recheck" });
  });

  it("never accepts a client-supplied premium entitlement or selfie approval", async () => {
    const member = await makeClient("paid-forgery");
    expect(await member.call("getPremiumStatus", { active: true, expiresAt: Number.MAX_SAFE_INTEGER, plan: "month", uid: "other" })).toEqual({ active: false, expiresAt: null, purchaseAvailable: false, webPurchaseAvailable: false, upiPurchaseAvailable: false, ccavenuePurchaseAvailable: false });
    // Web checkout stays closed until Razorpay and billing are configured, and orders are server-only.
    await expect(member.call("createPlusOrder", { plan: "week" })).rejects.toThrow(/aren't available/);
    await expect(member.call("createPlusOrder", { plan: "forever" })).rejects.toThrow(/1-day, 7-day or 30-day/);
    await expect(member.call("confirmPlusPayment", { orderId: "order_FAKE1234", paymentId: "pay_FAKE1234", signature: "x" })).rejects.toThrow(/aren't available yet/);
    await expect(setDoc(doc(member.db, "razorpayOrders", "order_FAKE1234"), { uid: member.uid, status: "paid", expiresAt: Date.now() + 60000 })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(member.call("beginPhotoVerification", { consent: false })).rejects.toThrow(/agree/);
    await expect(member.call("beginPhotoVerification", { consent: true, consentVersion: "photo-check-v1", approved: true })).rejects.toThrow(/aren’t available/);
    await expect(setDoc(doc(member.db, "billing", member.uid), { expiresAt: Date.now() + 60000 })).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("stale discovery cards", () => {
  it("rechecks current mutual preferences, visibility and cohort before spending a like or matching", async () => {
    const a = await makeClient("stale-a"); const b = await makeClient("stale-b");
    await onboard(a, { name: "Stale A", gender: "woman", showMe: ["man"], age: 25 });
    await onboard(b, { name: "Stale B", gender: "man", showMe: ["woman"], age: 26 });
    await updateDoc(doc(b.db, "users", b.uid, "private", "settings"), { showMe: ["man"] });
    await expect(a.call("swipe", { targetUid: b.uid, type: "like" })).rejects.toThrow(/no longer available/);
    await updateDoc(doc(b.db, "users", b.uid, "private", "settings"), { showMe: ["woman"] });
    await updateDoc(doc(b.db, "users", b.uid), { isDiscoverable: false });
    await expect(a.call("swipe", { targetUid: b.uid, type: "like" })).rejects.toThrow(/no longer available/);
    await updateDoc(doc(b.db, "users", b.uid), { isDiscoverable: true });
    await admin.doc(`moderation/${b.uid}`).set({ emailVerified: true,  cohort: "test" });
    await expect(a.call("swipe", { targetUid: b.uid, type: "like" })).rejects.toThrow(/no longer available/);
    expect(await a.call("getDailyAllowance")).toMatchObject({ remaining: { likes: 10 } });
    await admin.doc(`moderation/${b.uid}`).set({ emailVerified: true,  cohort: "public" });
    await a.call("swipe", { targetUid: b.uid, type: "like" });
    await updateDoc(doc(a.db, "users", a.uid, "private", "settings"), { showMe: ["woman"] });
    await expect(b.call("swipe", { targetUid: a.uid, type: "like" })).rejects.toThrow(/no longer available/);
    const matchId = [a.uid, b.uid].sort().join("_");
    expect((await admin.doc(`matches/${matchId}`).get()).exists).toBe(false);
  });
});

describe("private safety report workflow", () => {
  const newId = (client: Client) => doc(collection(client.db, "reports")).id;
  async function staff() {
    const client = await makeClient("report-moderator");
    await getAdminAuth().setCustomUserClaims(client.uid, { moderator: true });
    await getAuth(client.app).currentUser!.getIdToken(true);
    return client;
  }

  it("saves authoritative evidence once, keeps it after deletion, and exposes only own progress", async () => {
    const reporter = await makeClient("report-owner"); const target = await makeClient("report-target"); const other = await makeClient("report-outsider");
    await onboard(reporter, { name: "Reporter", gender: "woman", showMe: ["man"], age: 25 });
    await onboard(target, { name: "Reported member", gender: "man", showMe: ["woman"], age: 26 });
    const matchId = [reporter.uid, target.uid].sort().join("_");
    await admin.doc(`matches/${matchId}`).set({ participants: [reporter.uid, target.uid], active: false });
    await admin.doc(`matches/${matchId}/messages/reportedmessage`).set({ senderId: target.uid, text: "Stored message evidence", createdAt: new Date() });
    const reportId = newId(reporter);
    const input = { reportId, targetUid: target.uid, reason: "harassment", details: "What happened", matchId, messageId: "reportedmessage", reporterId: other.uid, evidence: "forged", status: "closed" };
    await reporter.call("submitReport", input);
    await reporter.call("submitReport", { ...input, details: "retry must not change evidence" });
    const stored = (await admin.doc(`reports/${reportId}`).get()).data()!;
    expect(stored).toMatchObject({ reporterId: reporter.uid, details: "What happened", status: "received", evidence: { text: "Stored message evidence" }, targetSnapshot: { displayName: "Reported member" } });
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    expect((await admin.doc(`limits/${reporter.uid}/daily/${day}`).get()).get("reports")).toBe(1);
    const progress = await reporter.call<{ reports: Array<Record<string, unknown>> }>("getMyReports", { uid: other.uid, reporterId: other.uid });
    expect(progress.reports).toEqual([expect.objectContaining({ id: reportId, status: "received", targetName: "Reported member" })]);
    for (const key of ["reporterId", "targetId", "evidence", "reviewNote", "reviewer", "details", "action"]) expect(progress.reports[0]).not.toHaveProperty(key);
    expect(await other.call("getMyReports", { uid: reporter.uid })).toMatchObject({ reports: [] });
    await expect(other.call("submitReport", input)).rejects.toThrow(/reference is already/);
    await expect(setDoc(doc(reporter.db, "reports", newId(reporter)), input)).rejects.toMatchObject({ code: "permission-denied" });
    await target.call("deleteAccount");
    expect((await admin.doc(`matches/${matchId}`).get()).exists).toBe(false);
    expect((await admin.doc(`reports/${reportId}`).get()).get("evidence.text")).toBe("Stored message evidence");
  });

  it("rejects inaccessible chats, mismatched senders and traversal references before consuming quota", async () => {
    const reporter = await makeClient("evidence-owner"); const target = await makeClient("evidence-target"); const outsider = await makeClient("evidence-outsider");
    await onboard(target, { name: "Target", gender: "man", showMe: ["woman"], age: 26 });
    await admin.doc("matches/privateevidence").set({ participants: [target.uid, outsider.uid], active: false });
    await admin.doc("matches/privateevidence/messages/secret").set({ senderId: target.uid, text: "PRIVATE" });
    const base = { reportId: newId(reporter), targetUid: target.uid, reason: "harassment", details: "Concern" };
    await expect(reporter.call("submitReport", { ...base, matchId: "privateevidence", messageId: "secret" })).rejects.toThrow(/isn't available/);
    await admin.doc("matches/ownevidence").set({ participants: [reporter.uid, target.uid], active: false });
    await admin.doc("matches/ownevidence/messages/ownmessage").set({ senderId: reporter.uid, text: "Own message" });
    await expect(reporter.call("submitReport", { ...base, matchId: "ownevidence", messageId: "ownmessage" })).rejects.toThrow(/wasn't sent/);
    await expect(reporter.call("submitReport", { ...base, targetUid: "x/y" })).rejects.toThrow(/invalid/);
    expect((await admin.doc(`reports/${base.reportId}`).get()).exists).toBe(false);
  });

  it("requires moderator claims, records reviews, keeps notes private and makes closing idempotent", async () => {
    const reporter = await makeClient("progress-owner"); const target = await makeClient("progress-target"); const reviewer = await staff();
    await onboard(target, { name: "Progress target", gender: "man", showMe: ["woman"], age: 28 });
    const reportId = newId(reporter);
    await reporter.call("submitReport", { reportId, targetUid: target.uid, reason: "scam_or_spam", details: "Asked for money" });
    const reviewing = { reportId, status: "reviewing", note: "Opened evidence for review" };
    await expect(reporter.call("getReportReviewQueue", { moderator: true })).rejects.toThrow(/Moderator access/);
    await expect(reporter.call("reviewReport", { ...reviewing, moderator: true })).rejects.toThrow(/Moderator access/);
    const queue = await reviewer.call<{ reports: Array<Record<string, unknown>> }>("getReportReviewQueue");
    expect(queue.reports.find((report) => report.id === reportId)).toMatchObject({ details: "Asked for money", target: { displayName: "Progress target" } });
    await reviewer.call("reviewReport", reviewing);
    expect(await reporter.call("getMyReports")).toMatchObject({ reports: [{ status: "reviewing" }] });
    const close = { reportId, status: "closed", outcome: "action_taken", action: "ban", note: "Confirmed scam from reviewed evidence" };
    await reviewer.call("reviewReport", close);
    await reviewer.call("reviewReport", close);
    expect((await admin.doc(`moderation/${target.uid}`).get()).get("status")).toBe("banned");
    expect((await admin.collection("reportReviews").where("reportId", "==", reportId).get()).size).toBe(2);
    expect(await reporter.call("getMyReports")).toMatchObject({ reports: [{ status: "closed", outcome: "action_taken" }] });
    await expect(reviewer.call("reviewReport", { ...close, outcome: "no_violation_found", action: "none" })).rejects.toThrow(/closed/);
    const remaining = await reviewer.call<{ reports: Array<{ id: string }> }>("getReportReviewQueue");
    expect(remaining.reports.map((report) => report.id)).not.toContain(reportId);
  });

  it("never downgrades an existing ban to hidden during another case review", async () => {
    const reporter = await makeClient("ban-report-owner"); const target = await makeClient("ban-report-target"); const reviewer = await staff();
    await onboard(target, { name: "Ban target", gender: "man", showMe: ["woman"], age: 29 });
    const reportId = newId(reporter);
    await reporter.call("submitReport", { reportId, targetUid: target.uid, reason: "harassment", details: "Concern" });
    await admin.doc(`moderation/${target.uid}`).set({ emailVerified: true,  status: "banned" });
    await reviewer.call("reviewReport", { reportId, status: "closed", outcome: "action_taken", action: "hide", note: "Confirm restriction while existing ban remains" });
    expect((await admin.doc(`moderation/${target.uid}`).get()).get("status")).toBe("banned");
  });

  it("allows reporting while verification is required, limits new reports and permits retries at the limit", async () => {
    const reporter = await makeClient("quota-report-owner"); const target = await makeClient("quota-report-target");
    await onboard(target, { name: "Quota target", gender: "man", showMe: ["woman"], age: 29 });
    const base = { reportId: newId(reporter), targetUid: target.uid, reason: "harassment", details: "Concern" };
    await admin.doc("runtime/trust").set({ requireVerification: true });
    try {
      await reporter.call("submitReport", base);
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await admin.doc(`limits/${reporter.uid}/daily/${day}`).set({ reports: 30 }, { merge: true });
      await reporter.call("submitReport", base);
      await expect(reporter.call("submitReport", { ...base, reportId: newId(reporter) })).rejects.toThrow(/30 reports/);
      expect(await reporter.call("getMyReports")).toMatchObject({ reports: [{ id: base.reportId }] });
    } finally { await admin.doc("runtime/trust").set({ requireVerification: false }); }
  });

  it("paginates own progress without dropping reports that share a timestamp", async () => {
    const reporter = await makeClient("page-report-owner"); const other = await makeClient("page-report-other");
    const timestamp = new Date();
    const batch = admin.batch();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const id = newId(reporter); ids.push(id);
      batch.set(admin.doc(`reports/${id}`), { reporterId: reporter.uid, targetId: other.uid, reason: "harassment", details: "Private", status: "received", createdAt: timestamp, updatedAt: timestamp });
    }
    await batch.commit();
    type Page = { reports: Array<{ id: string }>; cursor: unknown };
    const first = await reporter.call<Page>("getMyReports");
    expect(first.reports).toHaveLength(20);
    const next = await reporter.call<Page>("getMyReports", { cursor: first.cursor });
    expect(next.reports).toHaveLength(5);
    expect(next.cursor).toBeNull();
    expect([...first.reports, ...next.reports].map((report) => report.id).sort()).toEqual(ids.sort());
    await expect(reporter.call("getMyReports", { cursor: { seconds: 0, nanoseconds: 1e9, id: "x" } })).rejects.toThrow(/invalid/);
  });
});

describe("India v2: sparks and her rules", () => {
  async function pair(label: string) {
    const her = await makeClient(`${label}-her`);
    const him = await makeClient(`${label}-him`);
    await onboard(her, { name: `${label} Her`, gender: "woman", showMe: ["man"], age: 26 });
    await onboard(him, { name: `${label} Him`, gender: "man", showMe: ["woman"], age: 28 });
    return { her, him };
  }

  async function setSettings(client: Client, edits: Record<string, unknown>) {
    await updateDoc(doc(client.db, "users", client.uid, "private", "settings"), edits);
    await waitFor(async () => {
      const entry = (await admin.doc(`discovery/${client.uid}`).get()).data() ?? {};
      return Object.entries(edits).every(([key, value]) => entry[key] === value);
    });
  }

  it("notes-only needs a note, which opens the chat as a spark", async () => {
    const { her, him } = await pair("notes");
    await setSettings(her, { requireNote: true });
    const feed = await him.call<FeedResult>("getDiscoverFeed", {});
    expect(feed.profiles.find((profile) => profile.uid === her.uid)).toMatchObject({ requiresNote: true });

    await expect(him.call("swipe", { targetUid: her.uid, type: "like" })).rejects.toThrow(/only accept likes with a note/);
    await expect(him.call("swipe", { targetUid: her.uid, type: "like", note: "pay me 500 on upi" })).rejects.toThrow(/can't be sent/);
    await him.call("swipe", { targetUid: her.uid, type: "like", note: "Your chai ranking is elite" });

    const likes = await her.call<FeedResult>("getLikesYou", {});
    expect(likes.profiles.find((profile) => profile.uid === him.uid)).toMatchObject({ note: "Your chai ranking is elite" });

    // Liking back needs no note.
    const result = await her.call<{ matched: boolean; matchId: string }>("swipe", { targetUid: him.uid, type: "like" });
    expect(result.matched).toBe(true);
    const match = (await admin.doc(`matches/${result.matchId}`).get()).data()!;
    expect(match.sparks).toEqual({ [him.uid]: "Your chai ranking is elite" });
    expect(match.firstMoveBy).toBeNull();
  });

  it("incognito members are seen only by people they liked", async () => {
    const { her, him } = await pair("incognito");
    await setSettings(her, { incognito: true });
    let feed = await him.call<FeedResult>("getDiscoverFeed", {});
    expect(feed.profiles.map((profile) => profile.uid)).not.toContain(her.uid);
    await expect(him.call("swipe", { targetUid: her.uid, type: "like" })).rejects.toThrow(/no longer available/);

    await her.call("swipe", { targetUid: him.uid, type: "like" });
    feed = await him.call<FeedResult>("getDiscoverFeed", {});
    expect(feed.profiles.map((profile) => profile.uid)).toContain(her.uid);
  });

  it("private photos stay hidden until the match, and she messages first", async () => {
    const { her, him } = await pair("firstmove");
    // firstMove is read at match time, not mirrored on the discovery index.
    await updateDoc(doc(her.db, "users", her.uid, "private", "settings"), { firstMove: true });
    await setSettings(her, { privatePhotos: true });
    await her.call("swipe", { targetUid: him.uid, type: "like" });

    const likes = await him.call<FeedResult>("getLikesYou", {});
    expect(likes.profiles.find((profile) => profile.uid === her.uid)).toMatchObject({ photoUrls: [], photosPrivate: true });

    const result = await him.call<{ matched: boolean; matchId: string }>("swipe", { targetUid: her.uid, type: "like" });
    expect(result.matched).toBe(true);
    const match = (await admin.doc(`matches/${result.matchId}`).get()).data()!;
    expect(match.firstMoveBy).toBe(her.uid);

    await expect(sendMessage(him, result.matchId, her.uid, "Hey!")).rejects.toMatchObject({ code: "permission-denied" });
    await sendMessage(her, result.matchId, him.uid, "Hi, I liked your playlist");
    await sendMessage(him, result.matchId, her.uid, "Thank you! Favourite song?");
    // Matched: her photos are now readable through her profile.
    expect((await getDoc(doc(him.db, "users", her.uid))).get("photoUrls")).toHaveLength(1);
  });

  it("age-gap sides stay private to Plus, and the filter needs Plus", async () => {
    const her = await makeClient("agegap-her");
    const fox = await makeClient("agegap-fox");
    await onboard(her, { name: "Agegap Her", gender: "woman", showMe: ["man"], age: 26 });
    await onboard(fox, { name: "Agegap Fox", gender: "man", showMe: ["woman"], age: 42 });
    await setSettings(fox, { ageGap: "older" });
    await setSettings(her, { ageGap: "intoOlder" });

    // Under 35 can't be a Silver Fox or Cougar: the index keeps no side.
    await updateDoc(doc(her.db, "users", her.uid, "private", "settings"), { ageGap: "older" });
    await waitFor(async () => (await admin.doc(`discovery/${her.uid}`).get()).get("ageGap") === null);

    // Without Plus: no side is shown on cards, and the filter is refused.
    const feed = await her.call<FeedResult>("getDiscoverFeed", {});
    const card = feed.profiles.find((profile) => profile.uid === fox.uid);
    expect(card).toBeDefined();
    expect(card).not.toHaveProperty("ageGap");
    await expect(her.call("getDiscoverFeed", { ageGap: "older" })).rejects.toThrow(/comes with Paire Plus/);
    await expect(her.call("getDiscoverFeed", { ageGap: "sugarDaddy" })).rejects.toThrow(/ageGap is invalid/);
  });

  it("Garba Nights shows only people going on the same nights, and only to each other", async () => {
    const her = await makeClient("garba-her");
    const him = await makeClient("garba-him");
    const plain = await makeClient("garba-plain");
    await onboard(her, { name: "Garba Her", gender: "woman", showMe: ["man"], age: 25 });
    await onboard(him, { name: "Garba Him", gender: "man", showMe: ["woman"], age: 27 });
    await onboard(plain, { name: "Garba Plain", gender: "man", showMe: ["woman"], age: 27 });

    const season = activeGarbaSeason();
    if (!season) {
      // Outside Navratri the edition is closed (the rest is covered by test/garba.test.ts).
      await expect(her.call("getDiscoverFeed", { garba: true })).rejects.toThrow(/closed until next Navratri/);
      return;
    }
    await expect(her.call("getDiscoverFeed", { garba: true })).rejects.toThrow(/Pick the Garba nights/);
    const [tonight, later] = upcomingGarbaNights(seasonNights(season));
    // Lists can't use setSettings (it compares by identity); wait for the index instead.
    await updateDoc(doc(her.db, "users", her.uid, "private", "settings"), { garbaNights: [tonight] });
    await updateDoc(doc(him.db, "users", him.uid, "private", "settings"), { garbaNights: later ? [tonight, later] : [tonight] });
    await waitFor(async () => (await admin.doc(`discovery/${him.uid}`).get()).get("garba") === season.id);

    const feed = await her.call<FeedResult>("getDiscoverFeed", { garba: true });
    // Only how many nights they share, never which ones (his other night stays private).
    const card = feed.profiles.find((profile) => profile.uid === him.uid);
    expect(card?.garbaShared).toBe(1);
    expect(card).not.toHaveProperty("garbaNights");
    expect(feed.profiles.map((profile) => profile.uid)).not.toContain(plain.uid);

    // Outside the edition nobody's nights are shown.
    const everyone = await her.call<FeedResult>("getDiscoverFeed", {});
    expect(everyone.profiles.find((profile) => profile.uid === him.uid)).not.toHaveProperty("garbaShared");

    // Once they match, Paire's icebreakers (the built-in writer here) name their shared night.
    await him.call("swipe", { targetUid: her.uid, type: "like" });
    const match = await her.call<{ matched: boolean; matchId?: string }>("swipe", { targetUid: him.uid, type: "like" });
    expect(match.matched).toBe(true);
    const openers = await her.call<{ suggestions: string[] }>("suggestOpeners", { matchId: match.matchId });
    expect(openers.suggestions[0]).toMatch(/both at Garba on/);

    // The edition is local: without a location it asks for one.
    await updateDoc(doc(her.db, "users", her.uid, "private", "settings"), { locationEnabled: false, location: null });
    await expect(her.call("getDiscoverFeed", { garba: true })).rejects.toThrow(/Turn on location/);
    await expect(her.call("getDiscoverFeed", { garba: true, ageGap: "older" })).rejects.toThrow(/one filter at a time/);
  });

  it("same intentions only hides people who want something else", async () => {
    const { her, him } = await pair("intent");
    await updateDoc(doc(him.db, "users", him.uid), { intentions: ["casual"] });
    await setSettings(her, { sameIntentOnly: true });
    const feed = await him.call<FeedResult>("getDiscoverFeed", {});
    expect(feed.profiles.map((profile) => profile.uid)).not.toContain(her.uid);
    await expect(him.call("swipe", { targetUid: her.uid, type: "like", note: "Hello" })).rejects.toThrow(/no longer available/);
  });
});


describe("shared profile links and browser push ownership", () => {
  test("the tenth free like succeeds and the eleventh is refused without resetting existing usage", async () => {
    const viewer = await makeClient("ten-like-viewer");
    const first = await makeClient("ten-like-first");
    const second = await makeClient("ten-like-second");
    await onboard(viewer, { name: "Viewer", gender: "woman", showMe: ["man"], age: 28 });
    await onboard(first, { name: "First", gender: "man", showMe: ["woman"], age: 30 });
    await onboard(second, { name: "Second", gender: "man", showMe: ["woman"], age: 30 });
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const ref = admin.doc(`limits/${viewer.uid}/daily/${day}`);
    await ref.set({ likes: 9 });
    expect(await viewer.call("swipe", { targetUid: first.uid, type: "like" })).toMatchObject({ remaining: { likes: 0 } });
    await expect(viewer.call("swipe", { targetUid: second.uid, type: "like" })).rejects.toMatchObject({ code: "functions/resource-exhausted" });
    expect((await ref.get()).get("likes")).toBe(10);
    expect(await viewer.call("getDailyAllowance")).toMatchObject({ limits: { likes: 10 }, remaining: { likes: 0 } });
  });

  test("shared profiles require matching eligibility and keep private photos, blocks and visibility private", async () => {
    const viewer = await makeClient("share-viewer");
    const target = await makeClient("share-target");
    await onboard(viewer, { name: "Share viewer", gender: "woman", showMe: ["man"], age: 28 });
    await onboard(target, { name: "Share target", gender: "man", showMe: ["woman"], age: 30 });
    const fetch = () => viewer.call<{ profile: Record<string, unknown> | null }>("getSharedProfile", { uid: target.uid });
    expect((await fetch()).profile).toMatchObject({ uid: target.uid, displayName: "Share target" });
    await admin.doc(`users/${target.uid}/private/settings`).set({ privatePhotos: true }, { merge: true });
    const privateView = (await fetch()).profile!;
    expect(privateView.photoUrls).toEqual([]);
    expect(privateView).not.toHaveProperty("email");
    expect(privateView).not.toHaveProperty("location");
    await admin.doc(`users/${target.uid}`).update({ isDiscoverable: false });
    expect((await fetch()).profile).toBeNull();
    await admin.doc(`users/${target.uid}`).update({ isDiscoverable: true });
    await admin.doc(`users/${target.uid}/private/settings`).set({ incognito: true }, { merge: true });
    expect((await fetch()).profile).toBeNull();
    await admin.doc(`users/${target.uid}/private/settings`).set({ incognito: false, showMe: ["man"] }, { merge: true });
    expect((await fetch()).profile).toBeNull();
    await admin.doc(`users/${target.uid}/private/settings`).set({ showMe: ["woman"] }, { merge: true });
    await admin.doc(`blocks/${target.uid}/blocked/${viewer.uid}`).set({ targetUid: viewer.uid });
    expect((await fetch()).profile).toBeNull();
    await expect(viewer.call("getSharedProfile", { uid: "bad/id" })).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  test("browser subscriptions stay server-only, bind to the current account, and reject unsafe endpoints", async () => {
    const first = await makeClient("push-first");
    const second = await makeClient("push-second");
    const { createECDH, randomBytes, createHash } = await import("node:crypto");
    const curve = createECDH("prime256v1"); curve.generateKeys();
    const subscription = { endpoint: `https://fcm.googleapis.com/fcm/send/fictional-${first.uid}`, keys: { auth: randomBytes(16).toString("base64url"), p256dh: curve.getPublicKey().toString("base64url") } };
    const ref = admin.doc(`webPushSubscriptions/${createHash("sha256").update(subscription.endpoint).digest("hex")}`);
    expect(await first.call("getWebPushConfig")).toMatchObject({ available: true });
    await expect(first.call("registerWebPush", { subscription: { ...subscription, endpoint: "https://127.0.0.1/private" } })).rejects.toMatchObject({ code: "functions/invalid-argument" });
    await first.call("registerWebPush", { subscription, uid: second.uid });
    expect((await ref.get()).get("uid")).toBe(first.uid);
    await expect(getDoc(doc(first.db, ref.path))).rejects.toMatchObject({ code: "permission-denied" });
    await second.call("unregisterWebPush", { endpoint: subscription.endpoint });
    expect((await ref.get()).exists).toBe(true);
    await second.call("registerWebPush", { subscription });
    expect((await ref.get()).get("uid")).toBe(second.uid);
    await first.call("unregisterWebPush", { endpoint: subscription.endpoint });
    expect((await ref.get()).exists).toBe(true);
    await second.call("unregisterWebPush", { endpoint: subscription.endpoint });
    expect((await ref.get()).exists).toBe(false);
  });
});
