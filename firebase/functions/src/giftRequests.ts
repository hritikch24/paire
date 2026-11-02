import { createHash, randomUUID } from "crypto";
import { Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { REGION } from "./config";
import { billingEnabled, webPassBenefits } from "./billing";
import { chatPolicy } from "./chatEntitlement";
import { requireAuth, requireReadAuth } from "./lib/auth";
import { isGiftPlan } from "./lib/gifts";
import { isMatchId } from "./lib/giftPayments";
import { pairId } from "./lib/ids";
import { dailyLimitRef } from "./quota";
import { requireVerifiedUsers } from "./trust";
import { sendPushToUser } from "./push";
import { WEB_PUSH_SECRETS } from "./webPush";

const WEEK = 7 * 86_400_000;
export const giftRequestKey = (matchId: string, uid: string) => createHash("sha256").update(JSON.stringify([matchId, uid])).digest("hex").slice(0, 32);
const matchInput = (data: unknown) => { const id = (data as { matchId?: unknown })?.matchId; if (!isMatchId(id)) throw new HttpsError("invalid-argument", "Open a matched chat first."); return id; };
async function pair(uid: string, matchId: string, tx?: Transaction) {
  const read = (path: string) => tx ? tx.get(db.doc(path)) : db.doc(path).get();
  const match = await read(`matches/${matchId}`), members = match.get("participants");
  if (!match.exists || match.get("active") === false || match.get("kind") === "duo" || !Array.isArray(members) || members.length !== 2 || !members.includes(uid)) throw new HttpsError("not-found", "This chat is not available.");
  const other = members.find((id: unknown) => typeof id === "string" && id !== uid) as string | undefined;
  if (!other || pairId(uid, other) !== matchId) throw new HttpsError("not-found", "This chat is not available.");
  const [blocked, blockedBy, mine, theirs, me, them] = await Promise.all([read(`blocks/${uid}/blocked/${other}`), read(`blocks/${other}/blocked/${uid}`), read(`moderation/${uid}`), read(`moderation/${other}`), read(`users/${uid}`), read(`users/${other}`)]);
  if (blocked.exists || blockedBy.exists || [mine, theirs].some(snap => ["hidden", "banned"].includes(snap.get("status")))) throw new HttpsError("not-found", "Gift requests are not available in this chat.");
  if ((mine.get("cohort") ?? "public") !== (theirs.get("cohort") ?? "public") || [me, them].some(snap => !snap.exists || !(snap.get("age") >= 18 && snap.get("age") <= 100))) throw new HttpsError("not-found", "Gift requests are not available in this chat.");
  return { other, match };
}
const view = (id: string, data: Record<string, unknown>, now = Date.now()) => ({ id, version: String(data.version), fromUid: String(data.fromUid), toUid: String(data.toUid), plan: data.plan, status: data.status === "pending" && Number(data.expiresAt) <= now ? "expired" : data.status, createdAt: Number(data.createdAt), expiresAt: Number(data.expiresAt) });

/** Structured, voluntary request only. No custom message or payment is sent. */
export const requestPlusGift = onCall({ region: REGION, secrets: WEB_PUSH_SECRETS }, async request => {
  const uid = requireAuth(request), matchId = matchInput(request.data), plan = request.data?.plan;
  if (!isGiftPlan(plan)) throw new HttpsError("invalid-argument", "Choose 1 day, 7 days or the 60-day monthly gift.");
  if (!billingEnabled() || !(await chatPolicy()).giftSales) throw new HttpsError("failed-precondition", "Gift requests are not open yet. No request was sent.", { reason: "sales-off" });
  const result = await db.runTransaction(async tx => {
    const { other, match } = await pair(uid, matchId, tx);
    await requireVerifiedUsers([uid, other], tx);
    if ((await webPassBenefits(uid, Date.now(), tx)).lifetime) throw new HttpsError("failed-precondition", "You already have Lifetime Plus.");
    if (match.get("firstMoveBy") && match.get("firstMoveBy") !== uid && !match.get("firstMessageAt")) throw new HttpsError("failed-precondition", "Wait for your match to start the chat first.");
    const settings = await tx.get(db.doc(`users/${other}/private/settings`));
    if (settings.get("allowGiftRequests") === false) throw new HttpsError("failed-precondition", "This member does not accept gift requests.");
    const ref = db.doc(`giftRequests/${giftRequestKey(matchId, uid)}`), quota = dailyLimitRef(uid);
    const [previous, limits] = await tx.getAll(ref, quota); const now = Date.now();
    if (previous.exists && previous.get("status") === "pending" && previous.get("expiresAt") > now && previous.get("plan") === plan) return { created: false, other, row: view(ref.id, previous.data()!) };
    if (previous.exists && now - Number(previous.get("createdAt")) < WEEK) throw new HttpsError("resource-exhausted", "Wait 7 days before asking this person again. Respect their answer.");
    const count = Number(limits.get("giftRequests") || 0); if (count >= 3) throw new HttpsError("resource-exhausted", "You can send at most 3 gift requests a day.");
    const data = { version: randomUUID(), matchId, fromUid: uid, toUid: other, plan, status: "pending", createdAt: now, expiresAt: now + WEEK };
    tx.set(ref, data); tx.set(quota, { giftRequests: count + 1 }, { merge: true });
    return { created: true, other, row: view(ref.id, data) };
  });
  if (result.created) await sendPushToUser(result.other, { kind: "matches", title: "Optional Plus gift request", body: "Open your Paire chat to review it. You can say no.", data: { type: "message", matchId }, tag: `gift-request-${result.row.id}` }).catch(() => logger.warn("Gift request saved; notification unavailable"));
  return result.row;
});

export const getPlusGiftRequests = onCall({ region: REGION }, async request => {
  const uid = await requireReadAuth(request), matchId = matchInput(request.data), { other } = await pair(uid, matchId);
  const [rows, settings, policy] = await Promise.all([db.getAll(...[uid, other].map(id => db.doc(`giftRequests/${giftRequestKey(matchId, id)}`))), db.doc(`users/${other}/private/settings`).get(), chatPolicy()]);
  return { enabled: billingEnabled() && policy.giftSales && settings.get("allowGiftRequests") !== false, requests: rows.filter(row => row.exists && isGiftPlan(row.get("plan"))).map(row => view(row.id, row.data()!)) };
});

/** A refusal or withdrawal is always allowed, including when sales or the match ended. */
export const closePlusGiftRequest = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request); const { id, version, action } = request.data ?? {};
  if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id) || typeof version !== "string" || !["decline", "withdraw"].includes(action)) throw new HttpsError("invalid-argument", "Refresh this request and try again.");
  await db.runTransaction(async tx => {
    const ref = db.doc(`giftRequests/${id}`), row = await tx.get(ref);
    if (!row.exists || row.get("version") !== version) throw new HttpsError("not-found", "This request changed. Refresh the chat.");
    if (row.get(action === "decline" ? "toUid" : "fromUid") !== uid) throw new HttpsError("permission-denied", "This request is not yours to change.");
    if (row.get("status") === "pending") tx.update(ref, { status: action === "decline" ? "declined" : "withdrawn", closedAt: Date.now() });
  });
  return { closed: true };
});
