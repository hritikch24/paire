import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) initializeApp({ projectId: "demo-muse" });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readRevenue } = require("../src/revenue") as typeof import("../src/revenue");
const db = getFirestore();

test("retained financial receipts count after account deletion and reconcile with gateway statuses once", async () => {
  const baseline = await readRevenue();
  const uid = `revenue_${Date.now()}`;
  const order = db.doc(`ccavenueOrders/${uid}`);
  const audit = db.doc(`billingSupportAudit/${uid}`);
  const duplicate = db.doc(`billingSupportAudit/${uid}_duplicate`);
  const data = { uid, action: "payment-received", status: "confirmed", confirmationSource: "owner_statement", amountReportedPaise: 9900, currency: "INR", kind: "plus", orderSource: "ccavenue", coveredOrderIds: [uid] };
  try {
    await order.set({ uid, status: "created", amountPaise: 9900, currency: "INR", kind: "plus", mode: "live" });
    await audit.set(data);
    await duplicate.set(data);
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);
    expect((await db.doc(`billing/${uid}`).get()).exists).toBe(false);
    expect((await readRevenue()).plus).toEqual({ orders: baseline.plus.orders + 1, rupees: baseline.plus.rupees + 99, manualOrders: baseline.plus.manualOrders + 1, manualRupees: baseline.plus.manualRupees + 99 });
    await order.update({ status: "paid" });
    expect((await readRevenue()).plus).toEqual({ orders: baseline.plus.orders + 1, rupees: baseline.plus.rupees + 99, manualOrders: baseline.plus.manualOrders, manualRupees: baseline.plus.manualRupees });
    await order.update({ status: "refunded" });
    expect((await readRevenue()).plus).toEqual(baseline.plus);
  } finally {
    await Promise.all([order.delete(), audit.delete(), duplicate.delete()]);
  }
});
