/**
 * Wedding Nods through the Functions emulator, the real rules and the same client SDK calls the
 * app makes. Fictional members on isolated emulator accounts.
 */
import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, doc, Firestore, getDoc, getFirestore, setDoc, terminate } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getStorage as getAdminStorage } from "firebase-admin/storage";

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

if (!getAdminApps().length) initializeAdminApp({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` });
const admin = getAdminFirestore();

type Client = { uid: string; name: string; app: FirebaseApp; db: Firestore; call: <T = unknown>(name: string, data?: unknown) => Promise<T> };
type Spot = { weddingId: string; nickname: string; side: string; ageBand: string; clue: string; nodsUsed: number; nodsTotal: number };
type Card = { cardId: string; nickname: string; side: string; ageBand: string; clue: string; nodded: boolean };
type Guests = { status: string; guests?: Card[]; nodsLeft?: number };
type Nod = { matched: boolean; matchId: string | null; nodsLeft: number };
const clients: Client[] = [];
let counter = 0;

async function makeClient(label: string): Promise<Client> {
  counter += 1;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "demo-key", authDomain: `${PROJECT_ID}.firebaseapp.com` }, `wn-${label}-${counter}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATORS.auth}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...hostAndPort(EMULATORS.firestore));
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, ...hostAndPort(EMULATORS.functions));
  const credential = await createUserWithEmailAndPassword(auth, `wn.${label}.${Date.now()}.${counter}@example.com`, "Password123!");
  await getAdminAuth().updateUser(credential.user.uid, { emailVerified: true });
  await credential.user.getIdToken(true);
  const client: Client = { uid: credential.user.uid, name: label, app, db, call: async <T,>(name: string, data?: unknown) => (await httpsCallable(functions, name)(data)).data as T };
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

async function onboard(client: Client, gender: "woman" | "man", options: { age?: number; settings?: Record<string, unknown> } = {}) {
  const now = Date.now();
  await setDoc(doc(client.db, "users", client.uid, "private", "settings"), {
    showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60, maxDistanceKm: 100, locationEnabled: false,
    sharedVibesOnly: false, openToCasual: false, notifications: { matches: true, messages: true }, updatedAt: now, ...options.settings
  });
  await setDoc(doc(client.db, "users", client.uid), {
    uid: client.uid, displayName: `Guest ${client.name}`, age: options.age ?? 27, gender, pronouns: "", city: "Delhi", bio: "Fictional wedding guest.",
    photoUrls: [`https://example.com/${client.name}.jpg`], interests: ["canvas"], intentions: ["long-term"], vibes: ["cozy"], quickAnswers: [],
    isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true, createdAt: now, updatedAt: now, lastActiveAt: now
  });
  await waitFor(async () => (await admin.doc(`discovery/${client.uid}`).get()).get("visible") === true);
}

const trust = (requireVerification: boolean) => admin.doc("runtime/trust").set({ requireVerification });
beforeAll(async () => { await trust(false); });
afterAll(async () => {
  await trust(false);
  await Promise.all(clients.map(async (client) => { await terminate(client.db); await deleteApp(client.app); }));
});

/** A fresh wedding for each test: its own PIN code and a date a few weeks away. */
let weddingNumber = 0;
function newWedding() {
  weddingNumber += 1;
  const date = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { date, pin: String(300000 + ((Date.now() + weddingNumber * 7919) % 600000)) };
}
const typed = (wedding: { date: string; pin: string }, side = "bride", clue = "green saree near the stage", variant = 0) => ({
  ...wedding, side, clue,
  ...[{ brideName: "Priyanka", groomName: "Aarav" }, { brideName: "Aarav", groomName: "Priyanca" }, { brideName: "Dr. Priyanka", groomName: "Mr. Aarav" }][variant % 3]
});
const joinOf = (client: Client, wedding: { date: string; pin: string }, variant = 0, side = "bride", clue = "green saree near the stage") =>
  client.call<{ spot: Spot }>("joinWedding", typed(wedding, side, clue, variant));
const matchesBetween = async (a: Client, b: Client) =>
  (await admin.collection("matches").where("participants", "array-contains", a.uid).get()).docs.filter((d) => (d.get("participants") as string[]).includes(b.uid));

/** `dev` (a man who wants to see women) plus `women` women and `extraMen` men, all in one wedding. */
async function crowd(label: string, women: number, extraMen = 0, devSettings: Record<string, unknown> = {}) {
  const wedding = newWedding();
  const dev = await makeClient(`${label}-dev`);
  await onboard(dev, "man", { settings: devSettings });
  const joined = [await joinOf(dev, wedding, 0, "groom", "navy sherwani near the stage")];
  const guests: Client[] = [];
  for (let i = 0; i < women; i += 1) {
    const guest = await makeClient(`${label}-w${i}`);
    await onboard(guest, "woman");
    joined.push(await joinOf(guest, wedding, i + 1, i % 2 ? "groom" : "bride", `pink lehenga number ${i}`));
    guests.push(guest);
  }
  const men: Client[] = [];
  for (let i = 0; i < extraMen; i += 1) {
    const man = await makeClient(`${label}-m${i}`);
    await onboard(man, "man");
    joined.push(await joinOf(man, wedding, i, "groom", `grey blazer near the bar ${i}`));
    men.push(man);
  }
  const weddingIds = new Set(joined.map((item) => item.spot.weddingId));
  return { wedding, dev, guests, men, weddingId: joined[0].spot.weddingId, weddingIds };
}

const cardsOf = async (client: Client, weddingId: string) => {
  const result = await client.call<Guests>("getWeddingGuests", { weddingId });
  return result;
};
const cardFor = async (viewer: Client, target: Client, weddingId: string) => {
  const guest = (await admin.doc(`weddings/${weddingId}/guests/${target.uid}`).get()).data() as { cardId: string };
  return guest.cardId;
};

describe("Wedding Nods", () => {
  test("people who type the same wedding land together: any order, a typo, an honorific", async () => {
    const { weddingIds, weddingId, wedding } = await crowd("same", 3);
    expect(weddingIds.size).toBe(1);
    const guests = await admin.collection(`weddings/${weddingId}/guests`).get();
    expect(guests.size).toBe(4);
    const weddings = await admin.collection("weddings").where("date", "==", wedding.date).where("pin", "==", wedding.pin).get();
    expect(weddings.size).toBe(1);
    // The server stores the key and normalised names; clients can never read them.
    expect(weddings.docs[0].get("names")).toEqual(["aarav", "priyanka"]);
    expect(weddings.docs[0].get("closesAt")).toBeGreaterThan(Date.parse(`${wedding.date}T00:00:00+05:30`));
  });

  test("a different wedding on the same day stays separate; nobody is put in a wedding they did not type", async () => {
    const wedding = newWedding();
    const [a, b] = await Promise.all([makeClient("sep-a"), makeClient("sep-b")]);
    await Promise.all([onboard(a, "man"), onboard(b, "woman")]);
    const first = await joinOf(a, wedding);
    const other = await b.call<{ spot: Spot }>("joinWedding", { ...typed(wedding), brideName: "Meera", groomName: "Karan" });
    expect(other.spot.weddingId).not.toBe(first.spot.weddingId);
    // There is no call that lists weddings; a guest list needs your own membership.
    await expect(b.call("getWeddingGuests", { weddingId: first.spot.weddingId })).resolves.toEqual({ status: "unavailable" });
    await expect(b.call("sendNod", { weddingId: first.spot.weddingId, cardId: "AAAAAAAAAAAAAAAA" })).rejects.toMatchObject({ code: "functions/not-found" });
  });

  test("your spot: a server-chosen nickname, an age band from your profile, and an owner-readable mirror", async () => {
    const wedding = newWedding();
    const me = await makeClient("spot");
    await onboard(me, "woman", { age: 31 });
    const { spot } = await joinOf(me, wedding, 0, "groom", "green saree near the stage");
    expect(spot.nickname).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+/);
    expect(spot.ageBand).toBe("30-34");
    expect(spot.side).toBe("groom");
    const mirror = await getDoc(doc(me.db, "users", me.uid, "weddingSpots", spot.weddingId));
    expect(mirror.get("clue")).toBe("green saree near the stage");
    await expect(getDoc(doc(me.db, "weddings", spot.weddingId))).rejects.toMatchObject({ code: "permission-denied" });
    // Joining again changes the clue and side, keeps the nickname, and is not a new wedding.
    const again = await joinOf(me, wedding, 1, "bride", "red dupatta near the buffet");
    expect(again.spot.nickname).toBe(spot.nickname);
    expect(again.spot.clue).toBe("red dupatta near the buffet");
  });

  test("clues with contact details, handles, links or your own name are refused", async () => {
    const wedding = newWedding();
    const me = await makeClient("clue");
    await onboard(me, "man");
    for (const clue of ["call me 9876543210", "my insta is someone", "see www.example.com", "I'm Guest clue, blue kurta", "room 204"]) {
      await expect(joinOf(me, wedding, 0, "bride", clue)).rejects.toMatchObject({ code: "functions/invalid-argument" });
    }
    expect((await admin.collection("weddings").where("pin", "==", wedding.pin).get()).size).toBe(0);
  });

  test("under 10 guests the app only learns that guests are still joining", async () => {
    const { dev, weddingId } = await crowd("few", 7, 1);
    const result = await cardsOf(dev, weddingId);
    expect(result).toEqual({ status: "joining", nodsLeft: 3 });
  });

  test("with 10 or more guests: anonymous cards only, with preferences, blocks, incognito and swipes applied", async () => {
    const { dev, guests, men, weddingId } = await crowd("cards", 9, 2, { ageMin: 22, ageMax: 35 });
    const [outOfAge, incognito, blocked, swiped] = [guests[0], guests[1], guests[2], guests[3]];
    await admin.doc(`users/${outOfAge.uid}`).update({ age: 52 });
    await admin.doc(`users/${incognito.uid}/private/settings`).update({ incognito: true });
    await dev.call("blockUser", { targetUid: blocked.uid });
    await admin.doc(`swipes/${dev.uid}/outgoing/${swiped.uid}`).set({ fromUid: dev.uid, toUid: swiped.uid, type: "nope", createdAt: new Date() });
    const result = await cardsOf(dev, weddingId);
    expect(result.status).toBe("ready");
    const visible = new Set(result.guests!.map((card) => card.cardId));
    const idOf = async (g: Client) => cardFor(dev, g, weddingId);
    for (const hiddenGuest of [outOfAge, incognito, blocked, swiped, ...men]) expect(visible.has(await idOf(hiddenGuest))).toBe(false);
    for (const shown of guests.slice(4)) expect(visible.has(await idOf(shown))).toBe(true);
    expect(result.guests!.length).toBe(5);
    // Cards carry nothing that identifies a person.
    for (const card of result.guests!) expect(Object.keys(card).sort()).toEqual(["ageBand", "cardId", "clue", "nickname", "nodded", "side"]);
    const text = JSON.stringify(result);
    for (const member of [dev, ...guests, ...men]) { expect(text).not.toContain(member.uid); expect(text).not.toContain(member.name); }
    // Banned members vanish too.
    await admin.doc(`moderation/${guests[4].uid}`).set({ status: "banned" }, { merge: true });
    expect((await cardsOf(dev, weddingId)).guests!.length).toBe(4);
  });

  test("a nod is secret, costs one of three, repeats for free and stops at three", async () => {
    const { dev, guests, weddingId } = await crowd("secret", 11);
    const cards = (await cardsOf(dev, weddingId)).guests!;
    expect(cards.length).toBe(11);
    const target = guests[0];
    const first = await dev.call<Nod>("sendNod", { weddingId, cardId: cards.find((c) => c.clue === "pink lehenga number 0")!.cardId });
    expect(first).toEqual({ matched: false, matchId: null, nodsLeft: 2 });
    // The other person learns nothing: no match, no swipe, no like, no change on their side.
    expect((await matchesBetween(dev, target)).length).toBe(0);
    expect((await admin.doc(`swipes/${dev.uid}/outgoing/${target.uid}`).get()).exists).toBe(false);
    expect((await admin.doc(`swipes/${target.uid}/outgoing/${dev.uid}`).get()).exists).toBe(false);
    const theirs = await cardsOf(target, weddingId);
    expect(theirs.guests!.some((c) => c.nodded)).toBe(false);
    expect(theirs.nodsLeft).toBe(3);
    // The cards say only which ones you nodded.
    expect((await cardsOf(dev, weddingId)).guests!.filter((c) => c.nodded).length).toBe(1);
    // A repeat is free.
    expect(await dev.call<Nod>("sendNod", { weddingId, cardId: cards.find((c) => c.clue === "pink lehenga number 0")!.cardId })).toEqual({ matched: false, matchId: null, nodsLeft: 2 });
    const others = cards.filter((c) => c.clue !== "pink lehenga number 0");
    expect((await dev.call<Nod>("sendNod", { weddingId, cardId: others[0].cardId })).nodsLeft).toBe(1);
    expect((await dev.call<Nod>("sendNod", { weddingId, cardId: others[1].cardId })).nodsLeft).toBe(0);
    await expect(dev.call("sendNod", { weddingId, cardId: others[2].cardId })).rejects.toMatchObject({ code: "functions/resource-exhausted" });
    // Nobody can read the nod records.
    await expect(getDoc(doc(dev.db, "weddings", weddingId, "nods", `${dev.uid}_${target.uid}`))).rejects.toMatchObject({ code: "permission-denied" });
    expect((await admin.doc(`users/${dev.uid}/weddingSpots/${weddingId}`).get()).get("nodsUsed")).toBe(3);
  });

  test("a mutual nod makes one normal match with source wedding; neither side knew before", async () => {
    const { dev, guests, weddingId } = await crowd("mutual", 11);
    const asha = guests[0];
    const toAsha = await cardFor(dev, asha, weddingId);
    // She cannot nod at him if he is not in her list: he is a man and she wants men, so he is.
    const toDev = await cardFor(asha, dev, weddingId);
    expect((await asha.call<Nod>("sendNod", { weddingId, cardId: toDev })).matched).toBe(false);
    expect((await matchesBetween(dev, asha)).length).toBe(0);
    const result = await dev.call<Nod>("sendNod", { weddingId, cardId: toAsha });
    expect(result.matched).toBe(true);
    const matches = await matchesBetween(dev, asha);
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe(result.matchId);
    expect(matches[0].get("source")).toBe("wedding");
    expect(matches[0].get("active")).toBe(true);
    // Both leave each other's Discover feed, as after any match.
    expect((await admin.doc(`swipes/${dev.uid}/outgoing/${asha.uid}`).get()).get("type")).toBe("like");
    expect((await admin.doc(`swipes/${asha.uid}/outgoing/${dev.uid}`).get()).get("type")).toBe("like");
    // And they are now matched, so the normal rules show each other's profile.
    expect((await getDoc(doc(dev.db, "users", asha.uid))).get("displayName")).toBe(`Guest ${asha.name}`);
    // The same nod again changes nothing.
    expect(await dev.call<Nod>("sendNod", { weddingId, cardId: toAsha })).toMatchObject({ matched: true, matchId: result.matchId });
    expect((await matchesBetween(dev, asha)).length).toBe(1);
  });

  test("two people nodding at each other at the same moment still make exactly one match", async () => {
    const { dev, guests, weddingId } = await crowd("race", 11);
    const asha = guests[0];
    const results = await Promise.all([
      dev.call<Nod>("sendNod", { weddingId, cardId: await cardFor(dev, asha, weddingId) }),
      asha.call<Nod>("sendNod", { weddingId, cardId: await cardFor(asha, dev, weddingId) })
    ]);
    expect((await matchesBetween(dev, asha)).length).toBe(1);
    // Whoever came second was told; if both nods raced past each other, the next nod, a free repeat, settles it.
    if (!results.some((r) => r.matched)) {
      expect((await dev.call<Nod>("sendNod", { weddingId, cardId: await cardFor(dev, asha, weddingId) })).matched).toBe(true);
    }
  });

  test("leaving removes your card and erases your clue, and rejoining does not reset your nods", async () => {
    const { dev, guests, weddingId, wedding } = await crowd("leave", 11);
    const lena = guests[1];
    const cardId = await cardFor(dev, lena, weddingId);
    await lena.call<Nod>("sendNod", { weddingId, cardId: await cardFor(lena, dev, weddingId) });
    await lena.call("leaveWedding", { weddingId });
    expect((await cardsOf(dev, weddingId)).guests!.some((c) => c.cardId === cardId)).toBe(false);
    expect((await admin.doc(`weddings/${weddingId}/guests/${lena.uid}`).get()).get("clue")).toBe("");
    await expect(lena.call("getWeddingGuests", { weddingId })).resolves.toEqual({ status: "unavailable" });
    await expect(dev.call("sendNod", { weddingId, cardId })).rejects.toMatchObject({ code: "functions/not-found" });
    const back = await joinOf(lena, wedding, 2, "bride", "gold bangles near the stage");
    expect(back.spot.nodsUsed).toBe(1);
    expect((await lena.call<Guests>("getWeddingGuests", { weddingId })).nodsLeft).toBe(2);
  });

  test("three different reporters hide a guest from the wedding; reporting also blocks", async () => {
    const { dev, guests, men, weddingId } = await crowd("report", 11, 2);
    const bad = guests[0];
    const reporters = [dev, ...men].slice(0, 3);
    // Men can't see women... they can: each reporter needs the card id, which a guest sees on their own list.
    const badCard = await cardFor(dev, bad, weddingId);
    for (const reporter of reporters) {
      await reporter.call("weddingGuestSafety", { weddingId, cardId: badCard, action: "report", reason: "harassment", details: "Fictional report" });
    }
    expect((await admin.doc(`weddings/${weddingId}/guests/${bad.uid}`).get()).get("hidden")).toBe(true);
    const reports = await admin.collection("reports").where("targetId", "==", bad.uid).get();
    expect(reports.size).toBe(3);
    expect(reports.docs[0].get("source")).toBe("wedding");
    // Hidden from everyone's list and unable to nod.
    expect((await cardsOf(dev, weddingId)).guests!.some((c) => c.cardId === badCard)).toBe(false);
    await expect(bad.call("sendNod", { weddingId, cardId: await cardFor(bad, dev, weddingId) })).rejects.toMatchObject({ code: "functions/permission-denied" });
    // A retry of the same report is harmless; the reporter is blocked.
    await dev.call("weddingGuestSafety", { weddingId, cardId: badCard, action: "report", reason: "harassment", details: "Fictional report" });
    expect((await admin.collection("reports").where("targetId", "==", bad.uid).get()).size).toBe(3);
    expect((await admin.doc(`blocks/${dev.uid}/blocked/${bad.uid}`).get()).exists).toBe(true);
  });

  test("blocking from a card removes the guest for you and ends no one else's view", async () => {
    const { dev, guests, weddingId } = await crowd("block", 11);
    const target = guests[2];
    const card = await cardFor(dev, target, weddingId);
    await dev.call("weddingGuestSafety", { weddingId, cardId: card, action: "block" });
    expect((await admin.doc(`blocks/${dev.uid}/blocked/${target.uid}`).get()).exists).toBe(true);
    expect((await cardsOf(dev, weddingId)).guests!.some((c) => c.cardId === card)).toBe(false);
    await expect(dev.call("weddingGuestSafety", { weddingId, cardId: card, action: "report", reason: "nonsense" })).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  test("two weddings a week at most; rejoining one you are already in is free", async () => {
    const me = await makeClient("limit");
    await onboard(me, "woman");
    const [w1, w2, w3] = [newWedding(), newWedding(), newWedding()];
    await joinOf(me, w1);
    await joinOf(me, w2);
    await expect(joinOf(me, w3)).rejects.toMatchObject({ code: "functions/resource-exhausted" });
    await expect(joinOf(me, w1, 0, "groom", "blue saree near the door")).resolves.toBeDefined();
    expect((await admin.collection("weddings").where("pin", "==", w3.pin).get()).size).toBe(0);
  });

  test("an admin-hidden wedding and a closed wedding give nothing and take nothing", async () => {
    const { dev, guests, weddingId } = await crowd("hidden", 11);
    const card = await cardFor(dev, guests[0], weddingId);
    await admin.doc(`weddings/${weddingId}`).update({ status: "hidden" });
    await expect(cardsOf(dev, weddingId)).resolves.toEqual({ status: "unavailable" });
    await expect(dev.call("sendNod", { weddingId, cardId: card })).rejects.toMatchObject({ code: "functions/failed-precondition" });
    await admin.doc(`weddings/${weddingId}`).update({ status: "open", closesAt: Date.now() - 1000 });
    await expect(cardsOf(dev, weddingId)).resolves.toEqual({ status: "closed" });
  });

  test("cleanup deletes a closed wedding (guests, nicknames, nods, spots) and keeps matches", async () => {
    const { dev, guests, weddingId } = await crowd("cleanup", 11);
    const asha = guests[0];
    await asha.call("sendNod", { weddingId, cardId: await cardFor(asha, dev, weddingId) });
    await dev.call("sendNod", { weddingId, cardId: await cardFor(dev, asha, weddingId) });
    expect((await matchesBetween(dev, asha)).length).toBe(1);
    // An unrelated open wedding survives.
    const open = await crowd("cleanup-open", 1);
    await admin.doc(`weddings/${weddingId}`).update({ closesAt: Date.now() - 1000 });
    const { runWeddingCleanup } = await import("../src/weddings");
    const result = await runWeddingCleanup();
    expect(result.closed).toBeGreaterThanOrEqual(1);
    expect((await admin.doc(`weddings/${weddingId}`).get()).exists).toBe(false);
    expect((await admin.collection(`weddings/${weddingId}/guests`).get()).size).toBe(0);
    expect((await admin.collection(`weddings/${weddingId}/nods`).get()).size).toBe(0);
    expect((await admin.doc(`users/${dev.uid}/weddingSpots/${weddingId}`).get()).exists).toBe(false);
    expect((await matchesBetween(dev, asha)).length).toBe(1);
    expect((await admin.doc(`weddings/${open.weddingId}`).get()).exists).toBe(true);
  });

  test("deleting the account erases the member's wedding data, nods sent and received, and invitation photo", async () => {
    const { dev, guests, weddingId, wedding } = await crowd("erase", 11);
    const target = guests[3];
    await dev.call("sendNod", { weddingId, cardId: await cardFor(dev, target, weddingId) });
    await target.call("sendNod", { weddingId, cardId: await cardFor(target, dev, weddingId) });
    const file = getAdminStorage().bucket().file(`wedding-invites/${target.uid}/card.jpg`);
    await file.save(Buffer.from([1, 2, 3]), { contentType: "image/jpeg" });
    await target.call("joinWedding", { ...typed(wedding, "bride", "yellow suit near the stage", 0), invitePath: `wedding-invites/${target.uid}/card.jpg` });
    expect((await admin.doc(`weddings/${weddingId}/guests/${target.uid}`).get()).get("invitePath")).toBe(`wedding-invites/${target.uid}/card.jpg`);
    await target.call("deleteAccount");
    expect((await admin.doc(`weddings/${weddingId}/guests/${target.uid}`).get()).exists).toBe(false);
    expect((await admin.collection(`weddings/${weddingId}/nods`).get()).docs.filter((d) => d.id.includes(target.uid)).length).toBe(0);
    expect((await admin.doc(`users/${target.uid}/weddingSpots/${weddingId}`).get()).exists).toBe(false);
    expect((await file.exists())[0]).toBe(false);
    // Everyone else stays.
    expect((await admin.doc(`weddings/${weddingId}/guests/${dev.uid}`).get()).exists).toBe(true);
  });

  test("an invitation photo must be the member's own, an image, and exist", async () => {
    const wedding = newWedding();
    const me = await makeClient("invite");
    await onboard(me, "man");
    const bucket = getAdminStorage().bucket();
    await expect(me.call("joinWedding", { ...typed(wedding), invitePath: `wedding-invites/${me.uid}/missing.jpg` })).rejects.toMatchObject({ code: "functions/invalid-argument" });
    await expect(me.call("joinWedding", { ...typed(wedding), invitePath: "wedding-invites/someone-else/card.jpg" })).rejects.toMatchObject({ code: "functions/invalid-argument" });
    await bucket.file(`wedding-invites/${me.uid}/doc.pdf`).save(Buffer.from([1]), { contentType: "application/pdf" });
    await expect(me.call("joinWedding", { ...typed(wedding), invitePath: `wedding-invites/${me.uid}/doc.pdf` })).rejects.toMatchObject({ code: "functions/invalid-argument" });
    await bucket.file(`wedding-invites/${me.uid}/ok.jpg`).save(Buffer.from([1, 2]), { contentType: "image/jpeg" });
    const { spot } = await me.call<{ spot: Spot }>("joinWedding", { ...typed(wedding), invitePath: `wedding-invites/${me.uid}/ok.jpg` });
    expect((await admin.doc(`weddings/${spot.weddingId}/guests/${me.uid}`).get()).get("invitePath")).toBe(`wedding-invites/${me.uid}/ok.jpg`);
    // Leaving deletes it.
    await me.call("leaveWedding", { weddingId: spot.weddingId });
    expect((await bucket.file(`wedding-invites/${me.uid}/ok.jpg`).exists())[0]).toBe(false);
  });

  test("members must pass the same photo verification as Discover", async () => {
    const wedding = newWedding();
    const me = await makeClient("gate");
    await onboard(me, "woman");
    await trust(true);
    try {
      await expect(joinOf(me, wedding)).rejects.toMatchObject({ code: "functions/failed-precondition" });
      expect((await admin.collection("weddings").where("pin", "==", wedding.pin).get()).size).toBe(0);
    } finally { await trust(false); }
  });
});
