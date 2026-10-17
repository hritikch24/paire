/**
 * CCAvenue payments (Unlimited Chat and Paire Plus), run in-process against the
 * Firestore emulator with a fake CCAvenue *test* API (no network, no real
 * money). Covers what decides whether a payment buys anything: the server's
 * price, the status API as the only source of truth, forged responses, wrong
 * amounts, pending payments, duplicates, refunds and test money.
 *
 * A real CCAvenue sandbox run still needs test credentials; see docs/ccavenue.md.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ccavenueDecrypt, ccavenueEncrypt } from "../src/lib/ccavenue";

const WORKING_KEY = "SANDBOXWORKINGKEY000000000000000";
process.env.MUSE_CCAVENUE_ENABLED = "true";
process.env.CCAVENUE_ENV = "test";
process.env.CCAVENUE_MERCHANT_ID = "123456";
process.env.CCAVENUE_ACCESS_CODE = "AVSANDBOXCODE";
process.env.CCAVENUE_WORKING_KEY = WORKING_KEY;
process.env.MUSE_BILLING_SANDBOX = "true";
process.env.MUSE_BILLING_ENABLED = "true";
process.env.MUSE_UNCACHED_RUNTIME = "true";
process.env.GCLOUD_PROJECT = "demo-muse";
delete process.env.MUSE_CCAVENUE_LIVE;
delete process.env.FUNCTIONS_EMULATOR;

if (!getApps().length) initializeApp({ projectId: "demo-muse" });
const admin = getFirestore();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cc = require("../src/ccavenue") as typeof import("../src/ccavenue");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chat = require("../src/chatAccess") as typeof import("../src/chatAccess");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const billing = require("../src/billing") as typeof import("../src/billing");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const upi = require("../src/upiPayments") as typeof import("../src/upiPayments");

const API = "https://apitest.ccavenue.com/apis/servlet/DoWebTrans";
type FakeOrder = { order_no: string; reference_no: string; order_status: string; order_amt: number; order_currncy: string };
const fake = { orders: new Map<string, FakeOrder>(), refunds: [] as Array<{ reference_no: string; refund_amount: string }>, calls: 0 };
let tracking = 300000000000;

/** CCAvenue's API in the test environment, as far as the server uses it. */
async function fakeCcavenue(url: string, init?: Parameters<typeof fetch>[1]): Promise<Response> {
  if (url !== API) return new Response("not faked", { status: 404 });
  fake.calls += 1;
  const form = new URLSearchParams(String(init?.body));
  const reply = (payload: unknown) => new Response(`status=0&enc_response=${ccavenueEncrypt(JSON.stringify(payload), WORKING_KEY)}`, { status: 200 });
  if (form.get("access_code") !== process.env.CCAVENUE_ACCESS_CODE) return new Response("status=1&enc_response=Access code invalid", { status: 200 });
  const request = JSON.parse(ccavenueDecrypt(form.get("enc_request")!, WORKING_KEY));
  if (form.get("command") === "orderStatusTracker") {
    const order = fake.orders.get(request.order_no);
    return order ? reply({ Order_Status_Result: { ...order, status: 0 } }) : new Response("status=1&enc_response=No records found", { status: 200 });
  }
  if (form.get("command") === "refundOrder") {
    fake.refunds.push(request);
    const order = [...fake.orders.values()].find((item) => item.reference_no === request.reference_no);
    if (order) order.order_status = "Refunded";
    return reply({ Refund_Order_Result: { refund_status: 0 } });
  }
  return new Response("status=1&enc_response=Unknown command", { status: 200 });
}

const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = (async (input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => fakeCcavenue(String(input), init)) as typeof fetch;
});
afterAll(async () => {
  global.fetch = realFetch;
  await admin.doc("runtime/trust").set({ requireVerification: false });
});
beforeEach(async () => {
  await admin.doc("runtime/trust").set({ requireVerification: false, ccavenueSales: true });
  process.env.CCAVENUE_ENV = "test";
});

/** The member pays on CCAvenue's page: CCAvenue records the order with this status. */
function pay(orderId: string, overrides: Partial<FakeOrder> = {}): FakeOrder {
  tracking += 1;
  const order: FakeOrder = { order_no: orderId, reference_no: String(tracking), order_status: "Shipped", order_amt: 49.0, order_currncy: "INR", ...overrides };
  fake.orders.set(orderId, order);
  return order;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = <T,>(fn: { run: (request: any) => T }, uid: string, data: unknown = {}) =>
  fn.run({ data, auth: { uid, token: { email: `${uid}@example.com`, email_verified: true } }, rawRequest: {}, acceptsStreaming: false });

/** CCAvenue form-POSTs the browser to ccavenueResponse; resolves with where the browser is sent. */
function respond(body: Record<string, string>, method = "POST"): Promise<{ status: number; location: string }> {
  return new Promise((resolve) => {
    const request = { method, body, headers: {}, get: () => undefined, header: () => undefined };
    const response = { redirect: (status: number, location: string) => resolve({ status, location }), setHeader: () => undefined, getHeader: () => undefined, on: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (cc.ccavenueResponse as any)(request, response);
  });
}
const encResp = (orderId: string, status = "Success", key = WORKING_KEY) => ccavenueEncrypt(`order_id=${orderId}&order_status=${status}&amount=49.00`, key);

let counter = 0;
async function buyer(options: { matched?: boolean; cohort?: string; status?: string } = {}): Promise<string> {
  counter += 1;
  const uid = `ccbuyer${counter}_${Date.now()}`;
  await admin.doc(`users/${uid}`).set({ uid, displayName: `Buyer ${counter}`, photoUrls: [], onboardingComplete: true });
  await admin.doc(`moderation/${uid}`).set({ status: options.status ?? "ok", emailVerified: true, cohort: options.cohort ?? "test" });
  if (options.matched !== false) await admin.doc(`matches/${uid}_zz`).set({ participants: [uid, "zz"], active: true, kind: "pair" });
  return uid;
}
const unlockOf = async (uid: string) => (await admin.doc(`chatUnlocks/${uid}`).get()).data();
const orderOf = async (orderId: string) => (await admin.doc(`ccavenueOrders/${orderId}`).get()).data();

async function start(uid: string, data: unknown = {}): Promise<{ orderId: string; plain: URLSearchParams; url: string; accessCode: string }> {
  const result = await call(cc.createCcavenueOrder, uid, data);
  if (result.status !== "redirect") throw new Error(`expected a redirect, got ${result.status}`);
  return { ...result.redirect, plain: new URLSearchParams(ccavenueDecrypt(result.redirect.encRequest, WORKING_KEY)) };
}

describe("CCAvenue orders", () => {
  test("the server sets the product, price and account, and the request is encrypted for CCAvenue", async () => {
    const uid = await buyer();
    const { orderId, plain, url, accessCode } = await start(uid, { amount: 1, uid: "someone-else", currency: "USD" });
    expect(url).toBe("https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction");
    expect(accessCode).toBe("AVSANDBOXCODE");
    expect(Object.fromEntries(plain)).toMatchObject({
      merchant_id: "123456",
      order_id: orderId,
      amount: "49.00",
      currency: "INR",
      redirect_url: "https://www.paire.in/pay/ccavenue/",
      billing_email: `${uid}@example.com`
    });
    expect(plain.get("merchant_param1")).not.toContain(uid);
    expect(await orderOf(orderId)).toMatchObject({ uid, kind: "chat", amountPaise: 4900, currency: "INR", mode: "test", status: "created" });
  });

  test("offered only while sales are on, after a match, to accounts in good standing, never with test money for real accounts", async () => {
    await expect(call(cc.createCcavenueOrder, await buyer({ matched: false }))).rejects.toThrow(/mutual match/);
    await expect(call(cc.createCcavenueOrder, await buyer({ status: "banned" }))).rejects.toThrow(/unavailable/);
    await expect(call(cc.createCcavenueOrder, await buyer({ cohort: "public" }))).rejects.toThrow(/test accounts/);
    await admin.doc("runtime/trust").set({ requireVerification: false, ccavenueSales: false });
    await expect(call(cc.createCcavenueOrder, await buyer())).rejects.toThrow(/aren't available/);
  });

  test("live keys can't sell until production is explicitly approved", async () => {
    process.env.CCAVENUE_ENV = "live";
    await expect(call(cc.createCcavenueOrder, await buyer())).rejects.toThrow(/aren't available/);
  });

  test("the chat offer lists CCAvenue as a way to pay", async () => {
    const access = await chat.chatAccessStatus(await buyer());
    expect(access.unlock).toMatchObject({ status: "available", methods: expect.arrayContaining(["ccavenue"]) });
  });
});

describe("settling a payment", () => {
  test("a paid order unlocks chat once CCAvenue's API confirms it, and the browser returns with only the order id", async () => {
    const uid = await buyer();
    const { orderId } = await start(uid);
    const paid = pay(orderId);
    const back = await respond({ encResp: encResp(orderId), orderNo: orderId });
    expect(back).toEqual({ status: 303, location: `https://www.paire.in/app/?ccavenue=${orderId}` });
    expect(await unlockOf(uid)).toMatchObject({ status: "active", orderId, source: "ccavenue", paymentId: `ccavenue:${paid.reference_no}`, amountPaise: 4900, mode: "test" });
    expect((await admin.doc(`moderation/${uid}`).get()).get("chatAccess")).toMatchObject({ unlimited: true });
    expect(await orderOf(orderId)).toMatchObject({ status: "paid", trackingId: paid.reference_no });
    // The app's own check and a second tab: harmless, never a second order.
    expect(await call(cc.confirmCcavenueOrder, uid, { orderId })).toMatchObject({ status: "paid", kind: "chat" });
    expect(await call(cc.createCcavenueOrder, uid)).toEqual({ status: "owned" });
  });

  test("a forged or replayed 'Success' response unlocks nothing: only the status API counts", async () => {
    const uid = await buyer();
    const { orderId } = await start(uid);
    // Never reached CCAvenue, or abandoned: the response claims success anyway.
    await respond({ encResp: encResp(orderId, "Success", "ATTACKERSOWNKEY"), orderNo: orderId });
    await respond({ encResp: encResp(orderId) });
    expect(await unlockOf(uid)).toBeUndefined();
    pay(orderId, { order_status: "Aborted" });
    await respond({ encResp: encResp(orderId) });
    expect(await unlockOf(uid)).toBeUndefined();
    expect(await orderOf(orderId)).toMatchObject({ status: "failed" });
  });

  test("other people's orders and wrong amounts unlock nothing", async () => {
    const uid = await buyer();
    const thief = await buyer();
    const { orderId } = await start(uid);
    pay(orderId, { order_amt: 1 });
    await expect(call(cc.confirmCcavenueOrder, thief, { orderId })).rejects.toThrow(/couldn't find/);
    expect(await call(cc.confirmCcavenueOrder, uid, { orderId })).toMatchObject({ status: "mismatch" });
    expect(await unlockOf(uid)).toBeUndefined();
    expect(await unlockOf(thief)).toBeUndefined();
    await expect(call(cc.confirmCcavenueOrder, uid, { orderId: "../../etc" })).rejects.toThrow(/isn't valid/);
  });

  test("a payment the bank is still confirming shows as pending, then unlocks", async () => {
    const uid = await buyer();
    const { orderId } = await start(uid);
    const order = pay(orderId, { order_status: "Awaited" });
    expect(await call(cc.confirmCcavenueOrder, uid, {})).toMatchObject({ status: "pending" });
    expect((await chat.chatAccessStatus(uid)).unlock).toMatchObject({ status: "pending", ccavenuePending: true });
    // A second tab doesn't take a second payment while this one settles.
    expect(await call(cc.createCcavenueOrder, uid)).toEqual({ status: "pending" });
    order.order_status = "Successful";
    expect(await call(cc.confirmCcavenueOrder, uid, { kind: "chat" })).toMatchObject({ status: "paid" });
    expect(await unlockOf(uid)).toMatchObject({ status: "active", orderId });
  });

  test("a second payment for an account that already owns it is refunded automatically", async () => {
    const uid = await buyer();
    const first = await start(uid);
    // Two tabs both opened the payment page before either paid.
    await admin.doc(`ccavenueOrders/${first.orderId}`).update({ createdAt: Date.now() - 7 * 60 * 60_000 });
    const second = await start(uid);
    pay(first.orderId);
    const extra = pay(second.orderId);
    await call(cc.confirmCcavenueOrder, uid, { orderId: first.orderId });
    expect(await call(cc.confirmCcavenueOrder, uid, { orderId: second.orderId })).toMatchObject({ status: "paid", refunding: true });
    expect(await orderOf(second.orderId)).toMatchObject({ status: "duplicate", refundReason: "already-owned" });
    expect(fake.refunds).toContainEqual(expect.objectContaining({ reference_no: extra.reference_no, refund_amount: "49.00" }));
    expect(await unlockOf(uid)).toMatchObject({ orderId: first.orderId });
  });

  test("a refund or chargeback ends the unlock it paid for", async () => {
    const uid = await buyer();
    const { orderId } = await start(uid);
    const order = pay(orderId);
    await call(cc.confirmCcavenueOrder, uid, { orderId });
    order.order_status = "Chargeback";
    expect(await call(cc.confirmCcavenueOrder, uid, { orderId })).toMatchObject({ status: "refunded" });
    expect(await unlockOf(uid)).toMatchObject({ status: "revoked", revokedReason: "chargeback" });
    expect(await orderOf(orderId)).toMatchObject({ status: "chargeback" });
    expect((await admin.doc(`moderation/${uid}`).get()).get("chatAccess")).toMatchObject({ unlimited: false });
  });

  test("a test payment for a real account is rejected, not granted", async () => {
    const real = await buyer({ cohort: "public" });
    await admin.doc("ccavenueOrders/PAFORGEDTEST0001").set({ uid: real, kind: "chat", product: "paire_unlimited_chat", amountPaise: 4900, currency: "INR", mode: "test", status: "created", createdAt: Date.now() });
    pay("PAFORGEDTEST0001");
    await respond({ encResp: encResp("PAFORGEDTEST0001") });
    expect(await unlockOf(real)).toBeUndefined();
    expect(await orderOf("PAFORGEDTEST0001")).toMatchObject({ status: "rejected" });
  });
});

describe("CCAvenue replaces direct UPI", () => {
  test("while CCAvenue sells, new direct-UPI orders aren't offered, but a submitted one is still confirmed", async () => {
    const previousVpa = process.env.MUSE_UPI_VPA;
    process.env.MUSE_UPI_VPA = "paire.in@ybl";
    try {
      const waiting = await buyer();
      await admin.doc("runtime/trust").set({ requireVerification: false, upiSales: true, ccavenueSales: false });
      const created = await call(upi.createUpiUnlockOrder, waiting);
      if (created.status !== "order") throw new Error("expected a UPI order");
      await call(upi.submitUpiPayment, waiting, { orderId: created.order.orderId });

      await admin.doc("runtime/trust").set({ requireVerification: false, upiSales: true, ccavenueSales: true });
      const fresh = await buyer();
      expect((await chat.chatAccessStatus(fresh)).unlock.methods).toEqual(["ccavenue"]);
      await expect(call(upi.createUpiUnlockOrder, fresh)).rejects.toThrow(/aren't available/);
      expect(await call(billing.getPremiumStatus, fresh)).toMatchObject({ upiPurchaseAvailable: false, ccavenuePurchaseAvailable: true });
      expect((await chat.chatAccessStatus(waiting)).unlock).toMatchObject({ status: "pending", upiPending: true });
    } finally {
      if (previousVpa === undefined) delete process.env.MUSE_UPI_VPA;
      else process.env.MUSE_UPI_VPA = previousVpa;
    }
  });
});

describe("Paire Plus through CCAvenue", () => {
  test("a paid pass starts once confirmed, at the server's price, and ends with a refund", async () => {
    const uid = await buyer();
    expect(await call(billing.getPremiumStatus, uid)).toMatchObject({ active: false, ccavenuePurchaseAvailable: true });
    const { orderId, plain } = await start(uid, { plan: "week" });
    expect(plain.get("amount")).toBe("99.00");
    const order = pay(orderId, { order_amt: 99 });
    await respond({ encResp: encResp(orderId) });
    const saved = (await orderOf(orderId))!;
    expect(saved).toMatchObject({ kind: "plus", plan: "week", status: "paid" });
    expect(saved.expiresAt - saved.startsAt).toBe(7 * 24 * 60 * 60 * 1000);
    expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt")).toBe(saved.expiresAt);
    await expect(call(cc.createCcavenueOrder, uid, { plan: "day" })).rejects.toThrow(/already active/);
    order.order_status = "Refunded";
    await call(cc.confirmCcavenueOrder, uid, { orderId });
    expect((await admin.doc(`billing/${uid}`).get()).get("expiresAt")).toBe(0);
  });

  test("Plus can't be bought while billing is off", async () => {
    process.env.MUSE_BILLING_ENABLED = "false";
    try {
      await expect(call(cc.createCcavenueOrder, await buyer(), { plan: "week" })).rejects.toThrow(/aren't available/);
    } finally {
      process.env.MUSE_BILLING_ENABLED = "true";
    }
  });
});
