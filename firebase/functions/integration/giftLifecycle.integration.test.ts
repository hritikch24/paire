/**
 * The gift lifecycle after payment: claim, decline, the daily expiry sweep and
 * the reversal of a refunded or disputed gift. Runs in-process against the
 * Firestore and Auth emulators with the same fake Razorpay *test-mode* API as
 * giftPayments.integration.test.ts (no network to Razorpay, no real money),
 * plus one check of the real paid-chat rules through the client SDK.
 */
import { createHmac, randomBytes, randomUUID } from "crypto";
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

const pushes: Array<{ uid: string; message: { kind: string; title: string; body: string; data: Record<string, string> } }> = [];
jest.mock("../src/push", () => ({
  sendPushToUser: jest.fn(async (uid: string, message: { kind: string; title: string; body: string; data: Record<string, string> }) => {
    pushes.push({ uid, message });
  })
}));

const PROJECT_ID = "demo-muse";
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const admin = getFirestore();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gifts = require("../src/giftPayments") as typeof import("../src/giftPayments");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const life = require("../src/giftLifecycle") as typeof import("../src/giftLifecycle");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPlusOrder, confirmPlusPayment } = require("../src/razorpay") as typeof import("../src/razorpay");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { adminGrantPlusMonth } = require("../src/adminPremium") as typeof import("../src/adminPremium");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { refundGiftPayment } = require("../src/giftRefunds") as typeof import("../src/giftRefunds");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pairId } = require("../src/lib/ids") as typeof import("../src/lib/ids");

const DAY = 86_400_000;
type FakePayment = { id: string; order_id: string; status: string; amount: number; currency: string; amount_refunded: number; refund_status: string | null };
type FakeOrder = { id: string; amount: number; currency: string; status: string; receipt: string; notes: Record<string, string> };
const fake = {
  orders: new Map<string, FakeOrder>(),
  payments: new Map<string, FakePayment>(),
  refunds: [] as Array<{ paymentId: string; amount: number; notes: Record<string, string> }>
};
const rid = (prefix: string) => `${prefix}_${randomBytes(7).toString("hex")}`;

/** Razorpay's REST API in test mode, as far as the server uses it. Everything else goes to the emulators. */
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
  let match = /^\/payments\/(pay_\w+)\/refund$/.exec(path);
  if (match && init?.method === "POST") {
    const payment = fake.payments.get(match[1]);
    if (!payment) return json({ error: { description: "unknown payment" } }, 400);
    const body = JSON.parse(String(init.body));
    payment.amount_refunded = payment.amount;
    payment.refund_status = "full";
    fake.refunds.push({ paymentId: payment.id, amount: body.amount, notes: body.notes });
    return json({ id: rid("rfnd") });
  }
  match = /^\/payments\/(pay_\w+)$/.exec(path);
  if (match) return fake.payments.has(match[1]) ? json(fake.payments.get(match[1])) : json({}, 400);
  return json({ error: "not faked" }, 404);
}

const realFetch = global.fetch;
/** Makes Razorpay's refund API slow, so a second delivery arrives while the first refund is in flight. */
let refundDelayMs = 0;
const clients: Array<{ app: FirebaseApp; db: Firestore }> = [];
beforeAll(() => {
  global.fetch = (async (input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    if (refundDelayMs && url.endsWith("/refund")) await new Promise((resolve) => setTimeout(resolve, refundDelayMs));
    return fakeRazorpay(url, init);
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

async function webhook(event: string, payload: Record<string, unknown>): Promise<number> {
  const raw = Buffer.from(JSON.stringify({ event, payload }));
  const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex");
  const headers: Record<string, string> = { "x-razorpay-signature": signature, "content-type": "application/json" };
  const request = { method: "POST", rawBody: raw, body: JSON.parse(raw.toString()), headers, get: (name: string) => headers[name.toLowerCase()], header: (name: string) => headers[name.toLowerCase()] };
  return new Promise((resolve) => {
    const response = { sendStatus: (status: number) => resolve(status), status: (status: number) => ({ send: () => resolve(status), end: () => resolve(status) }), setHeader: () => undefined, getHeader: () => undefined, on: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (gifts.razorpayGiftWebhook as any)(request, response);
  });
}
const refundEvent = (payment: FakePayment) => ({ refund: { entity: { payment_id: payment.id } }, payment: { entity: { id: payment.id, order_id: payment.order_id } } });
const paymentRefunded = (payment: FakePayment) => ({ payment: { entity: { id: payment.id, order_id: payment.order_id } } });
const disputeLost = (payment: FakePayment) => ({ dispute: { entity: { payment_id: payment.id } } });

let counter = 0;
/** A verified test-cohort member with a real Auth account (owner grants look members up by email). */
async function member(gender: "woman" | "man", name?: string, claims: Record<string, boolean> = {}): Promise<string> {
  counter += 1;
  const email = `giftlife-${randomUUID()}@example.com`;
  const { uid } = await getAuth().createUser({ email, emailVerified: true });
  if (Object.keys(claims).length) await getAuth().setCustomUserClaims(uid, claims);
  const batch = admin.batch();
  batch.set(admin.doc(`moderation/${uid}`), { status: "ok", emailVerified: true, cohort: "test" });
  batch.set(admin.doc(`users/${uid}`), { uid, displayName: name ?? `Member ${counter}`, gender, photoUrls: [], onboardingComplete: true });
  if (claims.supportAccess) batch.set(admin.doc(`supportOperators/${uid}`), { enabled: true });
  await batch.commit();
  return uid;
}
const nameOf = async (uid: string) => ((await admin.doc(`users/${uid}`).get()).get("displayName") as string | undefined) ?? "Gone";
async function matchUp(a: string, b: string): Promise<string> {
  const id = pairId(a, b);
  await admin.doc(`matches/${id}`).set({
    id, participants: [a, b].sort(), active: true, kind: "pair",
    profiles: { [a]: { displayName: await nameOf(a) }, [b]: { displayName: await nameOf(b) } }
  });
  return id;
}
async function pair(herName?: string, hisName?: string): Promise<{ her: string; him: string; matchId: string }> {
  const her = await member("woman", herName), him = await member("man", hisName);
  return { her, him, matchId: await matchUp(her, him) };
}
/** She pays for a gift through the real order + confirm path; returns the pending gift's id and payment. */
async function paidGift(from: string, matchId: string, plan: "day" | "week" | "month" = "week") {
  const { orderId } = await call(gifts.createGiftOrder, from, { matchId, plan });
  const payment = pay(orderId);
  const result = await call(gifts.confirmGiftPayment, from, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) });
  expect(result).toEqual({ status: "paid", giftId: orderId });
  return { giftId: orderId, payment };
}

async function failure(promise: Promise<unknown>): Promise<{ code: string; reason?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; message?: string; details?: { reason?: string } };
    return { code: String(e.code), reason: e.details?.reason, message: String(e.message) };
  }
  throw new Error("expected the call to fail");
}
const giftOf = async (id: string) => (await admin.doc(`gifts/${id}`).get()).data()!;
/** All a member may read on gifts/{id} (the rules let both members read the whole doc). */
const MEMBER_FIELDS = ["claimedAt", "createdAt", "expiresAt", "fromUid", "matchId", "plan", "status", "toUid"];
async function expectMemberFieldsOnly(id: string) {
  const fields = Object.keys(await giftOf(id));
  expect(fields.filter((field) => !MEMBER_FIELDS.includes(field))).toEqual([]);
}
const orderOf = async (id: string) => (await admin.doc(`giftOrders/${id}`).get()).data()!;
const compOf = async (uid: string) => (await admin.doc(`complimentaryPlusGrants/${uid}`).get()).data();
const billingOf = async (uid: string) => (await admin.doc(`billing/${uid}`).get()).data();
const mirrorOf = async (uid: string) => (await admin.doc(`moderation/${uid}`).get()).get("chatAccess");
const refundsFor = (payment: FakePayment) => fake.refunds.filter((refund) => refund.paymentId === payment.id);

beforeEach(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false, giftSales: true });
  pushes.length = 0;
});

describe("claiming a gift", () => {
  test("the recipient claims: the complimentary source, billing and the chat mirror all move; the gifter is told", async () => {
    const { her, him, matchId } = await pair("Alexa Rao", "Jules Verne");
    const { giftId } = await paidGift(her, matchId, "week");
    pushes.length = 0;
    const before = Date.now();
    const result = await call(life.claimGift, him, { giftId });
    expect(result.status).toBe("claimed");
    expect(await giftOf(giftId)).toMatchObject({ status: "claimed", claimedAt: expect.any(Number) });
    await expectMemberFieldsOnly(giftId);
    // The reversal's bookkeeping lives only on the server-only order.
    const saved = await orderOf(giftId);
    expect(saved).toMatchObject({ previousCompExpiry: 0, previousCompStatus: null, previousCompLastGiftId: null, endsAt: result.endsAt });
    expect(saved.startsAt).toBeGreaterThanOrEqual(before);
    expect(saved.endsAt - saved.startsAt).toBe(7 * DAY);
    expect(typeof saved.claimedAt).toBe("number");
    expect(await compOf(him)).toMatchObject({ status: "active", expiresAt: result.endsAt, lastSource: "gift", lastGiftId: giftId });
    expect((await billingOf(him))!.expiresAt).toBe(result.endsAt);
    expect(await mirrorOf(him)).toMatchObject({ premiumUntil: result.endsAt });
    // Nothing about her own access, and nothing in Plus's purchase records.
    expect((await admin.doc(`complimentaryPlusGrants/${her}`).get()).exists).toBe(false);
    expect((await admin.collection("razorpayOrders").where("uid", "==", him).get()).empty).toBe(true);
    expect((await admin.doc(`webPassLedger/${him}`).get()).exists).toBe(false);
    // Previews are off by default: the alert names nobody (notificationCopy keeps it generic too).
    expect(pushes).toEqual([{ uid: her, message: expect.objectContaining({ kind: "matches", title: "Paire", body: "Your gift was accepted.", data: { type: "gift", matchId, giftId } }) }]);
  });

  test("with previews on, the gifter's alert carries the recipient's first name only", async () => {
    const { her, him, matchId } = await pair("Alexa", "Jules Verne");
    await admin.doc(`users/${her}/private/settings`).set({ notifications: { previews: true } });
    const { giftId } = await paidGift(her, matchId, "day");
    pushes.length = 0;
    await call(life.claimGift, him, { giftId });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].message.body).toBe("Jules accepted your gift.");
  });

  test("the month gift runs 60 days, exactly as bought", async () => {
    const { her, him, matchId } = await pair();
    const { giftId } = await paidGift(her, matchId, "month");
    await call(life.claimGift, him, { giftId });
    const saved = await orderOf(giftId);
    expect(saved.endsAt - saved.startsAt).toBe(60 * DAY);
  });

  test("claiming twice (two tabs at once, then again) grants once", async () => {
    const { her, him, matchId } = await pair();
    const { giftId } = await paidGift(her, matchId, "week");
    pushes.length = 0;
    const [one, two] = await Promise.all([call(life.claimGift, him, { giftId }), call(life.claimGift, him, { giftId })]);
    expect(one).toEqual(two);
    const again = await call(life.claimGift, him, { giftId });
    expect(again).toEqual(one);
    expect((await compOf(him))!.expiresAt).toBe(one.endsAt);
    expect((await orderOf(giftId)).endsAt - (await orderOf(giftId)).startsAt).toBe(7 * DAY);
    expect(pushes.filter((push) => push.uid === her)).toHaveLength(1);
  });

  test("only the recipient can claim; bad input and unknown gifts are refused", async () => {
    const { her, him, matchId } = await pair();
    const stranger = await member("man");
    const { giftId } = await paidGift(her, matchId, "day");
    expect((await failure(call(life.claimGift, her, { giftId }))).code).toBe("permission-denied");
    expect((await failure(call(life.claimGift, stranger, { giftId }))).code).toBe("permission-denied");
    expect((await failure(call(life.claimGift, him, { giftId: "../users/x" }))).code).toBe("invalid-argument");
    expect((await failure(call(life.claimGift, him, { giftId: "order_DoesNotExist1" }))).code).toBe("not-found");
    expect((await giftOf(giftId)).status).toBe("pending");
    expect((await admin.doc(`complimentaryPlusGrants/${stranger}`).get()).exists).toBe(false);
  });

  test("after 7 days: refused, the gift expires and the gifter is refunded once", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "week");
    await admin.doc(`gifts/${giftId}`).update({ expiresAt: Date.now() - 1 });
    expect(await failure(call(life.claimGift, him, { giftId }))).toMatchObject({ code: "failed-precondition", reason: "expired" });
    expect((await giftOf(giftId)).status).toBe("expired");
    expect(refundsFor(payment)).toEqual([{ paymentId: payment.id, amount: 9900, notes: { reason: "expired", product: "gift_plan" } }]);
    expect(await failure(call(life.claimGift, him, { giftId }))).toMatchObject({ code: "failed-precondition" });
    expect(refundsFor(payment)).toHaveLength(1);
    expect((await admin.doc(`complimentaryPlusGrants/${him}`).get()).exists).toBe(false);
  });

  test("after an unmatch: refused, the gift is void and refunded", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "day");
    await admin.doc(`matches/${matchId}`).update({ active: false, endReason: "unmatch" });
    expect(await failure(call(life.claimGift, him, { giftId }))).toMatchObject({ code: "failed-precondition", reason: "no-match" });
    expect((await giftOf(giftId)).status).toBe("void");
    expect(refundsFor(payment)).toHaveLength(1);
    expect((await orderOf(giftId)).refundId).toEqual(expect.any(String));
    expect((await admin.doc(`complimentaryPlusGrants/${him}`).get()).exists).toBe(false);
  });

  test("a recipient with lifetime access: refused with a clear message, the gift is void and refunded", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "week");
    await admin.doc(`lifetimePlusGrants/${him}`).set({ status: "active", startsAt: 0 });
    const refused = await failure(call(life.claimGift, him, { giftId }));
    expect(refused).toMatchObject({ code: "failed-precondition", reason: "already-lifetime" });
    expect(refused.message).toMatch(/Lifetime/);
    expect((await giftOf(giftId)).status).toBe("void");
    expect(refundsFor(payment)).toHaveLength(1);
    expect((await admin.doc(`complimentaryPlusGrants/${him}`).get()).exists).toBe(false);
  });

  test("a ₹399 pass bought earlier stays whole: the gift starts when it ends", async () => {
    const { her, him, matchId } = await pair();
    const { orderId } = await call(createPlusOrder, him, { plan: "month" });
    const plus = pay(orderId);
    await call(confirmPlusPayment, him, { orderId, paymentId: plus.id, signature: checkoutSignature(orderId, plus.id) });
    const bought = (await admin.doc(`razorpayOrders/${orderId}`).get()).data()!;
    expect(bought.expiresAt - bought.startsAt).toBe(60 * DAY);
    const { giftId } = await paidGift(her, matchId, "week");
    const result = await call(life.claimGift, him, { giftId });
    const saved = await orderOf(giftId);
    expect(saved.startsAt).toBe(bought.expiresAt);
    expect(result.endsAt).toBe(bought.expiresAt + 7 * DAY);
    expect((await admin.doc(`razorpayOrders/${orderId}`).get()).data()).toEqual(bought);
    expect((await billingOf(him))!.expiresAt).toBe(result.endsAt);
    expect(await mirrorOf(him)).toMatchObject({ premiumUntil: result.endsAt });
  });

  test("an owner goodwill month already granted: the gift starts after it", async () => {
    const owner = await member("woman", "Owner", { moderator: true, supportAccess: true });
    const { her, him, matchId } = await pair();
    const email = (await getAuth().getUser(him)).email!;
    const granted = await call(adminGrantPlusMonth, owner, { email, requestId: randomUUID() });
    const { giftId } = await paidGift(her, matchId, "day");
    const result = await call(life.claimGift, him, { giftId });
    expect(await orderOf(giftId)).toMatchObject({ previousCompExpiry: granted.expiresAt, previousCompStatus: "active", startsAt: granted.expiresAt });
    expect(result.endsAt).toBe(granted.expiresAt + DAY);
    expect(await compOf(him)).toMatchObject({ status: "active", expiresAt: result.endsAt, grantedBy: owner });
  });

  test("claim, decline and list keep working after giftSales is switched off", async () => {
    const { her, him, matchId } = await pair();
    const first = await paidGift(her, matchId, "day");
    const second = await paidGift(her, matchId, "week");
    await admin.doc("runtime/trust").set({ requireVerification: false });
    expect((await call(life.claimGift, him, { giftId: first.giftId })).status).toBe("claimed");
    expect(await call(life.declineGift, him, { giftId: second.giftId })).toEqual({ status: "declined" });
    expect((await call(life.listGifts, him)).received.map((view) => view.id).sort()).toEqual([first.giftId, second.giftId].sort());
  });
});

describe("declining a gift", () => {
  test("the recipient declines: the gifter is refunded, nobody gets a pass, and it can't be claimed after", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "week");
    expect((await failure(call(life.declineGift, her, { giftId }))).code).toBe("permission-denied");
    expect(await call(life.declineGift, him, { giftId })).toEqual({ status: "declined" });
    expect(await call(life.declineGift, him, { giftId })).toEqual({ status: "declined" });
    expect((await giftOf(giftId)).status).toBe("declined");
    expect(refundsFor(payment)).toEqual([{ paymentId: payment.id, amount: 9900, notes: { reason: "declined", product: "gift_plan" } }]);
    expect((await admin.doc(`complimentaryPlusGrants/${him}`).get()).exists).toBe(false);
    expect((await billingOf(him))?.expiresAt ?? 0).toBe(0);
    expect((await failure(call(life.claimGift, him, { giftId }))).code).toBe("failed-precondition");
    // Razorpay's own refund events for that refund: closed quietly, never a second refund or a review.
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect(await webhook("payment.refunded", paymentRefunded(payment))).toBe(200);
    expect(refundsFor(payment)).toHaveLength(1);
    expect((await orderOf(giftId)).needsReview).toBeUndefined();
    expect((await giftOf(giftId)).status).toBe("declined");
    await expectMemberFieldsOnly(giftId);
    expect((await orderOf(giftId)).status).toBe("refunded");
  });

  test("a claimed gift can't be declined", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "day");
    await call(life.claimGift, him, { giftId });
    expect((await failure(call(life.declineGift, him, { giftId }))).code).toBe("failed-precondition");
    expect(refundsFor(payment)).toHaveLength(0);
  });
});

describe("the daily expiry sweep", () => {
  test("expires overdue gifts, voids gifts that can't be delivered, refunds each once and leaves the rest", async () => {
    const overdue = await pair(), ended = await pair(), gone = await pair(), banned = await pair(), live = await pair(), claimed = await pair();
    const a = await paidGift(overdue.her, overdue.matchId, "day");
    const b = await paidGift(ended.her, ended.matchId, "day");
    const c = await paidGift(gone.her, gone.matchId, "day");
    const d = await paidGift(banned.her, banned.matchId, "day");
    const e = await paidGift(live.her, live.matchId, "day");
    const f = await paidGift(claimed.her, claimed.matchId, "day");
    await call(life.claimGift, claimed.him, { giftId: f.giftId });
    await admin.doc(`gifts/${a.giftId}`).update({ expiresAt: Date.now() - 1 });
    await admin.doc(`gifts/${f.giftId}`).update({ expiresAt: Date.now() - 1 });
    await admin.doc(`matches/${ended.matchId}`).update({ active: false });
    await admin.doc(`users/${gone.him}`).delete();
    await admin.doc(`moderation/${banned.him}`).update({ status: "banned" });

    await life.runGiftExpiry(Date.now());
    await life.runGiftExpiry(Date.now());

    expect((await giftOf(a.giftId)).status).toBe("expired");
    for (const gift of [b, c, d]) expect((await giftOf(gift.giftId)).status).toBe("void");
    for (const gift of [a, b, c, d]) {
      expect(refundsFor(gift.payment)).toHaveLength(1);
      expect((await orderOf(gift.giftId)).refundDue).toBeUndefined();
      await expectMemberFieldsOnly(gift.giftId);
    }
    expect((await giftOf(e.giftId)).status).toBe("pending");
    expect((await giftOf(f.giftId)).status).toBe("claimed");
    expect(refundsFor(e.payment)).toHaveLength(0);
    expect(refundsFor(f.payment)).toHaveLength(0);
    expect((await admin.doc(`billing/${gone.him}`).get()).exists).toBe(false);
  });

  test("a refund that never ran after a decline (a crash) is retried by the sweep, once; a fresh attempt is left alone", async () => {
    const one = await pair(), two = await pair();
    const crashed = await paidGift(one.her, one.matchId, "day");
    const inFlight = await paidGift(two.her, two.matchId, "day");
    // As if declineGift's transaction committed and the process died before the refund call.
    await admin.doc(`gifts/${crashed.giftId}`).update({ status: "declined" });
    await admin.doc(`giftOrders/${crashed.giftId}`).update({ refundDue: true });
    // Another worker claimed this refund a moment ago.
    await admin.doc(`gifts/${inFlight.giftId}`).update({ status: "declined" });
    await admin.doc(`giftOrders/${inFlight.giftId}`).update({ refundDue: true, refundAttemptAt: Date.now() });
    await life.runGiftExpiry(Date.now());
    await life.runGiftExpiry(Date.now());
    expect(refundsFor(crashed.payment)).toEqual([{ paymentId: crashed.payment.id, amount: 3500, notes: { reason: "declined", product: "gift_plan" } }]);
    expect((await orderOf(crashed.giftId)).refundDue).toBeUndefined();
    expect(refundsFor(inFlight.payment)).toHaveLength(0);
    expect((await orderOf(inFlight.giftId)).refundDue).toBe(true);
  });
});

describe("reversing a gift (refund or chargeback after payment)", () => {
  test("refunded after claim, nothing changed since: the previous expiry comes back; repeats change nothing", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "week");
    await call(life.claimGift, him, { giftId });
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect((await giftOf(giftId)).status).toBe("refunded");
    expect((await orderOf(giftId)).needsReview).toBeUndefined();
    await expectMemberFieldsOnly(giftId);
    expect(await compOf(him)).toMatchObject({ status: "ended", expiresAt: 0 });
    expect((await billingOf(him))!.expiresAt).toBe(0);
    expect(await mirrorOf(him)).toMatchObject({ premiumUntil: 0 });
    expect((await orderOf(giftId)).status).toBe("refunded");
    // The same refund reported again, and a dispute: no review flag, nothing else moves.
    expect(await webhook("payment.refunded", paymentRefunded(payment))).toBe(200);
    expect(await webhook("payment.dispute.lost", disputeLost(payment))).toBe(200);
    expect((await orderOf(giftId)).needsReview).toBeUndefined();
    expect(refundsFor(payment)).toHaveLength(0);
  });

  test("a chargeback after claim on top of an owner month restores exactly the owner's expiry", async () => {
    const owner = await member("woman", "Owner", { moderator: true, supportAccess: true });
    const { her, him, matchId } = await pair();
    const granted = await call(adminGrantPlusMonth, owner, { email: (await getAuth().getUser(him)).email!, requestId: randomUUID() });
    const { giftId, payment } = await paidGift(her, matchId, "day");
    await call(life.claimGift, him, { giftId });
    expect(await webhook("payment.dispute.lost", disputeLost(payment))).toBe(200);
    expect(await compOf(him)).toMatchObject({ status: "active", expiresAt: granted.expiresAt });
    expect((await billingOf(him))!.expiresAt).toBe(granted.expiresAt);
    expect((await giftOf(giftId)).status).toBe("refunded");
    expect(await orderOf(giftId)).toMatchObject({ reversalReason: "chargeback", revokedAt: expect.any(Number) });
  });

  test("changed since (the owner granted a month after the claim): flagged for review, the grant is left alone", async () => {
    const owner = await member("woman", "Owner", { moderator: true, supportAccess: true });
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "week");
    await call(life.claimGift, him, { giftId });
    const granted = await call(adminGrantPlusMonth, owner, { email: (await getAuth().getUser(him)).email!, requestId: randomUUID() });
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect((await giftOf(giftId)).status).toBe("claimed");
    expect(await orderOf(giftId)).toMatchObject({ needsReview: true, needsReviewReason: "refund" });
    await expectMemberFieldsOnly(giftId);
    expect(await compOf(him)).toMatchObject({ status: "active", expiresAt: granted.expiresAt });
    expect((await billingOf(him))!.expiresAt).toBe(granted.expiresAt);
    expect(await webhook("payment.refunded", paymentRefunded(payment))).toBe(200);
    expect((await compOf(him))!.expiresAt).toBe(granted.expiresAt);
  });

  test("two gifts claimed in turn: refunding the older one is reviewed, refunding the newer restores the older one's end", async () => {
    const { her, him, matchId } = await pair();
    const older = await paidGift(her, matchId, "day");
    const newer = await paidGift(her, matchId, "week");
    const first = await call(life.claimGift, him, { giftId: older.giftId });
    const second = await call(life.claimGift, him, { giftId: newer.giftId });
    expect(second.endsAt).toBe(first.endsAt + 7 * DAY);
    expect(await webhook("refund.processed", refundEvent(older.payment))).toBe(200);
    expect((await giftOf(older.giftId)).status).toBe("claimed");
    expect((await orderOf(older.giftId)).needsReview).toBe(true);
    expect((await compOf(him))!.expiresAt).toBe(second.endsAt);
    expect(await webhook("refund.processed", refundEvent(newer.payment))).toBe(200);
    expect((await giftOf(newer.giftId)).status).toBe("refunded");
    expect((await compOf(him))!.expiresAt).toBe(first.endsAt);
  });

  test("a purchased pass is never changed by a reversal", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "day");
    await call(life.claimGift, him, { giftId });
    const { orderId } = await call(createPlusOrder, him, { plan: "week" });
    const plus = pay(orderId);
    await call(confirmPlusPayment, him, { orderId, paymentId: plus.id, signature: checkoutSignature(orderId, plus.id) });
    const bought = (await admin.doc(`razorpayOrders/${orderId}`).get()).data()!;
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect((await giftOf(giftId)).status).toBe("refunded");
    expect((await admin.doc(`razorpayOrders/${orderId}`).get()).data()).toEqual(bought);
    expect((await billingOf(him))!.expiresAt).toBe(bought.expiresAt);
  });

  test("a refund of an unclaimed gift marks it refunded and nothing else", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "day");
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect((await giftOf(giftId)).status).toBe("refunded");
    expect((await admin.doc(`complimentaryPlusGrants/${him}`).get()).exists).toBe(false);
    expect((await failure(call(life.claimGift, him, { giftId }))).code).toBe("failed-precondition");
  });
});

describe("reversal: the revoke condition and repeat events", () => {
  test("refunding the newer gift first, then the older one, unwinds both completely", async () => {
    const { her, him, matchId } = await pair();
    const older = await paidGift(her, matchId, "day");
    const newer = await paidGift(her, matchId, "week");
    const first = await call(life.claimGift, him, { giftId: older.giftId });
    await call(life.claimGift, him, { giftId: newer.giftId });
    expect(await webhook("refund.processed", refundEvent(newer.payment))).toBe(200);
    expect(await compOf(him)).toMatchObject({ status: "active", expiresAt: first.endsAt, lastGiftId: older.giftId });
    expect(await webhook("refund.processed", refundEvent(older.payment))).toBe(200);
    expect(await compOf(him)).toMatchObject({ status: "ended", expiresAt: 0 });
    expect((await orderOf(older.giftId)).needsReview).toBeUndefined();
    expect((await billingOf(him))!.expiresAt).toBe(0);
  });

  test("same expiry but last set by something else, or no longer active: flagged for review, the grant is left alone", async () => {
    const { her, him, matchId } = await pair();
    const relabelled = await paidGift(her, matchId, "day");
    await call(life.claimGift, him, { giftId: relabelled.giftId });
    await admin.doc(`complimentaryPlusGrants/${him}`).update({ lastGiftId: "order_SomethingElse1" });
    expect(await webhook("refund.processed", refundEvent(relabelled.payment))).toBe(200);
    expect(await orderOf(relabelled.giftId)).toMatchObject({ needsReview: true });
    expect(await compOf(him)).toMatchObject({ status: "active", lastGiftId: "order_SomethingElse1", expiresAt: (await orderOf(relabelled.giftId)).endsAt });

    const other = await pair();
    const switchedOff = await paidGift(other.her, other.matchId, "day");
    await call(life.claimGift, other.him, { giftId: switchedOff.giftId });
    await admin.doc(`complimentaryPlusGrants/${other.him}`).update({ status: "ended" });
    expect(await webhook("refund.processed", refundEvent(switchedOff.payment))).toBe(200);
    expect(await orderOf(switchedOff.giftId)).toMatchObject({ needsReview: true });
    expect((await compOf(other.him))!.status).toBe("ended");
  });

  test("a premium sync that failed during the reversal is redone by the next delivery of the event", async () => {
    const { her, him, matchId } = await pair();
    const { giftId, payment } = await paidGift(her, matchId, "week");
    const { endsAt } = await call(life.claimGift, him, { giftId });
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    // As if syncPremium had failed after the restore: the cached pass and the chat mirror are stale.
    await admin.doc(`billing/${him}`).set({ expiresAt: endsAt, checkedAt: Date.now() });
    await admin.doc(`moderation/${him}`).set({ chatAccess: { premiumUntil: endsAt } }, { merge: true });
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect((await billingOf(him))!.expiresAt).toBe(0);
    expect(await mirrorOf(him)).toMatchObject({ premiumUntil: 0 });
    expect((await orderOf(giftId)).needsReview).toBeUndefined();
  });
});

describe("refunds left in flight at capture", () => {
  async function orphanedOrder() {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    return { her, orderId, payment };
  }
  const captured = (payment: FakePayment) => ({ payment: { entity: { id: payment.id, order_id: payment.order_id } } });

  test("a delivery that finds another delivery's refund claim held, with nothing recorded, answers 503 so Razorpay redelivers; confirm says it's being refunded", async () => {
    const { her, orderId, payment } = await orphanedOrder();
    await admin.doc(`giftOrders/${orderId}`).update({ status: "orphaned", paymentId: payment.id, refundAttemptAt: Date.now() });
    expect(await webhook("payment.captured", captured(payment))).toBe(503);
    expect((await gifts.grantGift(orderId, payment.id)).outcome).toBe("refund-in-flight");
    expect(await call(gifts.confirmGiftPayment, her, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) }))
      .toEqual({ status: "pending", giftId: orderId, refunding: true });
    expect(refundsFor(payment)).toHaveLength(0);
  });

  test("the sweep refunds an orphaned or rejected order whose claim went stale, once; a fresh claim is left alone", async () => {
    const stale = await orphanedOrder(), rejected = await orphanedOrder(), fresh = await orphanedOrder();
    await admin.doc(`giftOrders/${stale.orderId}`).update({ status: "orphaned", paymentId: stale.payment.id, refundAttemptAt: Date.now() - 3 * 60_000 });
    await admin.doc(`giftOrders/${rejected.orderId}`).update({ status: "rejected", paymentId: rejected.payment.id, refundAttemptAt: Date.now() - DAY });
    await admin.doc(`giftOrders/${fresh.orderId}`).update({ status: "orphaned", paymentId: fresh.payment.id, refundAttemptAt: Date.now() });
    await life.runGiftExpiry(Date.now());
    await life.runGiftExpiry(Date.now());
    expect(refundsFor(stale.payment)).toEqual([{ paymentId: stale.payment.id, amount: 3500, notes: { reason: "orphaned", product: "gift_plan" } }]);
    expect(refundsFor(rejected.payment)).toEqual([{ paymentId: rejected.payment.id, amount: 3500, notes: { reason: "rejected", product: "gift_plan" } }]);
    expect((await orderOf(stale.orderId)).refundId).toEqual(expect.any(String));
    expect(refundsFor(fresh.payment)).toHaveLength(0);
    expect((await orderOf(fresh.orderId)).refundId).toBeUndefined();
  });

  test("a refund that failed with an error on record is left for support, as before: no automatic retry", async () => {
    const { orderId, payment } = await orphanedOrder();
    await admin.doc(`giftOrders/${orderId}`).update({ status: "orphaned", paymentId: payment.id, refundAttemptAt: Date.now() - DAY, refundError: "Razorpay down" });
    expect(await webhook("payment.captured", captured(payment))).toBe(200);
    expect((await gifts.grantGift(orderId, payment.id)).outcome).toBe("closed");
    await life.runGiftExpiry(Date.now());
    expect(refundsFor(payment)).toHaveLength(0);
    // Support refunds it by hand through the same helper, which records the result.
    await refundGiftPayment(orderId, payment.id, 3500, "orphaned");
    expect(refundsFor(payment)).toHaveLength(1);
    expect((await orderOf(orderId)).refundId).toEqual(expect.any(String));
  });
});

describe("the crash-window refund retry at capture (carried from Task 7)", () => {
  test("two deliveries at once for an orphaned payment call Razorpay's refund once", async () => {
    const { her, him, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    await admin.doc(`users/${him}`).delete();
    const payment = pay(orderId);
    refundDelayMs = 1500;
    try {
      const first = gifts.grantGift(orderId, payment.id);
      // The next deliveries land while the first one's refund call is still in flight.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await Promise.all([first, gifts.grantGift(orderId, payment.id), gifts.grantGift(orderId, payment.id)]);
    } finally {
      refundDelayMs = 0;
    }
    expect(refundsFor(payment)).toHaveLength(1);
    const saved = await orderOf(orderId);
    expect(saved).toMatchObject({ status: "orphaned", refundId: expect.any(String) });
    expect(saved.refundError).toBeUndefined();
  });

  test("a retry claimed under two minutes ago is left alone; an older claim is retried once", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    await admin.doc(`giftOrders/${orderId}`).update({ status: "orphaned", paymentId: payment.id, refundAttemptAt: Date.now() });
    // Held by another delivery, nothing recorded yet: in flight (the webhook answers 503), no second call.
    expect((await gifts.grantGift(orderId, payment.id)).outcome).toBe("refund-in-flight");
    expect(refundsFor(payment)).toHaveLength(0);
    await admin.doc(`giftOrders/${orderId}`).update({ refundAttemptAt: Date.now() - 3 * 60_000 });
    await gifts.grantGift(orderId, payment.id);
    await gifts.grantGift(orderId, payment.id);
    expect(refundsFor(payment)).toHaveLength(1);
  });
});

describe("listing gifts", () => {
  test("both sides see the gift with the other's name from the match, never an email", async () => {
    const { her, him, matchId } = await pair("Alexa Rao", "Jules Verne");
    const pending = await paidGift(her, matchId, "day");
    const claimed = await paidGift(her, matchId, "week");
    const result = await call(life.claimGift, him, { giftId: claimed.giftId });
    await admin.doc(`gifts/${pending.giftId}`).update({ expiresAt: Date.now() - 1 });

    const mine = await call(life.listGifts, her);
    expect(mine.received).toEqual([]);
    expect(mine.sent.map((view) => view.id)).toEqual([claimed.giftId, pending.giftId]);
    // The gifter never learns when the recipient's access ends (it would show what they had before).
    expect(mine.sent[0]).toEqual({ id: claimed.giftId, plan: "week", status: "claimed", counterpartName: "Jules Verne", createdAt: expect.any(Number), expiresAt: expect.any(Number) });
    expect("endsAt" in mine.sent[0]).toBe(false);
    // Overdue but not yet swept: it reads as expired.
    expect(mine.sent[1]).toEqual({ id: pending.giftId, plan: "day", status: "expired", counterpartName: "Jules Verne", createdAt: expect.any(Number), expiresAt: expect.any(Number) });
    const his = await call(life.listGifts, him);
    expect(his.sent).toEqual([]);
    expect(his.received.map((view) => view.counterpartName)).toEqual(["Alexa Rao", "Alexa Rao"]);
    expect(his.received[0]).toMatchObject({ id: claimed.giftId, status: "claimed", endsAt: result.endsAt });
    const text = JSON.stringify([mine, his]);
    expect(text).not.toContain("@");
    expect(text).not.toContain("paymentId");
    expect(text).not.toContain(her);
    expect(text).not.toContain(him);
  });

  test("each list is the most recent 50", async () => {
    const { her, him, matchId } = await pair();
    const batch = admin.batch();
    for (let i = 0; i < 55; i += 1) {
      batch.set(admin.doc(`gifts/order_Seed${counter}x${i}z`), { fromUid: her, toUid: him, matchId, plan: "day", amountPaise: 3500, status: "declined", createdAt: 1_000 + i, expiresAt: 1_000 + i + 7 * DAY, paymentId: `pay_Seed${i}aaaaaa` });
    }
    await batch.commit();
    const { sent } = await call(life.listGifts, her);
    expect(sent).toHaveLength(50);
    expect(sent[0].createdAt).toBe(1_054);
    expect(sent[49].createdAt).toBe(1_005);
  });
});

describe("the paid-chat gate after a claim (real rules, client SDK)", () => {
  const REGION = process.env.FUNCTIONS_REGION || "us-central1";
  const hostAndPort = (value: string): [string, number] => {
    const [host, port] = value.split(":");
    return [host, Number(port)];
  };
  async function client(label: string, name: string, gender: "woman" | "man") {
    const app = initializeClientApp({ projectId: PROJECT_ID, apiKey: "demo-key", authDomain: `${PROJECT_ID}.firebaseapp.com` }, `gl-${label}-${Date.now()}`);
    const auth = getClientAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, { disableWarnings: true });
    const db = getClientFirestore(app);
    connectFirestoreEmulator(db, ...hostAndPort(process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"));
    const functions = getFunctions(app, REGION);
    connectFunctionsEmulator(functions, ...hostAndPort(process.env.MUSE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001"));
    clients.push({ app, db });
    const credential = await createUserWithEmailAndPassword(auth, `gl.${label}.${Date.now()}@example.com`, "Password123!");
    await getAuth().updateUser(credential.user.uid, { emailVerified: true });
    await credential.user.getIdToken(true);
    const uid = credential.user.uid, now = Date.now();
    await setDoc(doc(db, "users", uid, "private", "settings"), {
      showMe: [gender === "woman" ? "man" : "woman"], ageMin: 18, ageMax: 60, maxDistanceKm: 100, locationEnabled: true,
      location: { lat: 28.6139, lng: 77.209, updatedAt: now }, sharedVibesOnly: false, openToCasual: false, notifications: { matches: true, messages: true }, updatedAt: now
    });
    await setDoc(doc(db, "users", uid), {
      uid, displayName: name, age: 27, gender, pronouns: "", city: "Delhi", bio: `Hi, I'm ${name}.`, photoUrls: [`https://example.com/${uid}.jpg`],
      interests: ["canvas"], intentions: ["long-term"], vibes: ["cozy"], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true,
      createdAt: now, updatedAt: now, lastActiveAt: now
    });
    for (let tries = 0; (await admin.doc(`discovery/${uid}`).get()).get("visible") !== true; tries += 1) {
      if (tries > 80) throw new Error("profile never became visible");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const callable = async <T,>(fn: string, data?: unknown) => (await httpsCallable(functions, fn)(data)).data as T;
    return { uid, db, callable };
  }
  function send(db: Firestore, uid: string, matchId: string, other: string) {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "matches", matchId, "messages")), { senderId: uid, text: "Hello", createdAt: serverTimestamp() });
    batch.update(doc(db, "matches", matchId), {
      lastMessage: { text: "Hello", senderId: uid, createdAt: serverTimestamp() }, lastActivityAt: serverTimestamp(), [`unread.${other}`]: increment(1)
    });
    return batch.commit();
  }

  test("a man without a pass can't send; after claiming her gift he can", async () => {
    const asha = await client("asha", "Asha", "woman"), dev = await client("dev", "Dev", "man");
    await asha.callable("swipe", { targetUid: dev.uid, type: "like" });
    const { matched, matchId } = await dev.callable<{ matched: boolean; matchId: string }>("swipe", { targetUid: asha.uid, type: "like" });
    expect(matched).toBe(true);
    await Promise.all([asha.uid, dev.uid].map((uid) => admin.doc(`moderation/${uid}`).set({ cohort: "test", emailVerified: true }, { merge: true })));
    await admin.doc("runtime/trust").set({ requireVerification: false, giftSales: true, enforcePaidChat: true });
    await expect(send(dev.db, dev.uid, matchId, asha.uid)).rejects.toMatchObject({ code: "permission-denied" });
    const { giftId } = await paidGift(asha.uid, matchId, "day");
    await call(life.claimGift, dev.uid, { giftId });
    await send(dev.db, dev.uid, matchId, asha.uid);
  });
});
