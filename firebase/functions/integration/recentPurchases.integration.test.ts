import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { adminGetRecentPremiumBuyers } from "../src/adminPurchases";
import { getMetrics } from "../src/metrics";
import { readRevenueMetrics } from "../src/revenue";

const db = getFirestore(), auth = getAuth();
const prefix = `recent_${Date.now()}`, owner = `${prefix}_owner`, first = `${prefix}_first`, second = `${prefix}_second`;
const claims = { moderator: true, supportAccess: true };
const refs: FirebaseFirestore.DocumentReference[] = [];
const call = (uid?: string, token: Record<string, unknown> = claims) => adminGetRecentPremiumBuyers.run({ data: {}, ...(uid ? { auth: { uid, token } } : {}), rawRequest: {}, acceptsStreaming: false } as never);
const put = async (path: string, data: Record<string, unknown>) => { const ref = db.doc(path); refs.push(ref); await ref.set(data); };
beforeAll(async () => {
  for (const uid of [owner, first, second]) await auth.createUser({ uid, email: `${uid}@example.com`, emailVerified: true });
  await auth.setCustomUserClaims(owner, claims);
  await put(`supportOperators/${owner}`, { enabled: true });
});
afterAll(async () => {
  await Promise.all(refs.map(ref => ref.delete()));
  await Promise.all([owner, first, second].map(uid => auth.deleteUser(uid)));
});

test("consistent revenue snapshot and owner report include confirmed payments once, with original timestamps and private identities", async () => {
  const now = Date.now(), before = await readRevenueMetrics(now, new Set());
  await put(`users/${first}`, { displayName: "Fictional recent buyer", createdAt: now });
  const order = { uid: first, currency: "INR", mode: "live", kind: "plus", status: "paid", amountPaise: 9900, paidAt: now - 3600000 };
  await put(`razorpayOrders/${prefix}_week`, order);
  await put(`upiUnlockOrders/${prefix}_day`, { ...order, status: "approved", amountPaise: 2000, reviewedAt: Timestamp.fromMillis(now - 7200000) });
  await put(`ccavenueOrders/${prefix}_month`, { ...order, uid: second, status: "created", amountPaise: 29900 });
  await put(`ccavenueOrders/${prefix}_alias`, { ...order, uid: second, status: "created", amountPaise: 29900 });
  const receipt = { uid: second, action: "payment-received", kind: "plus", orderSource: "ccavenue", confirmationSource: "owner_statement", status: "confirmed", currency: "INR", amountReportedPaise: 29900, coveredOrderIds: [`${prefix}_month`, `${prefix}_alias`], createdAt: now - 10800000 };
  await put(`billingSupportAudit/${prefix}_receipt`, receipt);
  await put(`billingSupportAudit/${prefix}_duplicate`, { ...receipt, createdAt: now - 1000 });
  const after = await readRevenueMetrics(now, new Set());
  expect(after.premium24h.orders - before.premium24h.orders).toBe(3);
  expect(after.premium24h.buyers - before.premium24h.buyers).toBe(2);
  expect(after.premium24h.rupees - before.premium24h.rupees).toBeCloseTo(418);
  const report = await call(owner);
  expect(report.members.find(member => member.uid === first)).toMatchObject({ name: "Fictional recent buyer", email: `${first}@example.com`, orders: 2, amountInr: 119 });
  expect(report.members.find(member => member.uid === second)).toMatchObject({ orders: 1, amountInr: 299, payments: [expect.objectContaining({ at: receipt.createdAt, confirmation: "Owner confirmed" })] });
  const metrics = await getMetrics.run({ data: { key: "admin" }, rawRequest: {}, acceptsStreaming: false } as never);
  expect(metrics.premium24h).toMatchObject({ orders: report.orders, buyers: report.buyers, rupees: report.rupees });
  expect(Object.keys(metrics.premium24h as object).sort()).toEqual(["buyers", "manualOrders", "orders", "rupees", "unassignedOrders", "windowEnd", "windowStart"].sort());
  expect(JSON.stringify(metrics)).not.toContain(`${first}@example.com`);
  expect((await db.doc(`billing/${first}`).get()).exists).toBe(false);
});

test("buyer identities require enabled owner access and live claims, even with a stale or forged token", async () => {
  await expect(call()).rejects.toMatchObject({ code: "unauthenticated" });
  await expect(call(first, {})).rejects.toMatchObject({ code: "permission-denied" });
  await expect(call(first, { moderator: true })).rejects.toMatchObject({ code: "permission-denied" });
  await expect(call(first)).rejects.toMatchObject({ code: "permission-denied" });
  await db.doc(`supportOperators/${owner}`).update({ enabled: false });
  await expect(call(owner)).rejects.toMatchObject({ code: "permission-denied" });
  await db.doc(`supportOperators/${owner}`).update({ enabled: true });
  await auth.setCustomUserClaims(owner, {});
  await expect(call(owner)).rejects.toMatchObject({ code: "permission-denied" });
});
