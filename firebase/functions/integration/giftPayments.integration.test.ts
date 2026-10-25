/**
 * Gift payments (a Paire Plus pass for a match), run in-process against the
 * Firestore emulator with a fake Razorpay *test-mode* API (no network, no real
 * money), set up the same way as chatPayments.integration.test.ts. Covers the
 * sales switch, eligibility, pricing, signatures, the re-read of the payment,
 * exactly-once delivery, refunds and the separate gift webhook.
 */
import { createHmac, randomBytes } from "crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.RAZORPAY_KEY_ID = "rzp_test_PaireSandbox1";
process.env.RAZORPAY_KEY_SECRET = "sandbox_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "sandbox_webhook_secret";
process.env.MUSE_BILLING_ENABLED = "true";
process.env.MUSE_UNCACHED_RUNTIME = "true";
process.env.KRAFTAI_CHECKOUT_URL = "https://kraftai.in/pay/start";
delete process.env.FUNCTIONS_EMULATOR;

const pushes: Array<{ uid: string; message: { kind: string; title: string; body: string; data: Record<string, string> } }> = [];
let failPush = false;
jest.mock("../src/push", () => ({
  sendPushToUser: jest.fn(async (uid: string, message: { kind: string; title: string; body: string; data: Record<string, string> }) => {
    if (failPush) throw new Error("push down");
    pushes.push({ uid, message });
  })
}));

if (!getApps().length) initializeApp({ projectId: "demo-muse" });
const admin = getFirestore();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gifts = require("../src/giftPayments") as typeof import("../src/giftPayments");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { confirmPlusPayment } = require("../src/razorpay") as typeof import("../src/razorpay");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pairId } = require("../src/lib/ids") as typeof import("../src/lib/ids");

type FakePayment = { id: string; order_id: string; status: string; amount: number; currency: string; amount_refunded: number; refund_status: string | null };
type FakeOrder = { id: string; amount: number; currency: string; status: string; receipt: string; notes: Record<string, string> };
const fake = {
  orders: new Map<string, FakeOrder>(),
  payments: new Map<string, FakePayment>(),
  refunds: [] as Array<{ paymentId: string; amount: number; notes: Record<string, string> }>
};
const rid = (prefix: string) => `${prefix}_${randomBytes(7).toString("hex")}`;

/** Razorpay's REST API in test mode, as far as the server uses it. */
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
    const payment = fake.payments.get(match[1])!;
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
beforeAll(() => {
  global.fetch = (async (input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => fakeRazorpay(String(input), init)) as typeof fetch;
});
afterAll(async () => {
  global.fetch = realFetch;
  await admin.doc("runtime/trust").set({ requireVerification: false });
});

/** The gifter pays in Checkout (test card / UPI): Razorpay records the payment. */
function pay(orderId: string, overrides: Partial<FakePayment> = {}): FakePayment {
  const order = fake.orders.get(orderId)!;
  const payment: FakePayment = { id: rid("pay"), order_id: orderId, status: "captured", amount: order.amount, currency: order.currency, amount_refunded: 0, refund_status: null, ...overrides };
  fake.payments.set(payment.id, payment);
  order.status = payment.status === "captured" ? "paid" : "attempted";
  return payment;
}
const checkoutSignature = (orderId: string, paymentId: string, secret = process.env.RAZORPAY_KEY_SECRET!) => createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

/** A signed-in caller of a callable, run in-process. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = <T,>(fn: { run: (request: any) => T }, uid: string, data: unknown = {}) =>
  fn.run({ data, auth: { uid, token: { email: `${uid}@example.com`, email_verified: true } }, rawRequest: {}, acceptsStreaming: false });

/** A signed Razorpay webhook delivery to the gift webhook; resolves with the HTTP status. */
async function webhook(event: string, payload: Record<string, unknown>, secret = process.env.RAZORPAY_WEBHOOK_SECRET!): Promise<number> {
  const raw = Buffer.from(JSON.stringify({ event, payload }));
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  const headers: Record<string, string> = { "x-razorpay-signature": signature, "content-type": "application/json" };
  const request = { method: "POST", rawBody: raw, body: JSON.parse(raw.toString()), headers, get: (name: string) => headers[name.toLowerCase()], header: (name: string) => headers[name.toLowerCase()] };
  return new Promise((resolve) => {
    const response = { sendStatus: (status: number) => resolve(status), status: (status: number) => ({ send: () => resolve(status), end: () => resolve(status) }), setHeader: () => undefined, getHeader: () => undefined, on: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (gifts.razorpayGiftWebhook as any)(request, response);
  });
}
const paymentEvent = (payment: FakePayment) => ({ payment: { entity: { id: payment.id, order_id: payment.order_id } } });
const refundEvent = (payment: FakePayment) => ({ refund: { entity: { payment_id: payment.id } }, payment: { entity: { id: payment.id, order_id: payment.order_id } } });

let counter = 0;
/** A verified test-cohort member (test-mode money can only ever move between test accounts). */
async function member(gender: "woman" | "man", options: { cohort?: string | null; status?: string } = {}): Promise<string> {
  counter += 1;
  const uid = `gift${gender}${counter}_${Date.now()}`;
  const moderation: Record<string, unknown> = { status: options.status ?? "ok", emailVerified: true };
  if (options.cohort !== null) moderation.cohort = options.cohort ?? "test";
  const batch = admin.batch();
  batch.set(admin.doc(`moderation/${uid}`), moderation);
  batch.set(admin.doc(`users/${uid}`), { uid, displayName: `Member ${counter}`, gender, photoUrls: [], onboardingComplete: true });
  await batch.commit();
  return uid;
}
const nameOf = async (uid: string) => ((await admin.doc(`users/${uid}`).get()).get("displayName") as string | undefined) ?? "Gone";
async function matchUp(a: string, b: string, active = true): Promise<string> {
  const id = pairId(a, b);
  await admin.doc(`matches/${id}`).set({
    id,
    participants: [a, b].sort(),
    active,
    kind: "pair",
    // The same snippet the profile trigger keeps in sync, so the emulated trigger never changes it.
    profiles: { [a]: { displayName: await nameOf(a) }, [b]: { displayName: await nameOf(b) } }
  });
  return id;
}
/** A woman and the man she matched with. */
async function pair(): Promise<{ her: string; him: string; matchId: string }> {
  const her = await member("woman"), him = await member("man");
  return { her, him, matchId: await matchUp(her, him) };
}

async function reasonOf(promise: Promise<unknown>): Promise<{ code: string; reason?: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; details?: { reason?: string } };
    return { code: String(e.code), reason: e.details?.reason };
  }
  throw new Error("expected the call to fail");
}
const order = async (orderId: string) => (await admin.doc(`giftOrders/${orderId}`).get()).data();
const gift = async (orderId: string) => (await admin.doc(`gifts/${orderId}`).get()).data();
const giftsFrom = async (uid: string) => (await admin.collection("gifts").where("fromUid", "==", uid).get()).size;
const confirm = (uid: string, payment: FakePayment) => call(gifts.confirmGiftPayment, uid, {
  orderId: payment.order_id, paymentId: payment.id, signature: checkoutSignature(payment.order_id, payment.id)
});

beforeEach(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false, giftSales: true });
  process.env.RAZORPAY_KEY_ID = "rzp_test_PaireSandbox1";
  pushes.length = 0;
  failPush = false;
});

describe("creating a gift order", () => {
  test("with giftSales off nothing is created and the reason is sales-off", async () => {
    await admin.doc("runtime/trust").set({ requireVerification: false });
    const { her, matchId } = await pair();
    const before = fake.orders.size;
    expect(await reasonOf(call(gifts.createGiftOrder, her, { matchId, plan: "week" }))).toEqual({ code: "failed-precondition", reason: "sales-off" });
    expect(fake.orders.size).toBe(before);
    expect((await admin.collection("giftOrders").where("fromUid", "==", her).get()).empty).toBe(true);
  });

  test("a week gift for her active match: server price, gift_plan notes, its own collection, and no Plus records", async () => {
    const { her, him, matchId } = await pair();
    const result = await call(gifts.createGiftOrder, her, { matchId, plan: "week", amountPaise: 1, toUid: "someone-else" });
    expect(result).toMatchObject({ amount: 9900, currency: "INR", keyId: "rzp_test_PaireSandbox1", email: `${her}@example.com` });
    expect(typeof result.description).toBe("string");
    expect(typeof result.name).toBe("string");
    expect(result.hostedUrl).toContain(`order=${result.orderId}`);
    const remote = fake.orders.get(result.orderId)!;
    expect(remote).toMatchObject({ amount: 9900, currency: "INR", notes: { plan: "week", product: "gift_plan" } });
    expect(Object.keys(remote.notes).sort()).toEqual(["plan", "product"]);
    expect(remote.receipt).toMatch(/^gift_plan_week_\d+$/);
    expect(JSON.stringify(remote)).not.toContain(her);
    expect(JSON.stringify(remote)).not.toContain(him);
    expect(await order(result.orderId)).toMatchObject({ fromUid: her, toUid: him, matchId, plan: "week", amountPaise: 9900, currency: "INR", status: "created", mode: "test" });
    expect(typeof (await order(result.orderId))!.createdAt).toBe("number");
    expect((await admin.doc(`razorpayOrders/${result.orderId}`).get()).exists).toBe(false);
    expect((await admin.doc(`billing/${her}`).get()).exists).toBe(false);
    expect((await admin.doc(`webPassLedger/${her}`).get()).exists).toBe(false);
    expect((await admin.doc(`webPassLedger/${him}`).get()).exists).toBe(false);
  });

  test("a second tab reuses the open order for the same match and plan; another plan is a new order", async () => {
    const { her, matchId } = await pair();
    const first = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const before = fake.orders.size;
    const again = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    expect(again.orderId).toBe(first.orderId);
    expect(fake.orders.size).toBe(before);
    const other = await call(gifts.createGiftOrder, her, { matchId, plan: "month" });
    expect(other.orderId).not.toBe(first.orderId);
    expect(other.amount).toBe(39900);
  });

  test("bad input is refused before anything else", async () => {
    const { her, matchId } = await pair();
    expect((await reasonOf(call(gifts.createGiftOrder, her, { matchId, plan: "lifetime" }))).code).toBe("invalid-argument");
    expect((await reasonOf(call(gifts.createGiftOrder, her, { matchId, plan: "halfyear" }))).code).toBe("invalid-argument");
    expect((await reasonOf(call(gifts.createGiftOrder, her, { matchId: "a/b", plan: "day" }))).code).toBe("invalid-argument");
  });

  test("no match, an ended match, a block, an unavailable recipient and a lifetime recipient each give their reason", async () => {
    const { her, him } = await pair();
    const stranger = await member("man");
    const elsewhere = await matchUp(him, stranger);
    const fail = (uid: string, data: unknown) => reasonOf(call(gifts.createGiftOrder, uid, data));
    expect(await fail(her, { matchId: elsewhere, plan: "day" })).toEqual({ code: "failed-precondition", reason: "no-match" });
    expect(await fail(her, { matchId: pairId(her, stranger), plan: "day" })).toEqual({ code: "failed-precondition", reason: "no-match" });

    const ended = await member("man");
    expect(await fail(her, { matchId: await matchUp(her, ended, false), plan: "day" })).toEqual({ code: "failed-precondition", reason: "no-match" });

    const blocker = await member("man");
    const blockedMatch = await matchUp(her, blocker);
    await admin.doc(`blocks/${blocker}/blocked/${her}`).set({ targetUid: her });
    expect(await fail(her, { matchId: blockedMatch, plan: "day" })).toEqual({ code: "failed-precondition", reason: "blocked" });

    const banned = await member("man", { status: "banned" });
    expect(await fail(her, { matchId: await matchUp(her, banned), plan: "day" })).toEqual({ code: "failed-precondition", reason: "unavailable" });
    const unverified = await member("man");
    const unverifiedMatch = await matchUp(her, unverified);
    await admin.doc(`moderation/${unverified}`).update({ emailVerified: false });
    expect(await fail(her, { matchId: unverifiedMatch, plan: "day" })).toEqual({ code: "failed-precondition", reason: "unavailable" });
    const gone = await member("man");
    const goneMatch = await matchUp(her, gone);
    await admin.doc(`users/${gone}`).delete();
    expect(await fail(her, { matchId: goneMatch, plan: "day" })).toEqual({ code: "failed-precondition", reason: "unavailable" });

    const lifer = await member("man");
    await admin.doc(`lifetimePlusGrants/${lifer}`).set({ status: "active", startsAt: 0 });
    expect(await fail(her, { matchId: await matchUp(her, lifer), plan: "day" })).toEqual({ code: "failed-precondition", reason: "already-lifetime" });

  });

  test("only paid gifts count toward the 3 a day: abandoned checkouts never lock a member out", async () => {
    const { her, matchId } = await pair();
    const fail = (data: unknown) => reasonOf(call(gifts.createGiftOrder, her, data));
    // Three checkouts opened and abandoned.
    for (const plan of ["day", "week", "month"]) await call(gifts.createGiftOrder, her, { matchId, plan });
    const second = await member("man");
    const secondMatch = await matchUp(her, second);
    const fourthOrder = await call(gifts.createGiftOrder, her, { matchId: secondMatch, plan: "day" });
    expect(fourthOrder.amount).toBe(3500);
    // Three paid gifts: the next one is refused.
    for (const plan of ["day", "week", "month"]) {
      const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan });
      expect(await confirm(her, pay(orderId))).toMatchObject({ status: "paid" });
    }
    const third = await member("man");
    expect(await fail({ matchId: await matchUp(her, third), plan: "day" })).toEqual({ code: "failed-precondition", reason: "limit" });
  });
});

describe("confirming a gift payment", () => {
  test("the gift order id is unknown to the Plus confirmation", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "week" });
    const payment = pay(orderId);
    expect((await reasonOf(call(confirmPlusPayment, her, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) }))).code).toBe("not-found");
    expect(await gift(orderId)).toBeUndefined();
    expect((await admin.doc(`razorpayOrders/${orderId}`).get()).exists).toBe(false);
  });

  test("a bad signature is refused, and only the gifter can confirm", async () => {
    const { her, him, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "week" });
    const payment = pay(orderId);
    expect((await reasonOf(call(gifts.confirmGiftPayment, her, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id, "wrong") }))).code).toBe("permission-denied");
    expect((await reasonOf(confirm(him, payment))).code).toBe("not-found");
    expect(await gift(orderId)).toBeUndefined();
  });

  test("a captured payment creates one pending gift that expires 7 days after payment, and tells the recipient", async () => {
    const { her, him, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "week" });
    const payment = pay(orderId);
    expect(await confirm(her, payment)).toEqual({ status: "paid", giftId: orderId });
    const saved = (await order(orderId))!;
    expect(saved).toMatchObject({ status: "paid", paymentId: payment.id });
    expect(await gift(orderId)).toEqual({
      fromUid: her, toUid: him, matchId, plan: "week", amountPaise: 9900, status: "pending",
      createdAt: saved.paidAt, expiresAt: saved.paidAt + 7 * 86_400_000, paymentId: payment.id
    });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].uid).toBe(him);
    expect(pushes[0].message.kind).toBe("matches");
    expect(pushes[0].message.body).toBe("Someone sent you a gift.");
    expect(pushes[0].message.body).not.toContain(await nameOf(her));

    // Twice more by Checkout, then the webhook: still one gift, one push, no refund.
    await confirm(her, payment);
    await confirm(her, payment);
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await giftsFrom(her)).toBe(1);
    expect(pushes).toHaveLength(1);
    expect(fake.refunds.filter((refund) => refund.paymentId === payment.id)).toHaveLength(0);
    expect((await order(orderId))!.paidAt).toBe(saved.paidAt);
  });

  test("with previews on, the push may name the gifter", async () => {
    const { her, him, matchId } = await pair();
    await admin.doc(`users/${him}/private/settings`).set({ notifications: { previews: true } });
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    await confirm(her, pay(orderId));
    expect(pushes[0].message.body).toContain(await nameOf(her));
  });

  test("a failed push never fails the payment", async () => {
    const { her, matchId } = await pair();
    failPush = true;
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    expect(await confirm(her, pay(orderId))).toEqual({ status: "paid", giftId: orderId });
    expect((await gift(orderId))!.status).toBe("pending");
  });

  test("a payment still settling is pending and creates nothing", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    expect(await confirm(her, pay(orderId, { status: "authorized" }))).toEqual({ status: "pending", giftId: orderId });
    expect(await gift(orderId)).toBeUndefined();
    expect((await order(orderId))!.status).toBe("created");
  });

  test("a wrong amount or currency is refused and creates no gift", async () => {
    const { her, matchId } = await pair();
    for (const overrides of [{ amount: 3500 }, { currency: "USD" }]) {
      const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: overrides.amount ? "week" : "month" });
      expect((await reasonOf(confirm(her, pay(orderId, overrides)))).code).toBe("failed-precondition");
      expect(await gift(orderId)).toBeUndefined();
      expect((await order(orderId))!.status).toBe("created");
    }
  });

  test("a recipient deleted, banned or unmatched by capture time: orphaned and refunded", async () => {
    for (const change of ["deleted", "banned", "unmatched", "blocked"] as const) {
      const { her, him, matchId } = await pair();
      const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "week" });
      if (change === "deleted") await admin.doc(`users/${him}`).delete();
      if (change === "banned") await admin.doc(`moderation/${him}`).update({ status: "banned" });
      if (change === "unmatched") await admin.doc(`matches/${matchId}`).update({ active: false });
      if (change === "blocked") await admin.doc(`blocks/${her}/blocked/${him}`).set({ targetUid: him });
      const payment = pay(orderId);
      expect(await reasonOf(confirm(her, payment))).toEqual({ code: "failed-precondition", reason: "refunded" });
      expect(await order(orderId)).toMatchObject({ status: "orphaned", paymentId: payment.id, refundReason: "orphaned" });
      expect(fake.refunds.filter((refund) => refund.paymentId === payment.id)).toEqual([{ paymentId: payment.id, amount: 9900, notes: { reason: "orphaned", product: "gift_plan" } }]);
      expect(await gift(orderId)).toBeUndefined();
      expect(pushes).toHaveLength(0);
    }
  });

  test("a sender banned or deleted by capture time: orphaned and refunded", async () => {
    for (const change of ["banned", "deleted"] as const) {
      const { her, matchId } = await pair();
      const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
      if (change === "banned") await admin.doc(`moderation/${her}`).update({ status: "banned" });
      if (change === "deleted") await admin.doc(`users/${her}`).delete();
      const payment = pay(orderId);
      expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
      expect(await order(orderId)).toMatchObject({ status: "orphaned", paymentId: payment.id, refundReason: "orphaned" });
      expect(fake.refunds.filter((refund) => refund.paymentId === payment.id)).toHaveLength(1);
      expect(await gift(orderId)).toBeUndefined();
    }
  });

  test("a test-mode payment for a real (non-test-cohort) account is rejected and refunded", async () => {
    const her = await member("woman", { cohort: null }), him = await member("man");
    const matchId = await matchUp(her, him);
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    expect((await reasonOf(confirm(her, payment))).code).toBe("failed-precondition");
    expect(await order(orderId)).toMatchObject({ status: "rejected", paymentId: payment.id });
    expect(fake.refunds.some((refund) => refund.paymentId === payment.id && refund.amount === 3500)).toBe(true);
    expect(await gift(orderId)).toBeUndefined();
  });

  test("a second captured payment on a paid gift order is refunded and changes nothing", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const first = pay(orderId);
    await confirm(her, first);
    const second = pay(orderId);
    expect(await confirm(her, second)).toEqual({ status: "paid", giftId: orderId, refunding: true });
    expect(await webhook("payment.captured", paymentEvent(second))).toBe(200);
    expect((await gift(orderId))!.paymentId).toBe(first.id);
    expect(await giftsFrom(her)).toBe(1);
    expect(fake.refunds.filter((refund) => refund.paymentId === second.id)).toHaveLength(1);
    expect(fake.refunds.filter((refund) => refund.paymentId === first.id)).toHaveLength(0);
    expect((await order(orderId))!.extraPaymentIds).toEqual([second.id]);
  });
});

describe("the gift webhook", () => {
  test("a bad signature is 401; an unknown order is 200 and writes nothing", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    expect(await webhook("payment.captured", paymentEvent(payment), "wrong_secret")).toBe(401);
    expect(await gift(orderId)).toBeUndefined();

    const stray = { id: rid("order"), amount: 9900, currency: "INR", status: "paid", receipt: "plus_week_1", notes: {} };
    fake.orders.set(stray.id, stray);
    const strayPayment = pay(stray.id);
    expect(await webhook("payment.captured", paymentEvent(strayPayment))).toBe(200);
    expect(await webhook("refund.processed", refundEvent(strayPayment))).toBe(200);
    expect((await admin.doc(`giftOrders/${stray.id}`).get()).exists).toBe(false);
    expect((await admin.doc(`gifts/${stray.id}`).get()).exists).toBe(false);
    expect(fake.refunds.some((refund) => refund.paymentId === strayPayment.id)).toBe(false);
  });

  test("a capture seen only by the webhook (closed tab) still delivers the gift once", async () => {
    const { her, him, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "month" });
    const payment = pay(orderId);
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await gift(orderId)).toMatchObject({ toUid: him, plan: "month", amountPaise: 39900, status: "pending" });
    expect(pushes.filter((push) => push.uid === him)).toHaveLength(1);
    expect(await confirm(her, payment)).toEqual({ status: "paid", giftId: orderId });
  });

  test("a refund marks an unclaimed gift refunded; a claimed one is flagged for review", async () => {
    const { her, matchId } = await pair();
    const pending = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const pendingPayment = pay(pending.orderId);
    await confirm(her, pendingPayment);
    expect(await webhook("refund.processed", refundEvent(pendingPayment))).toBe(200);
    expect((await gift(pending.orderId))!.status).toBe("refunded");
    expect((await order(pending.orderId))!.status).toBe("refunded");

    const claimed = await call(gifts.createGiftOrder, her, { matchId, plan: "week" });
    const claimedPayment = pay(claimed.orderId);
    await confirm(her, claimedPayment);
    await admin.doc(`gifts/${claimed.orderId}`).update({ status: "claimed" });
    expect(await webhook("payment.dispute.lost", { dispute: { entity: { payment_id: claimedPayment.id } } })).toBe(200);
    expect(await gift(claimed.orderId)).toMatchObject({ status: "claimed", needsReview: true });
  });

  test("a refund that lands before the capture is granted stops a later capture from creating the gift", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect((await order(orderId))!.status).toBe("refunded");
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await gift(orderId)).toBeUndefined();
    // Its own refund already returned that money: the re-delivered capture is not refunded again.
    expect(await webhook("refund.processed", refundEvent(payment))).toBe(200);
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(fake.refunds.filter((refund) => refund.paymentId === payment.id)).toHaveLength(0);
    expect((await order(orderId))!.refundedPaymentIds).toEqual([payment.id]);
  });

  test("payment A refunded, then payment B captured on the same order: B is refunded and nothing else changes", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "week" });
    // A was captured, but its capture event is late; Razorpay refunds it first.
    const a = pay(orderId);
    expect(await webhook("refund.processed", refundEvent(a))).toBe(200);
    const before = (await order(orderId))!;
    expect(before).toMatchObject({ status: "refunded", refundedPaymentIds: [a.id] });
    const b = pay(orderId);
    expect(await webhook("payment.captured", paymentEvent(b))).toBe(200);
    expect(fake.refunds.filter((refund) => refund.paymentId === b.id)).toEqual([{ paymentId: b.id, amount: 9900, notes: { reason: "second-payment-on-paid-order", product: "gift_plan" } }]);
    const after = (await order(orderId))!;
    expect(after).toMatchObject({ status: "refunded", extraPaymentIds: [b.id], refundedPaymentIds: [a.id] });
    expect(after.paymentId).toBeUndefined();
    expect(await gift(orderId)).toBeUndefined();
    // Re-delivered: still one refund.
    await gifts.grantGift(orderId, b.id);
    expect(fake.refunds.filter((refund) => refund.paymentId === b.id)).toHaveLength(1);
    expect((await reasonOf(confirm(her, b))).code).toBe("failed-precondition");
  });

  test("another payment captured on an orphaned order is refunded too", async () => {
    const { her, him, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    await admin.doc(`users/${him}`).delete();
    const a = pay(orderId);
    expect(await webhook("payment.captured", paymentEvent(a))).toBe(200);
    expect((await order(orderId))!.status).toBe("orphaned");
    const b = pay(orderId);
    expect(await webhook("payment.captured", paymentEvent(b))).toBe(200);
    expect(fake.refunds.filter((refund) => refund.paymentId === a.id)).toHaveLength(1);
    expect(fake.refunds.filter((refund) => refund.paymentId === b.id)).toHaveLength(1);
    expect(await order(orderId)).toMatchObject({ status: "orphaned", paymentId: a.id, extraPaymentIds: [b.id] });
  });

  test("an orphaned payment whose refund never ran (a crash after the transaction) is refunded on the next delivery, once", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    await admin.doc(`giftOrders/${orderId}`).update({ status: "orphaned", paymentId: payment.id });
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(fake.refunds.filter((refund) => refund.paymentId === payment.id)).toHaveLength(1);
    expect((await order(orderId))!.refundId).toEqual(expect.any(String));
    await gifts.grantGift(orderId, payment.id);
    expect(fake.refunds.filter((refund) => refund.paymentId === payment.id)).toHaveLength(1);
  });

  test("the gift webhook fails closed without its secret", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      process.env.RAZORPAY_WEBHOOK_SECRET = "disabled";
      expect(await webhook("payment.captured", paymentEvent(payment), "disabled")).toBe(401);
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      expect(await webhook("payment.captured", paymentEvent(payment), "")).toBe(401);
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    }
    expect(await gift(orderId)).toBeUndefined();
  });

  test("dispute updates other than a loss are only logged", async () => {
    const { her, matchId } = await pair();
    const { orderId } = await call(gifts.createGiftOrder, her, { matchId, plan: "day" });
    const payment = pay(orderId);
    await confirm(her, payment);
    expect(await webhook("payment.dispute.created", { dispute: { entity: { payment_id: payment.id } } })).toBe(200);
    expect((await gift(orderId))!.status).toBe("pending");
    expect((await gift(orderId))!.needsReview).toBeUndefined();
  });
});
