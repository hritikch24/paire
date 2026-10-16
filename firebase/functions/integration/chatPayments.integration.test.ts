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
delete process.env.FUNCTIONS_EMULATOR;

if (!getApps().length) initializeApp({ projectId: "demo-muse" });
const admin = getFirestore();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chat = require("../src/chatAccess") as typeof import("../src/chatAccess");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { razorpayWebhook } = require("../src/razorpay") as typeof import("../src/razorpay");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncChatAccess } = require("../src/chatEntitlement") as typeof import("../src/chatEntitlement");

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
  await admin.doc(`users/${uid}`).set({ uid, displayName: `Buyer ${counter}`, photoUrls: [], onboardingComplete: true });
  await admin.doc(`moderation/${uid}`).set({ status: options.status ?? "ok", emailVerified: true, cohort: options.cohort ?? "test" });
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

describe("Unlimited Chat orders", () => {
  test("the server sets the product and price and binds the order to the caller", async () => {
    const uid = await buyer();
    const result = await call(chat.createChatUnlockOrder, uid, { amount: 1, currency: "USD", uid: "someone-else", product: "plus" });
    expect(result.status).toBe("checkout");
    if (result.status !== "checkout") return;
    expect(result.checkout).toMatchObject({ amount: 5000, currency: "INR", name: "Paire", description: "Paire Unlimited Chat · one-time ₹50 unlock" });
    expect(fake.orders.get(result.checkout.orderId)).toMatchObject({ amount: 5000, currency: "INR", notes: { product: "paire_unlimited_chat", uid } });
    expect((await admin.doc(`chatUnlockOrders/${result.checkout.orderId}`).get()).data()).toMatchObject({ uid, amountPaise: 5000, currency: "INR", mode: "test", status: "created" });
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
    await admin.doc("chatUnlockOrders/order_ForgedTest01").set({ uid: real, product: "paire_unlimited_chat", amountPaise: 5000, currency: "INR", mode: "test", status: "created" });
    fake.orders.set("order_ForgedTest01", { id: "order_ForgedTest01", amount: 5000, currency: "INR", status: "created", notes: {} });
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
  test("a verified ₹50 capture unlocks chat for this account only, everywhere, and is never sold twice", async () => {
    const uid = await buyer();
    const other = await buyer();
    const orderId = await checkout(uid);
    const payment = pay(orderId);
    const result = await call(chat.confirmChatUnlock, uid, { orderId, paymentId: payment.id, signature: checkoutSignature(orderId, payment.id) });
    expect(result.status).toBe("owned");
    expect(result.access).toMatchObject({ canSend: true, unlimited: true, unlock: { status: "owned" } });
    expect(await unlockOf(uid)).toMatchObject({ status: "active", orderId, paymentId: payment.id, amountPaise: 5000, currency: "INR", product: "paire_unlimited_chat", mode: "test" });
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
    expect(fake.refunds).toContainEqual({ paymentId: loser.id, amount: 5000 });
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
    expect(fake.refunds).toContainEqual({ paymentId: second.id, amount: 5000 });
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
    // A new Plus pass, then the ₹50 is refunded: Plus stays.
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
    payment.amount_refunded = 5000;
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
    expect(fake.refunds).toContainEqual({ paymentId: payment.id, amount: 5000 });

    const banned = await buyer();
    const paid = pay(await checkout(banned));
    await admin.doc(`moderation/${banned}`).update({ status: "banned" });
    await webhook("payment.captured", paymentEvent(paid));
    expect((await admin.doc(`moderation/${banned}`).get()).get("status")).toBe("banned");
  });
});
