import { createHash } from "crypto";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { requireReadAuth, isSupportSession } from "./lib/auth";
import { parsePasses, sameSecret, validRevenueCatSignature } from "./lib/billing";
import { chatPolicy, syncChatAccess, upiSalesOpen } from "./chatEntitlement";
import { consumeDailyQuota } from "./quota";
import { verifiedUsers } from "./trust";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
/** Paid features switch on only with MUSE_BILLING_ENABLED=true (after live QA). */
export const billingEnabled = () => process.env.MUSE_BILLING_ENABLED === "true";
/** Play/App Store passes through RevenueCat. */
const nativeBillingEnabled = () =>
  billingEnabled() && Boolean(process.env.REVENUECAT_SECRET_KEY && process.env.REVENUECAT_SECRET_KEY !== "disabled");
/** Razorpay keys are present (payments already taken can always be confirmed). */
export const razorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID) && Boolean(process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_KEY_SECRET !== "disabled");
/** New web passes (UPI, cards, netbanking) can be sold. */
export const webBillingEnabled = () => billingEnabled() && razorpayConfigured();
/** New Razorpay Plus checkouts (runtime/trust.razorpayPlusSales can switch them off; old payments are still honoured). */
export const razorpayPlusOpen = async () => webBillingEnabled() && (await chatPolicy()).razorpayPlusSales;
/** Plus passes paid by UPI into Paire's own account, confirmed by a moderator. */
export const upiPlusOpen = async () => billingEnabled() && (await upiSalesOpen());

export type PremiumStatus = {
  active: boolean;
  expiresAt: number | null;
  /** Store checkout (Android/iOS app). */
  purchaseAvailable: boolean;
  /** Razorpay checkout (web). */
  webPurchaseAvailable: boolean;
  /** UPI straight to Paire (scan the QR or open a UPI app). */
  upiPurchaseAvailable: boolean;
  /** An earlier Razorpay checkout never went through (nothing was charged): say so, and offer UPI. */
  previousPaymentFailed?: boolean;
  purchaseBlockReason?: "verification-required";
};

/** Latest expiry among the member's store passes, recording transaction ownership. 0 when none. */
async function storePassExpiry(uid: string, now: number): Promise<number> {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}` }, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new HttpsError("unavailable", "We couldn’t confirm your pass. Please try again.");
  const passes = parsePasses(await response.json(), now, process.env.FUNCTIONS_EMULATOR === "true" && process.env.MUSE_BILLING_SANDBOX === "true")
    .filter((pass) => pass.expiresAt > now);
  return db.runTransaction(async (tx) => {
    const refs = passes.map((pass) => db.doc(`billingTransactions/${hash(`${pass.store}:${pass.transactionId}`)}`));
    const snaps = refs.length ? await tx.getAll(...refs) : [];
    const ownerHash = hash(uid);
    let latest = 0;
    passes.forEach((pass, index) => {
      if (snaps[index].exists && snaps[index].get("ownerHash") !== ownerHash) return;
      tx.set(refs[index], { ownerHash, expiresAt: pass.expiresAt });
      latest = Math.max(latest, pass.expiresAt);
    });
    return latest;
  });
}

/** The member's store pass expiry when store billing is on, else 0. Never throws. */
export async function storeExpiryIfEnabled(uid: string, now = Date.now()): Promise<number> {
  if (!nativeBillingEnabled()) return 0;
  return storePassExpiry(uid, now).catch(() => 0);
}

/** Latest expiry among the member's paid, unrefunded web passes. 0 when none. */
export async function webPassExpiry(uid: string, now = Date.now()): Promise<number> {
  const [paid, upi] = await Promise.all([
    db.collection("razorpayOrders").where("uid", "==", uid).where("status", "==", "paid").get(),
    // Plus passes paid by UPI and approved by a moderator (upiPayments.ts).
    db.collection("upiUnlockOrders").where("uid", "==", uid).where("status", "==", "approved").get()
  ]);
  return [...paid.docs, ...upi.docs.filter((doc) => doc.get("kind") === "plus")].reduce((latest, doc) => {
    const expiresAt = doc.get("expiresAt");
    return typeof expiresAt === "number" && expiresAt > now ? Math.max(latest, expiresAt) : latest;
  }, 0);
}

/**
 * Recomputes the member's pass from the store and from web payments and caches it
 * in billing/{uid}, which swipes read. Never trusts anything the client says.
 */
export async function syncPremium(uid: string): Promise<PremiumStatus> {
  const status = { purchaseAvailable: nativeBillingEnabled(), webPurchaseAvailable: await razorpayPlusOpen(), upiPurchaseAvailable: await upiPlusOpen() };
  if (!billingEnabled()) return { active: false, expiresAt: null, ...status };
  const now = Date.now();
  const [store, web] = await Promise.all([
    status.purchaseAvailable ? storePassExpiry(uid, now) : Promise.resolve(0),
    webPassExpiry(uid, now)
  ]);
  const expiresAt = Math.max(store, web);
  await db.doc(`billing/${uid}`).set({ expiresAt, checkedAt: now });
  // Plus includes unlimited messaging: keep the rules' copy current (never touches Unlimited Chat).
  await syncChatAccess(uid);
  return { active: expiresAt > now, expiresAt: expiresAt > now ? expiresAt : null, ...status };
}

/** Never accepts a client-supplied entitlement, price, receipt status or duration. */
export const getPremiumStatus = onCall({ region: REGION, secrets: ["REVENUECAT_SECRET_KEY", "RAZORPAY_KEY_SECRET"], timeoutSeconds: 30 }, async (request): Promise<PremiumStatus> => {
  const uid = await requireReadAuth(request);
  await consumeDailyQuota(isSupportSession(request) ? request.auth!.uid : uid, "billingChecks", 100);
  const cached = isSupportSession(request) ? await db.doc(`billing/${uid}`).get() : null;
  const expiresAt = billingEnabled() ? Number(cached?.get("expiresAt")) || 0 : 0;
  const status: PremiumStatus = cached
    ? { active: expiresAt > Date.now(), expiresAt: expiresAt > Date.now() ? expiresAt : null, purchaseAvailable: false, webPurchaseAvailable: false, upiPurchaseAvailable: false }
    : await syncPremium(uid);
  if (!status.active) {
    const orders = await db.collection("razorpayOrders").where("uid", "==", uid).limit(20).get();
    if (orders.docs.some((doc) => doc.get("status") === "created") && !orders.docs.some((doc) => doc.get("status") === "paid")) status.previousPaymentFailed = true;
  }
  if ((status.purchaseAvailable || status.webPurchaseAvailable || status.upiPurchaseAvailable) && !(await verifiedUsers([uid])).has(uid)) {
    return { ...status, purchaseAvailable: false, webPurchaseAvailable: false, upiPurchaseAvailable: false, purchaseBlockReason: "verification-required" };
  }
  return status;
});

/** Signed notifications trigger an authoritative API read, including refunds and transfers. */
export const revenueCatWebhook = onRequest({ region: REGION, secrets: ["REVENUECAT_SECRET_KEY", "REVENUECAT_WEBHOOK_AUTH", "REVENUECAT_WEBHOOK_SIGNING_SECRET"], timeoutSeconds: 60 }, async (request, response) => {
  if (request.method !== "POST") { response.sendStatus(405); return; }
  if (!sameSecret(request.get("authorization"), process.env.REVENUECAT_WEBHOOK_AUTH) ||
    !validRevenueCatSignature(request.rawBody, request.get("x-revenuecat-webhook-signature"), process.env.REVENUECAT_WEBHOOK_SIGNING_SECRET)) {
    response.sendStatus(401); return;
  }
  const event = request.body?.event;
  if (!event || typeof event.id !== "string") { response.sendStatus(400); return; }
  if (event.type === "TEST") { response.sendStatus(200); return; }
  const allowedSandbox = process.env.FUNCTIONS_EMULATOR === "true" && process.env.MUSE_BILLING_SANDBOX === "true";
  if (event.environment !== "PRODUCTION" && !(allowedSandbox && event.environment === "SANDBOX")) { response.sendStatus(200); return; }
  const uids = [...new Set([event.app_user_id, ...(Array.isArray(event.transferred_from) ? event.transferred_from : []), ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])])]
    .filter((uid): uid is string => typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !uid.includes("/") && !uid.startsWith("$RCAnonymousID:"));
  try {
    for (const uid of uids) {
      // Deleted/anonymous store customers must not recreate account data.
      if ((await db.doc(`users/${uid}`).get()).exists) await syncPremium(uid);
    }
    response.sendStatus(200);
  } catch { response.sendStatus(503); }
});
