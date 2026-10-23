/**
 * Unlimited Chat payments, run in-process against the Firestore emulator with a
 * fake Razorpay *test-mode* API (no network, no real money). Covers the server
 * rules that decide whether a payment unlocks chat: price, currency, owner,
 * environment, signatures, webhooks, duplicates, refunds and chargebacks.
 *
 * Real Razorpay sandbox runs still need test keys; see docs/presence-and-paid-chat.md.
 */
import { createHmac, randomBytes } from "crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.RAZORPAY_KEY_ID = "rzp_test_PaireSandbox1";
process.env.RAZORPAY_KEY_SECRET = "sandbox_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "sandbox_webhook_secret";
process.env.MUSE_CHAT_UNLOCK_ENABLED = "true";
process.env.MUSE_BILLING_SANDBOX = "true";
process.env.MUSE_BILLING_ENABLED = "true";
process.env.MUSE_UNCACHED_RUNTIME = "true";
process.env.KRAFTAI_CHECKOUT_URL = "https://kraftai.in/pay/start";
process.env.MUSE_UPI_VPA = "paire.in@ybl";
delete process.env.FUNCTIONS_EMULATOR;

if (!getApps().length) initializeApp({ projectId: "demo-muse" });
const admin = getFirestore();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chat = require("../src/chatAccess") as typeof import("../src/chatAccess");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { razorpayWebhook, createPlusOrder, confirmPlusPayment } = require("../src/razorpay") as typeof import("../src/razorpay");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncChatAccess } = require("../src/chatEntitlement") as typeof import("../src/chatEntitlement");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const upi = require("../src/upiPayments") as typeof import("../src/upiPayments");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const memberAdmin = require("../src/memberAdmin") as typeof import("../src/memberAdmin");

type FakePayment = { id: string; order_id: string; status: string; amount: number; currency: string; amount_refunded: number; refund_status: string | null };
const fake = {
  orders: new Map<string, { id: string; amount: number; currency: string; status: string; notes: Record<string, string> }>(),
  payments: new Map<string, FakePayment>(),
  refunds: [] as Array<{ paymentId: string; amount: number }>
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
    const order = { id: rid("order"), amount: body.amount, currency: body.currency, status: "created", notes: body.notes };
    fake.orders.set(order.id, order);
    return json(order);
  }
  let match = /^\/orders\/(order_\w+)\/payments$/.exec(path);
  if (match) return json({ items: [...fake.payments.values()].filter((payment) => payment.order_id === match![1]) });
  match = /^\/orders\/(order_\w+)$/.exec(path);
  if (match) return fake.orders.has(match[1]) ? json(fake.orders.get(match[1])) : json({}, 400);
  match = /^\/payments\/(pay_\w+)\/refund$/.exec(path);
  if (match && init?.method === "POST") {
    const payment = fake.payments.get(match[1])!;
    payment.amount_refunded = payment.amount;
    payment.refund_status = "full";
    fake.refunds.push({ paymentId: payment.id, amount: JSON.parse(String(init.body)).amount });
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
afterAll(() => {
  global.fetch = realFetch;
});

/** The buyer pays in Checkout (test card / UPI): Razorpay records the payment. */
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

/** A signed Razorpay webhook delivery; resolves with the HTTP status. */
async function webhook(event: string, payload: Record<string, unknown>, secret = process.env.RAZORPAY_WEBHOOK_SECRET!): Promise<number> {
  const raw = Buffer.from(JSON.stringify({ event, payload }));
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  const headers: Record<string, string> = { "x-razorpay-signature": signature, "content-type": "application/json" };
  const request = { method: "POST", rawBody: raw, body: JSON.parse(raw.toString()), headers, get: (name: string) => headers[name.toLowerCase()], header: (name: string) => headers[name.toLowerCase()] };
  return new Promise((resolve) => {
    const response = { sendStatus: (status: number) => resolve(status), status: (status: number) => ({ send: () => resolve(status), end: () => resolve(status) }), setHeader: () => undefined, getHeader: () => undefined, on: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (razorpayWebhook as any)(request, response);
  });
}
const paymentEvent = (payment: FakePayment) => ({ payment: { entity: { id: payment.id, order_id: payment.order_id } } });

let counter = 0;
/** A matched, verified test-cohort member (test-mode money can only ever unlock test accounts). */
async function buyer(options: { matched?: boolean; cohort?: string; status?: string } = {}): Promise<string> {
  counter += 1;
  const uid = `buyer${counter}_${Date.now()}`;
  // Profile triggers must see the verified fixture immediately, not recheck a nonexistent Auth user.
  const batch = admin.batch();
  batch.set(admin.doc(`moderation/${uid}`), { status: options.status ?? "ok", emailVerified: true, cohort: options.cohort ?? "test" });
  batch.set(admin.doc(`users/${uid}`), { uid, displayName: `Buyer ${counter}`, photoUrls: [], onboardingComplete: true });
  await batch.commit();
  if (options.matched !== false) await admin.doc(`matches/${uid}_zz`).set({ participants: [uid, "zz"], active: true, kind: "pair" });
  return uid;
}
const unlockOf = async (uid: string) => (await admin.doc(`chatUnlocks/${uid}`).get()).data();
const mirrorOf = async (uid: string) => (await admin.doc(`moderation/${uid}`).get()).get("chatAccess");

async function checkout(uid: string): Promise<string> {
  const result = await call(chat.createChatUnlockOrder, uid);
  if (result.status !== "checkout") throw new Error(`expected a checkout, got ${result.status}`);
  return result.checkout.orderId;
}

beforeEach(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false, unlockSales: true });
  process.env.RAZORPAY_KEY_ID = "rzp_test_PaireSandbox1";
});
afterAll(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false });
});

describe("Plus validity extensions", () => {
  const day = 86_400_000;
  const saved = async (orderId: string) => (await admin.doc(`razorpayOrders/${orderId}`).get()).data()!;
  const confirm = (uid: string, payment: FakePayment) => call(confirmPlusPayment, uid, {
    orderId: payment.order_id, paymentId: payment.id, signature: checkoutSignature(payment.order_id, payment.id)
  });

  test("active members can buy every pass; each adds its full duration and refunds preserve earlier time", async () => {
    const uid = await buyer();
    let until = 0;
    for (const [plan, days] of [["day", 1], ["week", 7], ["month", 60]] as const) {
      const { orderId } = await call(createPlusOrder, uid, { plan });
      // Opening checkout alone never changes validity.
      expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt") ?? 0).toBe(until);
      const payment = pay(orderId);
      const status = await confirm(uid, payment);
      const order = await saved(orderId);
      expect(order.expiresAt - order.startsAt).toBe(days * day);
      if (until) expect(order.startsAt).toBe(until);
      expect(status).toMatchObject({ active: true, pending: false, expiresAt: order.expiresAt });
      expect(await mirrorOf(uid)).toMatchObject({ premiumUntil: order.expiresAt });
      // Duplicate callbacks and webhooks never add the same days again.
      await confirm(uid, payment);
      expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
      expect((await saved(orderId)).expiresAt).toBe(order.expiresAt);
      if (plan === "month") {
        expect(await webhook("refund.processed", { refund: { entity: { payment_id: payment.id } } })).toBe(200);
        expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt")).toBe(until);
      }
      until = order.expiresAt;
    }
  });

  test("complimentary Plus is preserved even without a queue ledger", async () => {
    const uid = await buyer();
    const until = Date.now() + 60 * day;
    await admin.doc(`supportPlusGrants/${uid}`).set({ status: "active", startsAt: Date.now() - day, expiresAt: until, amountReportedPaise: 0 });
    const { orderId } = await call(createPlusOrder, uid, { plan: "week" });
    expect(await confirm(uid, pay(orderId))).toMatchObject({ expiresAt: until + 7 * day });
    expect(await saved(orderId)).toMatchObject({ startsAt: until, expiresAt: until + 7 * day });
  });

  test("a pass bought through another gateway is preserved without a queue ledger", async () => {
    const uid = await buyer();
    const until = Date.now() + 7 * day;
    await admin.doc(`upiUnlockOrders/earlier_${uid}`).set({ uid, kind: "plus", status: "approved", startsAt: Date.now() - day, expiresAt: until });
    const { orderId } = await call(createPlusOrder, uid, { plan: "day" });
    expect(await confirm(uid, pay(orderId))).toMatchObject({ expiresAt: until + day });
  });

  test("simultaneous captures and repeated deliveries queue every payment exactly once", async () => {
    const uid = await buyer();
    const first = await call(createPlusOrder, uid, { plan: "week" });
    await confirm(uid, pay(first.orderId));
    const until = (await saved(first.orderId)).expiresAt;
    const one = await call(createPlusOrder, uid, { plan: "day" });
    const two = await call(createPlusOrder, uid, { plan: "month" });
    const p1 = pay(one.orderId), p2 = pay(two.orderId);
    expect(await Promise.all([p1, p2, p1].map(payment => webhook("payment.captured", paymentEvent(payment))))).toEqual([200, 200, 200]);
    const queued = [await saved(one.orderId), await saved(two.orderId)].sort((a, b) => a.startsAt - b.startsAt);
    expect(queued[0].startsAt).toBe(until);
    expect(queued[1].startsAt).toBe(queued[0].expiresAt);
    expect(queued[1].expiresAt).toBe(until + 61 * day);
    expect((await admin.doc(`webPassLedger/${uid}`).get()).get("until")).toBe(until + 61 * day);
  });

  test("a pending extension leaves an active pass's expiry unchanged", async () => {
    const uid = await buyer();
    const until = Date.now() + 7 * day;
    await admin.doc(`supportPlusGrants/${uid}`).set({ status: "active", startsAt: Date.now() - day, expiresAt: until });
    const { orderId } = await call(createPlusOrder, uid, { plan: "month" });
    expect(await confirm(uid, pay(orderId, { status: "authorized" }))).toMatchObject({ active: true, pending: true, expiresAt: until });
    expect(await saved(orderId)).toMatchObject({ status: "created" });
  });
});

describe("Unlimited Chat orders", () => {
  test("Plus orders use KraftAI metadata while ownership stays in Firestore", async () => {
    for (const plan of ["day", "week", "month"]) {
      const uid = await buyer();
      const result = await call(createPlusOrder, uid, { plan });
      expect(fake.orders.get(result.orderId)?.notes).toEqual({ product: "kraftai_plus", plan });
      expect(result.description).toMatch(/^KraftAI Plus/);
      expect(result.hostedUrl).toMatch(/^https:\/\/kraftai\.in\/\?order=/);
      expect((await admin.doc(`razorpayOrders/${result.orderId}`).get()).get("uid")).toBe(uid);
    }
  });

  test("unconfigured hosted checkout cannot create an order", async () => {
    const original = process.env.KRAFTAI_CHECKOUT_URL;
    const count = fake.orders.size;
    delete process.env.KRAFTAI_CHECKOUT_URL;
    try {
      await expect(call(chat.createChatUnlockOrder, await buyer())).rejects.toThrow(/Secure checkout is unavailable/);
      await expect(call(createPlusOrder, await buyer(), { plan: "day" })).rejects.toThrow(/Secure checkout is unavailable/);
      expect(fake.orders.size).toBe(count);
    } finally {
      process.env.KRAFTAI_CHECKOUT_URL = original;
    }
  });

  test("replaces an unpaid legacy chat order but still settles a captured legacy payment", async () => {
    const uid = await buyer();
    const legacy = await checkout(uid);
    fake.orders.get(legacy)!.notes = { product: "paire_unlimited_chat", uid };
    const replacement = await checkout(uid);
    expect(replacement).not.toBe(legacy);
    expect(fake.orders.get(replacement)?.notes).toEqual({ product: "kraftai_unlimited_chat" });
    expect((await admin.doc(`chatUnlockOrders/${legacy}`).get()).get("status")).toBe("created");
    pay(legacy);
    const payment = [...fake.payments.values()].find(item => item.order_id === legacy)!;
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect((await unlockOf(uid))?.orderId).toBe(legacy);
  });

  test("the server sets the product and price and binds the order to the caller", async () => {
    const uid = await buyer();
    const result = await call(chat.createChatUnlockOrder, uid, { amount: 1, currency: "USD", uid: "someone-else", product: "plus" });
    expect(result.status).toBe("checkout");
    if (result.status !== "checkout") return;
    expect(result.checkout).toMatchObject({ amount: 4900, currency: "INR", name: "KraftAI", description: "KraftAI Unlimited Chat · one-time ₹49 unlock" });
    expect(fake.orders.get(result.checkout.orderId)?.notes).toEqual({ product: "kraftai_unlimited_chat" });
    expect((await admin.doc(`chatUnlockOrders/${result.checkout.orderId}`).get()).data()).toMatchObject({ uid, amountPaise: 4900, currency: "INR", mode: "test", status: "created" });
  });

  test("offered only after a real mutual match, while sales are on, to accounts in good standing", async () => {
    await expect(call(chat.createChatUnlockOrder, await buyer({ matched: false }))).rejects.toThrow(/mutual match/);
    await expect(call(chat.createChatUnlockOrder, await buyer({ status: "banned" }))).rejects.toThrow(/unavailable/);
    await admin.doc("runtime/trust").set({ requireVerification: false, unlockSales: false });
    await expect(call(chat.createChatUnlockOrder, await buyer())).rejects.toThrow(/isn't available yet/);
  });

  test("test-mode money never unlocks a real account", async () => {
    const real = await buyer({ cohort: "public" });
    await expect(call(chat.createChatUnlockOrder, real)).rejects.toThrow(/test accounts/);
    // Even if such an order existed, a captured test payment for it is rejected, not granted.
    await admin.doc("chatUnlockOrders/order_ForgedTest01").set({ uid: real, product: "paire_unlimited_chat", amountPaise: 4900, currency: "INR", mode: "test", status: "created" });
    fake.orders.set("order_ForgedTest01", { id: "order_ForgedTest01", amount: 4900, currency: "INR", status: "created", notes: {} });
    const payment = pay("order_ForgedTest01");
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await unlockOf(real)).toBeUndefined();
    expect((await admin.doc("chatUnlockOrders/order_ForgedTest01").get()).get("status")).toBe("rejected");
  });

  test("live keys can't sell until production is explicitly approved", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_live_PaireLive01";
    await expect(call(chat.createChatUnlockOrder, await buyer())).rejects.toThrow(/isn't available yet/);
  });
});

describe("confirming a payment", () => {
  test("a verified ₹49 capture unlocks chat for this account only, everywhere, and is never sold twice", async () => {
    const uid = await buyer();
    const other = await buyer();
    const orderId = await checkout(uid);
    const payment = pay(orderId);
    const result = await call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) });
    expect(result.status).toBe("owned");
    expect(result.access).toMatchObject({ canSend: true, unlimited: true, unlock: { status: "owned" } });
    expect(await unlockOf(uid)).toMatchObject({ status: "active", orderId, paymentId: payment.id, amountPaise: 4900, currency: "INR", product: "paire_unlimited_chat", mode: "test" });
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: true });
    expect(await unlockOf(other)).toBeUndefined();
    // Another device, a retry or a second tab: no new order, no second charge.
    const ordersBefore = fake.orders.size;
    expect(await call(chat.createChatUnlockOrder, uid)).toEqual({ status: "owned" });
    expect(fake.orders.size).toBe(ordersBefore);
    // Confirming again is harmless.
    expect((await call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) })).status).toBe("owned");
  });

  test("forged signatures, other people's orders and unknown payments unlock nothing", async () => {
    const uid = await buyer();
    const thief = await buyer();
    const orderId = await checkout(uid);
    const payment = pay(orderId);
    await expect(call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: "0".repeat(64) })).rejects.toThrow(/couldn't verify/);
    await expect(call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id, "guessed") })).rejects.toThrow(/couldn't verify/);
    await expect(call(chat.confirmChatUnlock, thief, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) })).rejects.toThrow(/couldn't find/);
    const ghost = rid("pay");
    await expect(call(chat.confirmChatUnlock, uid, { orderId, paymentId: ghost, signature: checkoutSignature(orderId, ghost) })).rejects.toThrow();
    expect(await unlockOf(uid)).toBeUndefined();
    expect(await unlockOf(thief)).toBeUndefined();
  });

  test("wrong amounts and currencies are refused, even with a valid signature", async () => {
    for (const overrides of [{ amount: 100 }, { amount: 500000 }, { currency: "USD" }]) {
      const uid = await buyer();
      const orderId = await checkout(uid);
      const payment = pay(orderId, overrides);
      await expect(call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) })).rejects.toThrow(/doesn't match/);
      expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
      expect(await unlockOf(uid)).toBeUndefined();
    }
  });

  test("an order from another payment environment is refused", async () => {
    const uid = await buyer();
    const orderId = await checkout(uid);
    const payment = pay(orderId);
    process.env.RAZORPAY_KEY_ID = "rzp_live_PaireLive01";
    await expect(call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) })).rejects.toThrow(/different payment environment/);
    expect(await unlockOf(uid)).toBeUndefined();
  });

  test("a payment still settling is pending: no unlock yet, and no invitation to pay again", async () => {
    const uid = await buyer();
    const orderId = await checkout(uid);
    const payment = pay(orderId, { status: "authorized" });
    const result = await call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) });
    expect(result.status).toBe("pending");
    expect(result.access.unlock.status).toBe("pending");
    const ordersBefore = fake.orders.size;
    expect(await call(chat.createChatUnlockOrder, uid)).toEqual({ status: "pending" });
    expect(fake.orders.size).toBe(ordersBefore);
    // The bank confirms later; the delayed webhook completes the unlock.
    payment.status = "captured";
    fake.orders.get(orderId)!.status = "paid";
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await unlockOf(uid)).toMatchObject({ status: "active", orderId });
    expect((await call(chat.getChatAccess, uid)).unlock.status).toBe("owned");
  });

  test("checking a closed checkout settles it with Razorpay", async () => {
    const uid = await buyer();
    const orderId = await checkout(uid);
    pay(orderId); // Paid by UPI after the window closed; neither callback nor webhook arrived yet.
    expect((await call(chat.getChatAccess, uid, { reconcile: true })).unlock.status).toBe("owned");
  });
});

describe("webhooks", () => {
  test("a closed tab is covered: the signed webhook alone unlocks, exactly once", async () => {
    const uid = await buyer();
    const payment = pay(await checkout(uid));
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await webhook("payment.captured", paymentEvent(payment))).toBe(200);
    expect(await unlockOf(uid)).toMatchObject({ status: "active", paymentId: payment.id });
    expect(fake.refunds.filter((refund) => refund.paymentId === payment.id)).toHaveLength(0);
  });

  test("unsigned or wrongly signed webhooks are rejected", async () => {
    const uid = await buyer();
    const payment = pay(await checkout(uid));
    expect(await webhook("payment.captured", paymentEvent(payment), "not-the-secret")).toBe(401);
    expect(await unlockOf(uid)).toBeUndefined();
  });

  test("concurrent checkouts share one order; a second payment that slips through is refunded", async () => {
    const uid = await buyer();
    const results = await Promise.allSettled([call(chat.createChatUnlockOrder, uid), call(chat.createChatUnlockOrder, uid)]);
    const orders = new Set(results.flatMap((result) => (result.status === "fulfilled" && result.value.status === "checkout" ? [result.value.checkout.orderId] : [])));
    expect(orders.size).toBe(1);
    const [first] = [...orders];
    expect(await checkout(uid)).toBe(first);
    // Two orders paid anyway (e.g. an order from before a reset): only one entitlement.
    await admin.doc(`chatUnlockCheckout/${uid}`).delete();
    const second = await checkout(uid);
    expect(second).not.toBe(first);
    const paymentA = pay(first);
    const paymentB = pay(second);
    await Promise.all([webhook("payment.captured", paymentEvent(paymentA)), webhook("payment.captured", paymentEvent(paymentB))]);
    const unlock = await unlockOf(uid);
    expect(unlock?.status).toBe("active");
    const winner = unlock?.paymentId as string;
    const loser = winner === paymentA.id ? paymentB : paymentA;
    expect(fake.refunds).toContainEqual({ paymentId: loser.id, amount: 4900 });
    expect((await admin.doc(`chatUnlockOrders/${loser.order_id}`).get()).get("status")).toBe("duplicate");
    // Razorpay's refund event for the duplicate leaves the real unlock alone.
    expect(await webhook("refund.processed", { refund: { entity: { payment_id: loser.id } }, payment: { entity: { id: loser.id, order_id: loser.order_id } } })).toBe(200);
    expect(await unlockOf(uid)).toMatchObject({ status: "active", paymentId: winner });
  });

  test("a second payment on an already-paid order is refunded, and its refund leaves the unlock alone", async () => {
    const uid = await buyer();
    const orderId = await checkout(uid);
    const first = pay(orderId);
    await webhook("payment.captured", paymentEvent(first));
    // Razorpay late-captures an earlier attempt on the same order.
    const second = pay(orderId);
    await webhook("payment.captured", paymentEvent(second));
    expect(fake.refunds).toContainEqual({ paymentId: second.id, amount: 4900 });
    const order = (await admin.doc(`chatUnlockOrders/${orderId}`).get()).data()!;
    expect(order).toMatchObject({ status: "paid", paymentId: first.id, extraPaymentIds: [second.id] });
    // The refund event for that second payment (found by order id) must not revoke what the first bought.
    expect(await webhook("refund.processed", { refund: { entity: { payment_id: second.id } }, payment: { entity: { id: second.id, order_id: orderId } } })).toBe(200);
    expect(await webhook("payment.dispute.lost", { dispute: { entity: { payment_id: second.id } }, payment: { entity: { id: second.id, order_id: orderId } } })).toBe(200);
    expect(await unlockOf(uid)).toMatchObject({ status: "active", paymentId: first.id });
    expect((await admin.doc(`chatUnlockOrders/${orderId}`).get()).get("status")).toBe("paid");
  });

  test("a refund removes Unlimited Chat but never a separate Plus pass; Plus expiring never removes Unlimited Chat", async () => {
    const uid = await buyer();
    const payment = pay(await checkout(uid));
    await webhook("payment.captured", paymentEvent(payment));
    const plusUntil = Date.now() + 60 * 60_000;
    await admin.doc(`billing/${uid}`).set({ expiresAt: plusUntil, checkedAt: Date.now() });
    await syncChatAccess(uid);
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: true, premiumUntil: plusUntil });
    // Plus runs out: Unlimited Chat stays.
    await admin.doc(`billing/${uid}`).set({ expiresAt: Date.now() - 1000, checkedAt: Date.now() });
    await syncChatAccess(uid);
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: true });
    // A new Plus pass, then the ₹49 is refunded: Plus stays.
    await admin.doc(`billing/${uid}`).set({ expiresAt: plusUntil, checkedAt: Date.now() });
    expect(await webhook("refund.processed", { refund: { entity: { payment_id: payment.id } }, payment: { entity: { id: payment.id, order_id: payment.order_id } } })).toBe(200);
    expect(await unlockOf(uid)).toMatchObject({ status: "revoked", revokedReason: "refund" });
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: false, premiumUntil: plusUntil });
    expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt")).toBe(plusUntil);
  });

  test("a refund that arrives before the capture means no unlock", async () => {
    const uid = await buyer();
    const orderId = await checkout(uid);
    const payment = pay(orderId);
    payment.amount_refunded = 4900;
    payment.refund_status = "full";
    await webhook("refund.processed", { refund: { entity: { payment_id: payment.id } }, payment: { entity: { id: payment.id, order_id: orderId } } });
    await webhook("payment.captured", paymentEvent(payment));
    expect(await unlockOf(uid)).toBeUndefined();
  });

  test("chargebacks: flagged while disputed, removed when lost", async () => {
    const uid = await buyer();
    const payment = pay(await checkout(uid));
    await webhook("payment.captured", paymentEvent(payment));
    const dispute = { dispute: { entity: { payment_id: payment.id } }, payment: { entity: { id: payment.id, order_id: payment.order_id } } };
    expect(await webhook("payment.dispute.created", dispute)).toBe(200);
    expect((await admin.doc(`chatUnlockOrders/${payment.order_id}`).get()).get("disputed")).toBe(true);
    expect(await unlockOf(uid)).toMatchObject({ status: "active" });
    expect(await webhook("payment.dispute.lost", dispute)).toBe(200);
    expect(await unlockOf(uid)).toMatchObject({ status: "revoked", revokedReason: "chargeback" });
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: false });
  });

  test("reconciliation never resurrects deleted or banned accounts", async () => {
    const gone = await buyer();
    const payment = pay(await checkout(gone));
    await admin.doc(`users/${gone}`).delete();
    await webhook("payment.captured", paymentEvent(payment));
    expect((await admin.doc(`users/${gone}`).get()).exists).toBe(false);
    expect(await unlockOf(gone)).toBeUndefined();
    expect((await admin.doc(`chatUnlockOrders/${payment.order_id}`).get()).get("status")).toBe("orphaned");
    expect(fake.refunds).toContainEqual({ paymentId: payment.id, amount: 4900 });

    const banned = await buyer();
    const paid = pay(await checkout(banned));
    await admin.doc(`moderation/${banned}`).update({ status: "banned" });
    await webhook("payment.captured", paymentEvent(paid));
    expect((await admin.doc(`moderation/${banned}`).get()).get("status")).toBe("banned");
  });
});

describe("Unlimited Chat by UPI (into Paire's own account)", () => {
  const moderatorCall = <T,>(fn: { run: (request: any) => T }, uid: string, data: unknown) => // eslint-disable-line @typescript-eslint/no-explicit-any
    fn.run({ data, auth: { uid, token: { moderator: true } }, rawRequest: {}, acceptsStreaming: false });
  const utr = () => String(100000000000 + Math.floor(Math.random() * 899999999999)).slice(0, 12);
  beforeEach(async () => {
    await admin.doc("runtime/trust").set({ requireVerification: false, upiSales: true });
  });

  test("is off unless switched on", async () => {
    await admin.doc("runtime/trust").set({ requireVerification: false });
    await expect(call(upi.createUpiUnlockOrder, await buyer())).rejects.toThrow(/UPI payments aren't available/);
  });

  test("each order gets its own amount (₹49.01–₹49.99), QR and UPI link to Paire's ID, reused until closed", async () => {
    const uid = await buyer();
    const first = await call(upi.createUpiUnlockOrder, uid);
    if (first.status !== "order") throw new Error("expected an order");
    expect(first.order.amountPaise).toBeGreaterThan(4900);
    expect(first.order.amountPaise).toBeLessThan(5000);
    expect(first.order.upiLink).toContain("pa=paire.in%40ybl");
    expect(first.order.upiLink).toContain(`am=${(first.order.amountPaise / 100).toFixed(2)}`);
    expect(first.order.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const again = await call(upi.createUpiUnlockOrder, uid);
    expect(again.status === "order" && again.order.orderId).toBe(first.order.orderId);
    await expect(call(upi.createUpiUnlockOrder, await buyer({ matched: false }))).rejects.toThrow(/mutual match/);
  });

  test("a UTR only marks the payment for review: nothing unlocks until a moderator approves", async () => {
    const uid = await buyer();
    const created = await call(upi.createUpiUnlockOrder, uid);
    if (created.status !== "order") throw new Error("expected an order");
    const { orderId } = created.order;
    await expect(call(upi.submitUpiPayment, uid, { orderId, utr: "12345" })).rejects.toThrow(/12 digits/);
    const reference = utr();
    expect((await call(upi.submitUpiPayment, uid, { orderId, utr: reference })).order.status).toBe("submitted");
    expect(await unlockOf(uid)).toBeUndefined();
    expect((await call(chat.getChatAccess, uid)).unlock).toMatchObject({ status: "pending", upiPending: true });
    // The same UTR can't be reused by anyone else.
    const other = await buyer();
    const theirs = await call(upi.createUpiUnlockOrder, other);
    if (theirs.status !== "order") throw new Error("expected an order");
    await expect(call(upi.submitUpiPayment, other, { orderId: theirs.order.orderId, utr: reference })).rejects.toThrow(/already been used/);
    await expect(call(upi.submitUpiPayment, other, { orderId, utr: utr() })).rejects.toThrow(/couldn't find/);
    // Only moderators review.
    await expect(call(upi.reviewUpiPayment, uid, { orderId, decision: "approve" })).rejects.toThrow(/Moderator access/);
    expect((await moderatorCall(upi.getUpiReviewQueue, "mod1", {})).items.map((item) => item.orderId)).toContain(orderId);
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId, decision: "approve" });
    expect(await unlockOf(uid)).toMatchObject({ status: "active", source: "upi", orderId, paymentId: `upi:${reference}` });
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: true });
    expect(await call(upi.createUpiUnlockOrder, uid)).toEqual({ status: "owned" });
    // A refund given by hand: revoke ends it.
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId, decision: "revoke" });
    expect(await unlockOf(uid)).toMatchObject({ status: "revoked" });
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: false });
  });

  test("Paire Plus by UPI: the plan's own amount, and approval starts the pass (revoke ends it)", async () => {
    const uid = await buyer({ matched: false });
    await expect(call(upi.createUpiUnlockOrder, uid, { plan: "forever" })).rejects.toThrow(/1-day, 7-day or 30-day/);
    const created = await call(upi.createUpiUnlockOrder, uid, { plan: "week" });
    if (created.status !== "order") throw new Error("expected an order");
    expect(created.order).toMatchObject({ kind: "plus", product: "Paire Plus · 7 days" });
    expect(created.order.amountPaise).toBeGreaterThan(9900);
    expect(created.order.amountPaise).toBeLessThan(10000);
    // A Plus order and an Unlimited Chat order are separate.
    const reference = utr();
    await call(upi.submitUpiPayment, uid, { orderId: created.order.orderId, utr: reference });
    expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt") ?? 0).toBeLessThan(Date.now());
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId: created.order.orderId, decision: "approve" });
    const order = (await admin.doc(`upiUnlockOrders/${created.order.orderId}`).get()).data()!;
    expect(order.expiresAt - order.startsAt).toBe(7 * 24 * 60 * 60 * 1000);
    expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt")).toBe(order.expiresAt);
    expect(await mirrorOf(uid)).toMatchObject({ premiumUntil: order.expiresAt });
    const extension = await call(upi.createUpiUnlockOrder, uid, { plan: "day" });
    if (extension.status !== "order") throw new Error("expected an extension order");
    await call(upi.submitUpiPayment, uid, { orderId: extension.order.orderId });
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId: extension.order.orderId, decision: "approve" });
    expect((await admin.doc(`upiUnlockOrders/${extension.order.orderId}`).get()).data()).toMatchObject({ startsAt: order.expiresAt, expiresAt: order.expiresAt + 86_400_000 });
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId: extension.order.orderId, decision: "revoke" });
    expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt")).toBe(order.expiresAt);
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId: created.order.orderId, decision: "revoke" });
    expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt")).toBe(0);
  });

  test("new Razorpay Plus sales can be switched off", async () => {
    await admin.doc("runtime/trust").set({ requireVerification: false, upiSales: true, razorpayPlusSales: false });
    await expect(call(createPlusOrder, await buyer(), { plan: "week" })).rejects.toThrow(/Card payments aren't available/);
  });

  test("\"I've paid\" works without a UTR; the moderator matches the exact amount", async () => {
    const uid = await buyer();
    const created = await call(upi.createUpiUnlockOrder, uid);
    if (created.status !== "order") throw new Error("expected an order");
    expect((await call(upi.submitUpiPayment, uid, { orderId: created.order.orderId })).order).toMatchObject({ status: "submitted", utr: null });
    expect(await unlockOf(uid)).toBeUndefined();
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId: created.order.orderId, decision: "approve" });
    expect(await unlockOf(uid)).toMatchObject({ status: "active", paymentId: `upi-order:${created.order.orderId}` });
  });

  test("a rejected payment unlocks nothing and frees its UTR", async () => {
    const uid = await buyer();
    const created = await call(upi.createUpiUnlockOrder, uid);
    if (created.status !== "order") throw new Error("expected an order");
    const reference = utr();
    await call(upi.submitUpiPayment, uid, { orderId: created.order.orderId, utr: reference });
    await moderatorCall(upi.reviewUpiPayment, "mod1", { orderId: created.order.orderId, decision: "reject" });
    expect(await unlockOf(uid)).toBeUndefined();
    expect((await admin.doc(`upiUtrs/${reference}`).get()).exists).toBe(false);
    await expect(moderatorCall(upi.reviewUpiPayment, "mod1", { orderId: created.order.orderId, decision: "approve" })).rejects.toThrow(/submitted/);
  });
});

describe("member admin", () => {
  const asModerator = <T,>(fn: { run: (request: any) => T }, data: unknown) => // eslint-disable-line @typescript-eslint/no-explicit-any
    fn.run({ data, auth: { uid: "mod1", token: { moderator: true } }, rawRequest: {}, acceptsStreaming: false });

  test("only moderators can see members; women and men are listed separately, with payments", async () => {
    const woman = await buyer();
    const man = await buyer();
    await admin.doc(`users/${woman}`).set({ gender: "woman", createdAt: Date.now(), photoUrls: ["https://example.com/w.jpg"] }, { merge: true });
    await admin.doc(`users/${man}`).set({ gender: "man", createdAt: Date.now() }, { merge: true });
    await expect(call(memberAdmin.adminListMembers, woman, { gender: "woman" })).rejects.toThrow(/Moderator access/);
    await expect(call(memberAdmin.adminGetMember, woman, { uid: man })).rejects.toThrow(/Moderator access/);
    const women = await asModerator(memberAdmin.adminListMembers, { gender: "woman" });
    const men = await asModerator(memberAdmin.adminListMembers, { gender: "man" });
    expect(women.members.map((member) => member.uid)).toContain(woman);
    expect(women.members.map((member) => member.uid)).not.toContain(man);
    expect(men.members.map((member) => member.uid)).toContain(man);
    await admin.doc(`upiUnlockOrders/ADMINTST`).set({ uid: woman, kind: "chat", amountPaise: 4937, status: "submitted", createdAt: Date.now() });
    const detail = await asModerator(memberAdmin.adminGetMember, { uid: woman });
    expect(detail.profile.photoUrls).toEqual(["https://example.com/w.jpg"]);
    expect(detail.payments).toContainEqual(expect.objectContaining({ source: "upi", product: "Unlimited Chat", amountInr: 49.37, status: "submitted" }));
  });
});

describe("Lifetime Plus", () => {
  const confirmLifetime = (uid: string, payment: FakePayment) => call(confirmPlusPayment, uid, { orderId: payment.order_id, paymentId: payment.id, signature: checkoutSignature(payment.order_id, payment.id) });
  const statusOf = async (uid: string) => {
    const { syncPremium } = await import("../src/billing");
    return syncPremium(uid);
  };

  test("₹1,499 lifetime checkout is reused, verified at the server price, permanent and protected from another purchase", async () => {
    const uid = await buyer(), other = await buyer();
    const created = await call(createPlusOrder, uid, { plan: "lifetime", amountPaise: 1, uid: other, lifetime: false });
    expect(created.amount).toBe(149900);
    expect((await call(createPlusOrder, uid, { plan: "lifetime" })).orderId).toBe(created.orderId);
    const payment = pay(created.orderId);
    await expect(confirmLifetime(other, payment)).rejects.toThrow(/find that order/);
    expect(await confirmLifetime(uid, payment)).toMatchObject({ active: true, lifetime: true, unlimitedLikes: true, expiresAt: null });
    expect((await admin.doc(`razorpayOrders/${created.orderId}`).get()).data()).toMatchObject({ uid, status: "paid", plan: "lifetime", expiresAt: null });
    expect(await mirrorOf(uid)).toMatchObject({ unlimited: true, premiumLifetime: true, premiumUntil: 0 });
    expect(await statusOf(uid)).toMatchObject({ active: true, lifetime: true, expiresAt: null });
    await confirmLifetime(uid, payment); await webhook("payment.captured", paymentEvent(payment));
    expect((await admin.doc(`webPassLedger/${uid}`).get()).get("until")).toBe(0);
    for (const plan of ["day", "week", "month", "lifetime"]) await expect(call(createPlusOrder, uid, { plan })).rejects.toThrow(/already have Lifetime Plus/);
    expect(await call(chat.createChatUnlockOrder, uid)).toEqual({ status: "owned" });
  });

  test("an authorised payment is pending, and wrong price or forged signatures never grant lifetime", async () => {
    const uid = await buyer(); const created = await call(createPlusOrder, uid, { plan: "lifetime" });
    const pending = pay(created.orderId, { status: "authorized" });
    expect(await confirmLifetime(uid, pending)).toMatchObject({ active: false, lifetime: false, pending: true });
    pending.status = "captured"; pending.amount = 149899;
    await expect(confirmLifetime(uid, pending)).rejects.toThrow(/doesn't match/);
    await expect(call(confirmPlusPayment, uid, { orderId: created.orderId, paymentId: pending.id, signature: "a".repeat(64) })).rejects.toThrow(/verify that payment/);
    expect((await statusOf(uid)).lifetime).toBe(false);
  });

  test("simultaneous lifetime captures grant once, refund the duplicate once, and don't revoke the original", async () => {
    const uid = await buyer(), first = await call(createPlusOrder, uid, { plan: "lifetime" });
    await admin.doc(`lifetimePlusCheckout/${uid}`).update({ updatedAt: Date.now() - 7 * 3600000 });
    const second = await call(createPlusOrder, uid, { plan: "lifetime" });
    expect(first.orderId).not.toBe(second.orderId);
    const payments = [pay(first.orderId), pay(second.orderId)], before = fake.refunds.length;
    expect(await Promise.all(payments.map(p => webhook("payment.captured", paymentEvent(p))))).toEqual([200, 200]);
    const records = await Promise.all([first, second].map(async o => (await admin.doc(`razorpayOrders/${o.orderId}`).get()).data()!));
    expect(records.map(r => r.status).sort()).toEqual(["duplicate", "paid"]);
    expect(fake.refunds.length - before).toBe(1); expect(fake.refunds.at(-1)?.amount).toBe(149900);
    const duplicate = payments[records.findIndex(r => r.status === "duplicate")];
    await webhook("payment.captured", paymentEvent(duplicate));
    await webhook("refund.processed", { refund: { entity: { payment_id: duplicate.id } } });
    expect((await statusOf(uid)).lifetime).toBe(true); expect(fake.refunds.length - before).toBe(1);
  });

  test("a second captured attempt is refunded without ending the original lifetime entitlement", async () => {
    const uid = await buyer(), created = await call(createPlusOrder, uid, { plan: "lifetime" });
    const original = pay(created.orderId); await confirmLifetime(uid, original);
    const extra = pay(created.orderId), before = fake.refunds.length;
    await webhook("payment.captured", paymentEvent(extra));
    expect(fake.refunds.length - before).toBe(1);
    await webhook("refund.processed", { refund: { entity: { payment_id: extra.id } }, ...paymentEvent(extra) });
    expect((await admin.doc(`razorpayOrders/${created.orderId}`).get()).get("status")).toBe("paid");
    expect((await statusOf(uid)).lifetime).toBe(true);
  });

  test("a lifetime refund or lost chargeback restores any remaining monthly entitlement", async () => {
    for (const event of ["refund.processed", "payment.dispute.lost"]) {
      const uid = await buyer(), month = await call(createPlusOrder, uid, { plan: "month" });
      await confirmLifetime(uid, pay(month.orderId));
      const until = (await admin.doc(`billing/${uid}`).get()).get("expiresAt");
      const life = await call(createPlusOrder, uid, { plan: "lifetime" }), p = pay(life.orderId); await confirmLifetime(uid, p);
      expect((await statusOf(uid)).expiresAt).toBeNull();
      await webhook(event, event === "refund.processed" ? { refund: { entity: { payment_id: p.id } } } : { dispute: { entity: { payment_id: p.id } } });
      expect(await statusOf(uid)).toMatchObject({ active: true, lifetime: false, unlimitedLikes: true, expiresAt: until });
      expect(await mirrorOf(uid)).toMatchObject({ unlimited: false, premiumLifetime: false, premiumUntil: until });
    }
  });

  test("an owner lifetime gift survives refresh and unrelated refunds, and blocks redundant chat payments", async () => {
    const uid = await buyer(), chatOrder = await checkout(uid), old = await call(createPlusOrder, uid, { plan: "day" });
    const earlier = pay(old.orderId); await confirmLifetime(uid, earlier);
    await admin.doc(`lifetimePlusGrants/${uid}`).set({ status: "active", startsAt: Date.now(), amountReportedPaise: 0, source: "owner-gift" });
    await statusOf(uid); await webhook("refund.processed", { refund: { entity: { payment_id: earlier.id } } });
    expect(await statusOf(uid)).toMatchObject({ active: true, lifetime: true, unlimitedLikes: true, expiresAt: null });
    const p = pay(chatOrder), before = fake.refunds.length;
    await webhook("payment.captured", paymentEvent(p));
    expect((await admin.doc(`chatUnlockOrders/${chatOrder}`).get()).get("status")).toBe("duplicate");
    expect(fake.refunds.length - before).toBe(1); expect((await statusOf(uid)).lifetime).toBe(true);
    expect((await admin.doc(`chatUnlocks/${uid}`).get()).exists).toBe(false);
  });
});
