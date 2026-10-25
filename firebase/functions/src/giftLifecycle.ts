import { FieldPath, FieldValue, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./admin";
import { syncPremium, webPassBenefits } from "./billing";
import { REGION } from "./config";
import { refundGiftPayment, retryStuckOrderRefunds } from "./giftRefunds";
import { requireAuth } from "./lib/auth";
import { giftAcceptedPushCopy, giftClaimVerdict, GiftClaimVerdict, giftReversal, giftSweepVerdict, giftWindow, REFUND_CLAIM_MS } from "./lib/giftLifecycle";
import { giftDays, giftState, GiftPlan, GiftStateName, isGiftPlan } from "./lib/gifts";
import { isRazorpayId } from "./lib/razorpay";
import { sendPushToUser } from "./push";
import { consumeDailyQuota } from "./quota";
import { WEB_PUSH_SECRETS } from "./webPush";

/**
 * A gift after payment (giftPayments.ts creates gifts/{orderId} as "pending").
 *
 * - claimGift: the recipient accepts. The pass is added through the existing
 *   complimentaryPlusGrants/{uid} source (webPassBenefits already takes its
 *   expiry), starting when their current access ends, then syncPremium updates
 *   billing/{uid} and the chat gate's mirror. Nothing in billing is edited.
 * - declineGift: the recipient says no; the gifter is refunded.
 * - expireGifts (daily): a gift unclaimed after 7 days expires; one that can no
 *   longer be delivered (match ended, recipient gone or banned) is void. Both are refunded.
 * - reverseGift: Razorpay refunded the payment or the gifter won a dispute (from
 *   razorpayGiftWebhook). An unclaimed gift is marked refunded; a claimed one is
 *   taken back only while the grant still ends where this gift put it, otherwise
 *   it is flagged needsReview. A purchased pass is never changed.
 *
 * None of this depends on runtime/trust.giftSales: a gift already paid for can
 * always be claimed, declined or refunded.
 *
 * Privacy: both members can read gifts/{id}, so it holds only what both may see
 * (fromUid, toUid, matchId, plan, status, createdAt, expiresAt, claimedAt). Every
 * piece of bookkeeping (the claimed window, the recipient's previous grant, review
 * and reversal fields, refundDue, refundAttemptAt) lives on the server-only
 * giftOrders/{id} record; endsAt is shown only to the recipient.
 *
 * Refunds after a gift ends unused are claimed in a transaction: the order gets
 * refundDue in the same write that ends the gift, and refundAttemptAt when a
 * worker takes the refund; the sweep retries any refundDue left by a crash.
 */

const LIST_LIMIT = 50;
/** Gifts read per side before sorting (no composite index needed; members get far fewer). */
const LIST_SCAN = 500;
const LISTS_PER_DAY = 500;
const SWEEP_PAGE = 200;
const SWEEP_PAGES = 10;
const SWEEP_CHUNK = 10;
const ENDED_UNUSED = ["declined", "expired", "void"];

/** gifts/{id}: what both members may read. */
type GiftDoc = {
  fromUid: string;
  toUid: string;
  matchId: string;
  plan: GiftPlan;
  status: string;
  createdAt: number;
  expiresAt: number;
  claimedAt?: number;
};

const finite = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function giftIdFrom(data: unknown): string {
  const giftId = (data as { giftId?: unknown } | null)?.giftId;
  if (!isRazorpayId(giftId, "order")) throw new HttpsError("invalid-argument", "Choose a gift.");
  return giftId;
}

/**
 * Refunds a gift that ended unused (declined, expired or void), at most once.
 * The order's refundAttemptAt is the claim: a second worker within two minutes
 * leaves it alone, and anything already refunded only clears refundDue.
 */
export async function refundEndedGift(giftId: string): Promise<boolean> {
  const giftRef = db.doc(`gifts/${giftId}`), orderRef = db.doc(`giftOrders/${giftId}`);
  const claim = await db.runTransaction(async (tx) => {
    const [gift, order] = await tx.getAll(giftRef, orderRef);
    if (!order.exists || order.get("refundDue") !== true) return null;
    const paymentId = order.get("paymentId");
    const refundedIds = (order.get("refundedPaymentIds") as unknown[] | undefined) ?? [];
    const settled = !gift.exists || !ENDED_UNUSED.includes(gift.get("status")) || typeof paymentId !== "string" || order.get("status") !== "paid"
      || Boolean(order.get("refundId")) || Boolean(order.get("refundError")) || refundedIds.includes(paymentId);
    if (settled) {
      tx.update(orderRef, { refundDue: FieldValue.delete() });
      return null;
    }
    const now = Date.now();
    if (now - finite(order.get("refundAttemptAt")) < REFUND_CLAIM_MS) return null;
    tx.update(orderRef, { refundAttemptAt: now });
    return { paymentId: paymentId as string, amountPaise: order.get("amountPaise") as number, reason: gift.get("status") as string };
  });
  if (!claim) return false;
  await refundGiftPayment(giftId, claim.paymentId, claim.amountPaise, claim.reason);
  await orderRef.update({ refundDue: FieldValue.delete() });
  return true;
}

/** Tells the gifter their gift was accepted. A push failure never fails the claim. */
async function notifyGifter(giftId: string, gift: GiftDoc): Promise<void> {
  try {
    const [settings, match] = await db.getAll(db.doc(`users/${gift.fromUid}/private/settings`), db.doc(`matches/${gift.matchId}`));
    const profiles = match.get("profiles") as Record<string, { displayName?: unknown } | undefined> | undefined;
    const copy = giftAcceptedPushCopy(settings.get("notifications.previews"), profiles?.[gift.toUid]?.displayName);
    await sendPushToUser(gift.fromUid, { kind: "matches", ...copy, data: { type: "gift", matchId: gift.matchId, giftId }, tag: `gift-accepted-${giftId}` });
  } catch (error) {
    logger.warn("Gift accepted push failed", { giftId, error: String(error) });
  }
}

const CLAIM_REFUSED: Record<Exclude<GiftClaimVerdict, "ok" | "already-claimed">, () => HttpsError> = {
  "not-found": () => new HttpsError("not-found", "We couldn't find that gift."),
  "not-recipient": () => new HttpsError("permission-denied", "Only the person this gift is for can accept it."),
  closed: () => new HttpsError("failed-precondition", "This gift can't be accepted any more.", { reason: "closed" }),
  expired: () => new HttpsError("failed-precondition", "This gift expired, so it's been refunded to the sender.", { reason: "expired" }),
  "no-match": () => new HttpsError("failed-precondition", "You're no longer matched, so this gift has been refunded to the sender.", { reason: "no-match" }),
  unavailable: () => new HttpsError("failed-precondition", "This gift can't be accepted on this account, so it's been refunded to the sender.", { reason: "unavailable" }),
  lifetime: () => new HttpsError("failed-precondition", "You already have Lifetime Plus, so you don't need this pass. It's been refunded to the sender.", { reason: "already-lifetime" })
};

export const claimGift = onCall({ region: REGION, secrets: ["RAZORPAY_KEY_SECRET", "REVENUECAT_SECRET_KEY", ...WEB_PUSH_SECRETS], timeoutSeconds: 30 }, async (request): Promise<{ status: "claimed"; endsAt: number }> => {
  const uid = requireAuth(request);
  const giftId = giftIdFrom(request.data);
  const giftRef = db.doc(`gifts/${giftId}`), orderRef = db.doc(`giftOrders/${giftId}`);
  const compRef = db.doc(`complimentaryPlusGrants/${uid}`);
  const outcome = await db.runTransaction(async (tx): Promise<{ verdict: GiftClaimVerdict; endsAt?: number; gift?: GiftDoc }> => {
    const snap = await tx.get(giftRef);
    const gift = snap.data() as GiftDoc | undefined;
    // Nothing about the gift (or anyone's access) is read for someone it isn't for.
    if (!snap.exists || !gift) return { verdict: "not-found" };
    if (gift.toUid !== uid) return { verdict: "not-recipient" };
    const [order, match, user, moderation, billing, ledger, comp] = await tx.getAll(
      orderRef,
      db.doc(`matches/${gift.matchId}`),
      db.doc(`users/${uid}`),
      db.doc(`moderation/${uid}`),
      db.doc(`billing/${uid}`),
      db.doc(`webPassLedger/${uid}`),
      compRef
    );
    // Every gift is created from its order; without one there is nothing to claim.
    if (!order.exists) return { verdict: "closed" };
    const now = Date.now();
    const benefits = await webPassBenefits(uid, now, tx);
    const participants = (match.get("participants") as unknown[] | undefined)?.filter((p): p is string => typeof p === "string") ?? [];
    const verdict = giftClaimVerdict({
      exists: true,
      callerUid: uid,
      gift,
      match: match.exists ? { active: match.get("active") !== false, participants } : undefined,
      recipientBanned: !user.exists || moderation.get("status") === "banned",
      lifetime: benefits.lifetime || billing.get("lifetime") === true,
      now
    });
    if (verdict === "already-claimed") return { verdict, endsAt: finite(order.get("endsAt")) };
    if (verdict === "expired" || verdict === "no-match" || verdict === "unavailable" || verdict === "lifetime") {
      // Ended unused: refunded right after this transaction (and by the sweep if that never runs).
      tx.update(giftRef, { status: verdict === "expired" ? "expired" : "void" });
      tx.update(orderRef, { giftEndedAt: now, giftEndReason: verdict, refundDue: true });
      return { verdict };
    }
    if (verdict !== "ok") return { verdict };
    const window = giftWindow({
      now,
      // Every running pass: the cached total (store passes included), the web pass queue and the web sources.
      billingExpiresAt: Math.max(finite(billing.get("expiresAt")), finite(ledger.get("until")), benefits.expiresAt),
      complimentaryExpiresAt: comp.get("status") === "active" ? finite(comp.get("expiresAt")) : 0,
      days: giftDays(gift.plan)
    });
    tx.set(compRef, { status: "active", expiresAt: window.endsAt, updatedAt: now, lastSource: "gift", lastGiftId: giftId }, { merge: true });
    tx.update(giftRef, { status: "claimed", claimedAt: now });
    tx.update(orderRef, {
      claimedAt: now,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      // What the reversal restores, if the payment is ever refunded (server-only: it shows
      // what the recipient had before, which the gifter must never see).
      previousCompExpiry: finite(comp.get("expiresAt")),
      previousCompStatus: comp.exists && typeof comp.get("status") === "string" ? comp.get("status") : null,
      previousCompLastGiftId: typeof comp.get("lastGiftId") === "string" ? comp.get("lastGiftId") : null
    });
    return { verdict, endsAt: window.endsAt, gift };
  });

  if (outcome.verdict === "already-claimed") return { status: "claimed", endsAt: finite(outcome.endsAt) };
  if (outcome.verdict === "ok" && outcome.gift && typeof outcome.endsAt === "number") {
    try {
      // billing/{uid} and moderation/{uid}.chatAccess (the paid-chat gate) follow the new grant.
      await syncPremium(uid);
    } catch (error) {
      // The grant is saved; the next premium check recomputes the cache.
      logger.error("Gift claimed but premium sync failed", { giftId, error: String(error) });
    }
    await notifyGifter(giftId, outcome.gift);
    return { status: "claimed", endsAt: outcome.endsAt };
  }
  if (outcome.verdict === "expired" || outcome.verdict === "no-match" || outcome.verdict === "unavailable" || outcome.verdict === "lifetime") {
    await refundEndedGift(giftId);
  }
  throw CLAIM_REFUSED[outcome.verdict as keyof typeof CLAIM_REFUSED]();
});

export const declineGift = onCall({ region: REGION, secrets: ["RAZORPAY_KEY_SECRET"], timeoutSeconds: 30 }, async (request): Promise<{ status: "declined" }> => {
  const uid = requireAuth(request);
  const giftId = giftIdFrom(request.data);
  const giftRef = db.doc(`gifts/${giftId}`), orderRef = db.doc(`giftOrders/${giftId}`);
  const verdict = await db.runTransaction(async (tx) => {
    const [gift, order] = await tx.getAll(giftRef, orderRef);
    if (!gift.exists) return "not-found" as const;
    if (gift.get("toUid") !== uid) return "not-recipient" as const;
    if (gift.get("status") === "declined") return "declined" as const;
    if (gift.get("status") !== "pending") return "closed" as const;
    tx.update(giftRef, { status: "declined" });
    if (order.exists) tx.update(orderRef, { giftEndedAt: Date.now(), giftEndReason: "declined", refundDue: true });
    return "declined" as const;
  });
  if (verdict === "not-found") throw new HttpsError("not-found", "We couldn't find that gift.");
  if (verdict === "not-recipient") throw new HttpsError("permission-denied", "Only the person this gift is for can decline it.");
  if (verdict === "closed") throw new HttpsError("failed-precondition", "This gift can't be declined any more.", { reason: "closed" });
  // A repeat (or a retry after a crash) only refunds if no refund is on record yet.
  await refundEndedGift(giftId);
  return { status: "declined" };
});

export type GiftView = { id: string; plan: GiftPlan; status: GiftStateName; counterpartName: string; createdAt: number; expiresAt: number; endsAt?: number };

/** The member's most recent gifts, received and sent. Names come from the match (or the profile), never an email. */
export const listGifts = onCall({ region: REGION, timeoutSeconds: 30 }, async (request): Promise<{ received: GiftView[]; sent: GiftView[] }> => {
  const uid = requireAuth(request);
  await consumeDailyQuota(uid, "giftLists", LISTS_PER_DAY);
  const [receivedSnap, sentSnap] = await Promise.all(["toUid", "fromUid"].map((field) => db.collection("gifts").where(field, "==", uid).limit(LIST_SCAN).get()));
  const recent = (docs: QueryDocumentSnapshot[]) => docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as GiftDoc) }))
    .filter((gift) => isGiftPlan(gift.plan))
    .sort((a, b) => finite(b.createdAt) - finite(a.createdAt) || (a.id < b.id ? 1 : -1))
    .slice(0, LIST_LIMIT);
  const received = recent(receivedSnap.docs), sent = recent(sentSnap.docs);
  // When a claimed gift ends is shown to the recipient only (read from the server-only order).
  const claimedIds = received.filter((gift) => gift.status === "claimed").map((gift) => gift.id);
  const orders = claimedIds.length ? await db.getAll(...claimedIds.map((id) => db.doc(`giftOrders/${id}`))) : [];
  const endsAtOf = new Map(orders.map((order) => [order.id, order.get("endsAt")]));
  const counterpart = (gift: GiftDoc) => (gift.toUid === uid ? gift.fromUid : gift.toUid);
  const all = [...received, ...sent];

  const matchIds = [...new Set(all.map((gift) => gift.matchId).filter((id) => typeof id === "string" && id.length > 0))];
  const matches = matchIds.length ? await db.getAll(...matchIds.map((id) => db.doc(`matches/${id}`))) : [];
  const snippet = new Map(matches.map((match) => [match.id, match.get("profiles") as Record<string, { displayName?: unknown } | undefined> | undefined]));
  const nameFromMatch = (gift: GiftDoc) => {
    const name = snippet.get(gift.matchId)?.[counterpart(gift)]?.displayName;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  };
  const missing = [...new Set(all.filter((gift) => !nameFromMatch(gift)).map(counterpart))];
  const profiles = missing.length ? await db.getAll(...missing.map((id) => db.doc(`users/${id}`))) : [];
  const profileName = new Map(profiles.map((profile) => [profile.id, profile.get("displayName")]));
  const nameOf = (gift: GiftDoc) => {
    const fromProfile = profileName.get(counterpart(gift));
    return nameFromMatch(gift) ?? (typeof fromProfile === "string" && fromProfile.trim() ? fromProfile.trim() : "A Paire member");
  };

  const now = Date.now();
  const view = (gift: GiftDoc & { id: string }, side: "received" | "sent"): GiftView => {
    const status = giftState({ status: gift.status, expiresAt: finite(gift.expiresAt) }, now);
    const endsAt = side === "received" && status === "claimed" ? endsAtOf.get(gift.id) : undefined;
    return {
      id: gift.id,
      plan: gift.plan,
      status,
      counterpartName: nameOf(gift).slice(0, 80),
      createdAt: finite(gift.createdAt),
      expiresAt: finite(gift.expiresAt),
      ...(typeof endsAt === "number" ? { endsAt } : {})
    };
  };
  return { received: received.map((gift) => view(gift, "received")), sent: sent.map((gift) => view(gift, "sent")) };
});

/** Ends one pending gift if it's overdue or can no longer be delivered; true when it ended. */
async function sweepGift(giftId: string, now: number): Promise<boolean> {
  const giftRef = db.doc(`gifts/${giftId}`);
  const ended = await db.runTransaction(async (tx) => {
    const gift = await tx.get(giftRef);
    if (!gift.exists || gift.get("status") !== "pending") return false;
    const toUid = String(gift.get("toUid"));
    const [match, user, moderation, order] = await tx.getAll(db.doc(`matches/${gift.get("matchId")}`), db.doc(`users/${toUid}`), db.doc(`moderation/${toUid}`), db.doc(`giftOrders/${giftId}`));
    if (!order.exists) return false;
    const verdict = giftSweepVerdict({
      status: gift.get("status"),
      expiresAt: gift.get("expiresAt"),
      now,
      matchActive: match.exists && match.get("active") !== false,
      recipientExists: user.exists,
      recipientBanned: moderation.get("status") === "banned"
    });
    if (verdict === "keep") return false;
    const endReason = verdict === "expire" ? "expired" : !match.exists || match.get("active") === false ? "no-match" : "unavailable";
    tx.update(giftRef, { status: verdict === "expire" ? "expired" : "void" });
    tx.update(order.ref, { giftEndedAt: Date.now(), giftEndReason: endReason, refundDue: true });
    return true;
  });
  if (ended) await refundEndedGift(giftId);
  return ended;
}

/**
 * The daily sweep, in bounded pages. Safe to run twice: a gift only ends once
 * (in a transaction) and each refund is claimed. Also retries refunds a crash left behind.
 */
export async function runGiftExpiry(now = Date.now()): Promise<{ ended: number; retried: number }> {
  let ended = 0, retried = 0;
  let last: QueryDocumentSnapshot | undefined;
  for (let page = 0; page < SWEEP_PAGES; page += 1) {
    let query = db.collection("gifts").where("status", "==", "pending").orderBy(FieldPath.documentId()).limit(SWEEP_PAGE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    for (let i = 0; i < snap.docs.length; i += SWEEP_CHUNK) {
      const results = await Promise.all(snap.docs.slice(i, i + SWEEP_CHUNK).map((doc) => sweepGift(doc.id, now).catch((error) => {
        logger.error("Gift sweep failed for a gift", { giftId: doc.id, error: String(error) });
        return false;
      })));
      ended += results.filter(Boolean).length;
    }
    if (snap.size < SWEEP_PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  const due = await db.collection("giftOrders").where("refundDue", "==", true).limit(SWEEP_PAGE).get();
  for (const doc of due.docs) {
    if (await refundEndedGift(doc.id).catch(() => false)) retried += 1;
  }
  // Orphaned or rejected payments whose refund never ran (a crash after the capture's transaction).
  retried += await retryStuckOrderRefunds(now).catch((error) => {
    logger.error("Gift order refund sweep failed", { error: String(error) });
    return 0;
  });
  if (ended || retried) logger.info("Gift sweep", { ended, retried });
  return { ended, retried };
}

export const expireGifts = onSchedule({ region: REGION, schedule: "15 4 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540, maxInstances: 1, retryCount: 0, secrets: ["RAZORPAY_KEY_SECRET"] }, async () => {
  await runGiftExpiry(Date.now());
});

/**
 * Settles a gift whose payment Razorpay refunded (reason "refund") or whose
 * dispute the gifter won ("chargeback"). Called by razorpayGiftWebhook for the
 * gift's own payment, in one transaction (reads first). Never touches a
 * purchased pass, and never refunds anything itself. The bookkeeping it reads and
 * writes is on the server-only order; the gift only changes status.
 */
export async function reverseGift(orderId: string, reason: "refund" | "chargeback"): Promise<void> {
  const giftRef = db.doc(`gifts/${orderId}`), orderRef = db.doc(`giftOrders/${orderId}`);
  const result = await db.runTransaction(async (tx) => {
    const [gift, order] = await tx.getAll(giftRef, orderRef);
    if (!gift.exists || !order.exists) return null;
    const toUid = String(gift.get("toUid"));
    const compRef = db.doc(`complimentaryPlusGrants/${toUid}`);
    const [comp, user] = await tx.getAll(compRef, db.doc(`users/${toUid}`));
    const now = Date.now();
    // A repeat of the event after a restore: redo the premium sync (idempotent), in case it failed last time.
    if (gift.get("status") === "refunded" && order.get("revokedAt")) return { sync: user.exists ? toUid : null, review: false };
    const record = {
      id: orderId,
      status: gift.get("status"),
      endsAt: order.get("endsAt"),
      needsReview: order.get("needsReview"),
      previousCompExpiry: order.get("previousCompExpiry"),
      previousCompStatus: order.get("previousCompStatus"),
      previousCompLastGiftId: order.get("previousCompLastGiftId")
    };
    let plan = giftReversal(record, comp.exists ? comp.data() : undefined);
    // A recipient whose account is gone has nothing left to take back.
    if (plan.action === "review" && gift.get("status") === "claimed" && !user.exists) plan = { action: "refund-pending" };
    if (plan.action === "none") return null;
    const settled = order.get("status") !== "refunded" ? { status: "refunded", refundedAt: now } : {};
    const updatedAt = FieldValue.serverTimestamp();
    switch (plan.action) {
      case "refund-pending":
        tx.update(giftRef, { status: "refunded" });
        tx.update(orderRef, { ...settled, reversalReason: reason, updatedAt });
        return null;
      case "close":
        // Our own refund of a declined, expired or void gift, reported back: nothing to undo.
        if (Object.keys(settled).length) tx.update(orderRef, { ...settled, updatedAt });
        return null;
      case "restore":
        tx.set(compRef, {
          status: plan.status,
          expiresAt: plan.expiresAt,
          updatedAt: now,
          lastSource: "gift-reversal",
          lastGiftId: plan.lastGiftId ?? FieldValue.delete()
        }, { merge: true });
        tx.update(giftRef, { status: "refunded" });
        tx.update(orderRef, { ...settled, revokedAt: now, reversalReason: reason, updatedAt });
        return { sync: user.exists ? toUid : null, review: false };
      case "review":
        tx.update(orderRef, { ...settled, needsReview: true, needsReviewReason: reason, needsReviewAt: now, updatedAt });
        return { sync: null, review: true };
    }
  });
  if (result?.sync) await syncPremium(result.sync);
  if (result?.review) logger.warn("Gift payment reversed after the gift was used and its grant changed since; needs review", { giftId: orderId, reason });
}
