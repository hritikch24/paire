/**
 * Accept a like, women reply free, and a gifted pass: the whole story in one run,
 * with all three switches on in runtime/trust (emulator only). Real security rules
 * and the Functions emulator for swipes, acceptLike and getSendPolicy; the gift
 * callables run in-process against the Firestore and Auth emulators with the same
 * fake Razorpay *test-mode* API as giftPayments.integration.test.ts (no network to
 * Razorpay, no real money). The last test asserts the existing Plus and Unlimited
 * Chat purchase records are untouched by all of it.
 */
import { createHmac, randomBytes } from "crypto";
import { deleteApp, FirebaseApp, initializeApp as initializeClientApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth as getClientAuth } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  Firestore,
  getFirestore as getClientFirestore,
  increment,
  serverTimestamp,
  setDoc,
  terminate,
  writeBatch
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.env.RAZORPAY_KEY_ID = "rzp_test_PaireSandbox1";
process.env.RAZORPAY_KEY_SECRET = "sandbox_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "sandbox_webhook_secret";
process.env.MUSE_BILLING_ENABLED = "true";
process.env.MUSE_UNCACHED_RUNTIME = "true";
process.env.KRAFTAI_CHECKOUT_URL = "https://kraftai.in/pay/start";
delete process.env.FUNCTIONS_EMULATOR;

jest.mock("../src/push", () => ({ sendPushToUser: jest.fn(async () => undefined) }));

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
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const admin = getFirestore();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gifts = require("../src/giftPayments") as typeof import("../src/giftPayments");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const life = require("../src/giftLifecycle") as typeof import("../src/giftLifecycle");

const DAY = 86_400_000;
type FakePayment = { id: string; order_id: string; status: string; amount: number; currency: string; amount_refunded: number; refund_status: string | null };
type FakeOrder = { id: string; amount: number; currency: string; status: string; receipt: string; notes: Record<string, string> };
const fake = { orders: new Map<string, FakeOrder>(), payments: new Map<string, FakePayment>() };
const rid = (prefix: string) => `${prefix}_${randomBytes(7).toString("hex")}`;

/** Razorpay's REST API in test mode, as far as gifts use it. Everything else goes to the emulators. */
function fakeRazorpay(url: string, init?: Parameters<typeof fetch>[1]): Response {
  const path = url.replace("https://api.razorpay.com/v1", "");
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const auth = String((init?.headers as Record<string, string>)?.authorization ?? "");
  if (auth !== `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`) return json({ error: "auth" }, 401);
  if (path === "/orders" && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    const order = { id: rid("order"), amount: body.amount, currency: body.currency, status: "created", receipt: body.receipt, notes: body.notes };
    fake.orders.set(order.id, order);
    return json(order);
  }
  const match = /^\/payments\/(pay_\w+)$/.exec(path);
  if (match) return fake.payments.has(match[1]) ? json(fake.payments.get(match[1])) : json({}, 400);
  return json({ error: "not faked" }, 404);
}

const realFetch = global.fetch;
const clients: Array<{ app: FirebaseApp; db: Firestore }> = [];
beforeAll(() => {
  global.fetch = (async (input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith("https://api.razorpay.com/") ? fakeRazorpay(url, init) : realFetch(input, init);
  }) as typeof fetch;
});
afterAll(async () => {
  global.fetch = realFetch;
  await admin.doc("runtime/trust").set({ requireVerification: false });
  await Promise.all(clients.map(async (client) => {
    await terminate(client.db);
    await deleteApp(client.app);
  }));
});

/** The customer's side of a captured payment: the order is paid, Razorpay holds a captured payment. */
function pay(orderId: string): FakePayment {
  const order = fake.orders.get(orderId)!;
  const payment: FakePayment = { id: rid("pay"), order_id: orderId, status: "captured", amount: order.amount, currency: order.currency, amount_refunded: 0, refund_status: null };
  fake.payments.set(payment.id, payment);
  order.status = "paid";
  return payment;
}
const checkoutSignature = (orderId: string, paymentId: string) => createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");

/** A signed-in caller of a callable, run in-process (billing on, as in production). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call<T>(fn: { run: (request: any) => T }, uid: string, data: unknown = {}) {
  const account = await getAuth().getUser(uid);
  return fn.run({ data, auth: { uid, token: { ...account.customClaims, email: account.email, email_verified: true } }, rawRequest: {}, acceptsStreaming: false });
}

type Member = { uid: string; db: Firestore; call: <T = unknown>(name: string, data?: unknown) => Promise<T> };
let counter = 0;
async function makeMember(label: string, name: string, gender: "woman" | "man"): Promise<Member> {
  counter += 1;
  const app = initializeClientApp({ projectId: PROJECT_ID, apiKey: "demo-key", authDomain: `${PROJECT_ID}.firebaseapp.com` }, `aas-${label}-${counter}`);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, `http://${EMULATORS.auth}`, { disableWarnings: true });
  const db = getClientFirestore(app);
  connectFirestoreEmulator(db, ...hostAndPort(EMULATORS.firestore));
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, ...hostAndPort(EMULATORS.functions));
  clients.push({ app, db });
  const credential = await createUserWithEmailAndPassword(auth, `aas.${label}.${Date.now()}.${counter}@example.com`, "Password123!");
  await getAuth().updateUser(credential.user.uid, { emailVerified: true });
  await credential.user.getIdToken(true);
  const uid = credential.user.uid, now = Date.now();
  await setDoc(doc(db, "users", uid, "private", "settings"), {
    showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60, maxDistanceKm: 100, locationEnabled: true,
    location: { lat: 19.076, lng: 72.8777, updatedAt: now }, sharedVibesOnly: false, openToCasual: false, notifications: { matches: true, messages: true }, updatedAt: now
  });
  await setDoc(doc(db, "users", uid), {
    uid, displayName: name, age: 27, gender, pronouns: "", city: "Mumbai", bio: `Hi, I'm ${name}.`, photoUrls: [`https://example.com/${uid}.jpg`],
    interests: ["canvas"], intentions: ["long-term"], vibes: ["cozy"], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true,
    createdAt: now, updatedAt: now, lastActiveAt: now
  });
  for (let tries = 0; (await admin.doc(`discovery/${uid}`).get()).get("visible") !== true; tries += 1) {
    if (tries > 80) throw new Error("profile never became visible");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await admin.doc(`moderation/${uid}`).set({ cohort: "test", emailVerified: true }, { merge: true });
  return { uid, db, call: async <T,>(fn: string, data?: unknown) => (await httpsCallable(functions, fn)(data)).data as T };
}

/** The sender's half of the app's "send message" batch. */
function send(member: Member, matchId: string, other: string, text = "Hello") {
  const batch = writeBatch(member.db);
  batch.set(doc(collection(member.db, "matches", matchId, "messages")), { senderId: member.uid, text, createdAt: serverTimestamp() });
  batch.update(doc(member.db, "matches", matchId), {
    lastMessage: { text, senderId: member.uid, createdAt: serverTimestamp() }, lastActivityAt: serverTimestamp(), [`unread.${other}`]: increment(1)
  });
  return batch.commit();
}

const SWITCHES = { requireVerification: false, enforcePaidChat: true, acceptFlow: true, womenSendFree: true, giftSales: true };
const setSwitches = (patch: Partial<typeof SWITCHES>) => admin.doc("runtime/trust").set({ ...SWITCHES, ...patch });
const mirrorOf = async (uid: string) => (await admin.doc(`moderation/${uid}`).get()).get("chatAccess") as { freeSender?: boolean; premiumUntil?: number; unlimited?: boolean } | undefined;

/** Every document of a collection, for "nothing changed" comparisons. */
async function snapshot(path: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const document of (await admin.collection(path).get()).docs) out[document.id] = document.data();
  return out;
}

test("accept, reply free, gift a week, claim: the whole story, and Plus and Unlimited Chat records stay as they were", async () => {
  await setSwitches({});
  const [she, he] = [await makeMember("she", "Asha", "woman"), await makeMember("he", "Dev", "man")];
  const matchId = [she.uid, he.uid].sort().join("_");

  // The existing purchase records, before anything in this story happens.
  const before = {
    razorpayOrders: await snapshot("razorpayOrders"),
    chatUnlockOrders: await snapshot("chatUnlockOrders"),
    chatUnlocks: await snapshot("chatUnlocks"),
    herBilling: (await admin.doc(`billing/${she.uid}`).get()).exists,
    hisBilling: (await admin.doc(`billing/${he.uid}`).get()).exists
  };
  expect(before.herBilling).toBe(false);
  expect(before.hisBilling).toBe(false);

  // He likes her; she accepts. A match, with no daily like of hers used.
  await he.call("swipe", { targetUid: she.uid, type: "like" });
  expect((await admin.doc(`matches/${matchId}`).get()).exists).toBe(false);
  expect(await she.call("acceptLike", { targetUid: he.uid })).toEqual({ matched: true, matchId });
  expect((await admin.doc(`matches/${matchId}`).get()).get("active")).toBe(true);

  // The switches as the app reads them. She sends free; he does not.
  expect(await she.call("getSendPolicy")).toEqual({ acceptFlow: true, womenSendFree: true, giftSales: true, freeSender: true });
  expect(await he.call("getSendPolicy")).toEqual({ acceptFlow: true, womenSendFree: true, giftSales: true, freeSender: false });
  expect((await mirrorOf(she.uid))?.freeSender).toBe(true);
  expect(Boolean((await mirrorOf(he.uid))?.freeSender)).toBe(false);

  // He has no pass: the rules refuse his message. She replies free: allowed, with no pass of hers.
  await expect(send(he, matchId, she.uid, "Hi Asha")).rejects.toMatchObject({ code: "permission-denied" });
  await send(she, matchId, he.uid, "Hi Dev, thanks for the like");
  expect((await admin.collection(`matches/${matchId}/messages`).get()).size).toBe(1);
  expect((await admin.doc(`billing/${she.uid}`).get()).exists).toBe(false);
  expect(((await mirrorOf(she.uid))?.premiumUntil ?? 0)).toBe(0);
  expect(Boolean((await mirrorOf(she.uid))?.unlimited)).toBe(false);

  // She gifts him a week: a real order, a captured payment, the confirm path. Nothing is granted yet.
  const { orderId } = await call(gifts.createGiftOrder, she.uid, { matchId, plan: "week" });
  const order = fake.orders.get(orderId)!;
  expect(order).toMatchObject({ amount: 9900, currency: "INR", notes: { plan: "week", product: "gift_plan" } });
  expect(order.receipt).toMatch(/^gift_plan_week_\d+$/);
  const payment = pay(orderId);
  await expect(send(he, matchId, she.uid, "Still no pass")).rejects.toMatchObject({ code: "permission-denied" });
  expect(await call(gifts.confirmGiftPayment, she.uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) })).toEqual({ status: "paid", giftId: orderId });
  expect((await admin.doc(`gifts/${orderId}`).get()).get("status")).toBe("pending");
  expect((await admin.doc(`complimentaryPlusGrants/${he.uid}`).get()).exists).toBe(false);
  await expect(send(he, matchId, she.uid, "Still no pass")).rejects.toMatchObject({ code: "permission-denied" });

  // He claims: seven days of Plus, and the same rules that refused him now let him send.
  const claimed = await call(life.claimGift, he.uid, { giftId: orderId });
  expect(claimed.status).toBe("claimed");
  expect(claimed.endsAt - Date.now()).toBeGreaterThan(7 * DAY - 60_000);
  expect(claimed.endsAt - Date.now()).toBeLessThanOrEqual(7 * DAY);
  await send(he, matchId, she.uid, "Thank you, that is kind");
  expect((await mirrorOf(he.uid))?.premiumUntil).toBe(claimed.endsAt);
  expect((await admin.doc(`billing/${he.uid}`).get()).get("expiresAt")).toBe(claimed.endsAt);

  // womenSendFree off: she loses free sending, his gift days remain.
  await setSwitches({ womenSendFree: false });
  expect(await she.call("getSendPolicy")).toMatchObject({ womenSendFree: false, freeSender: false });
  await expect(send(she, matchId, he.uid, "Can I reply?")).rejects.toMatchObject({ code: "permission-denied" });
  await send(he, matchId, she.uid, "Still here");
  expect((await mirrorOf(he.uid))?.premiumUntil).toBe(claimed.endsAt);
  expect((await admin.doc(`complimentaryPlusGrants/${he.uid}`).get()).get("expiresAt")).toBe(claimed.endsAt);
  expect((await admin.doc(`gifts/${orderId}`).get()).get("status")).toBe("claimed");

  // Back on: she sends free again, with nothing else needed.
  await setSwitches({});
  expect(await she.call("getSendPolicy")).toMatchObject({ womenSendFree: true, freeSender: true });
  await send(she, matchId, he.uid, "Back to free");

  // The existing Plus and Unlimited Chat records: no new or changed document, and no purchase of hers.
  expect(await snapshot("razorpayOrders")).toEqual(before.razorpayOrders);
  expect(await snapshot("chatUnlockOrders")).toEqual(before.chatUnlockOrders);
  expect(await snapshot("chatUnlocks")).toEqual(before.chatUnlocks);
  expect((await admin.doc(`billing/${she.uid}`).get()).exists).toBe(false);
  expect((await admin.doc(`chatUnlocks/${she.uid}`).get()).exists).toBe(false);
  expect((await admin.doc(`chatUnlocks/${he.uid}`).get()).exists).toBe(false);
  expect((await admin.collection("razorpayOrders").where("uid", "in", [she.uid, he.uid]).get()).empty).toBe(true);
  // The gift lives in its own records.
  expect((await admin.doc(`giftOrders/${orderId}`).get()).get("fromUid")).toBe(she.uid);
});
