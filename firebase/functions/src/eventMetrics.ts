// Acquisition diagnostics are separate from authentication and billing totals.
// Count the first outcome per attributed account, including duplicate trigger deliveries.
import { FieldValue } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";

const expiry = () => new Date(Date.now() + 30 * 86400000);
const day = () => new Date().toISOString().slice(0, 10);
const counter = (campaign: string) =>
  db.collection("eventFunnelDaily").doc(day() + "_" + campaign);

export async function countPreview(
  session: string,
  campaign: unknown,
  eventId: string,
) {
  if (!/^[a-f0-9-]{36}$/.test(session)) return;
  const source =
    typeof campaign === "string" && /^[a-z0-9_-]{1,64}$/i.test(campaign)
      ? campaign
      : "direct";
  const ref = db.collection("eventPreviewSessions").doc(session);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    tx.create(ref, {
      eventId,
      campaign: source,
      createdAt: Date.now(),
      expireAt: expiry(),
    });
    tx.set(
      counter(source),
      { preview: FieldValue.increment(1) },
      { merge: true },
    );
  });
}

export const attributeEventVisit = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuth(request);
    const session = request.data?.session;
    if (typeof session !== "string" || !/^[a-f0-9-]{36}$/.test(session))
      throw new HttpsError("invalid-argument", "Invalid preview session.");
    const created = Date.parse(
      (await adminAuth().getUser(uid)).metadata.creationTime,
    );
    const ref = db.collection("eventAttribution").doc(uid);
    const ticket = db.collection("eventPreviewSessions").doc(session);
    await db.runTransaction(async (tx) => {
      const [preview, prior] = await tx.getAll(ticket, ref);
      if (
        !preview.exists ||
        preview.get("eventId") !== request.data.id ||
        preview.get("claimed") ||
        prior.exists ||
        preview.get("expireAt").toMillis() <= Date.now()
      )
        return;
      const campaign = preview.get("campaign");
      tx.update(ticket, { claimed: true });
      tx.create(ref, { campaign, expireAt: expiry() });
      if (created >= preview.get("createdAt"))
        tx.set(
          counter(campaign),
          { registration: FieldValue.increment(1) },
          { merge: true },
        );
    });
    return { ok: true };
  },
);

async function record(uid: unknown, stage: string) {
  if (typeof uid !== "string" || !uid || uid.includes("/")) return;
  const ref = db.collection("eventAttribution").doc(uid);
  await db.runTransaction(async (tx) => {
    const state = await tx.get(ref);
    if (
      !state.exists ||
      state.get(stage) ||
      state.get("expireAt").toMillis() <= Date.now()
    )
      return;
    tx.update(ref, { [stage]: true });
    tx.set(
      counter(state.get("campaign")),
      { [stage]: FieldValue.increment(1) },
      { merge: true },
    );
  });
}
export const countEventJoin = onDocumentCreated(
  { region: REGION, document: "eventRooms/{id}/eventParticipants/{uid}" },
  (e) => record(e.params.uid, "participation"),
);
export const countEventMatch = onDocumentCreated(
  { region: REGION, document: "matches/{id}" },
  async (e) => {
    if (e.data?.get("source") === "event")
      await Promise.all(
        e.data
          .get("participants")
          .map((uid: string) => record(uid, "mutualMatch")),
      );
  },
);
export const countEventFirstSend = onDocumentCreated(
  { region: REGION, document: "matches/{id}/messages/{message}" },
  (e) => record(e.data?.get("senderId"), "firstSend"),
);
function paymentMetric(collection: string, confirmedStatus = "paid") {
  return onDocumentWritten(
    { region: REGION, document: collection + "/{order}" },
    async (e) => {
      const order = e.data?.after;
      if (!order?.exists || order.get("mode") === "test") return;
      const uid = order.get("uid") ?? order.get("fromUid");
      if (!e.data?.before.exists) await record(uid, "checkout");
      if (order.get("status") === confirmedStatus)
        await record(uid, "confirmedPurchase");
    },
  );
}
export const countEventPlusPayment = paymentMetric("razorpayOrders");
export const countEventChatPayment = paymentMetric("chatUnlockOrders");
export const countEventGiftPayment = paymentMetric("giftOrders");

export const countEventCcavenuePayment = paymentMetric("ccavenueOrders");
export const countEventUpiPayment = paymentMetric(
  "upiUnlockOrders",
  "approved",
);
