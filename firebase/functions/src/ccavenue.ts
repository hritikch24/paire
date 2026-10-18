import { createHash } from "crypto";
import { DocumentSnapshot, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { billingEnabled, storeExpiryIfEnabled, syncPremium, webPassExpiry } from "./billing";
import { ccavenueSalesOpen, ccavenueSellingMode, syncChatAccess } from "./chatEntitlement";
import { CHAT_UNLOCK, REGION } from "./config";
import { requireAuth } from "./lib/auth";
import {
  CCAVENUE_HOSTS,
  ccavenueDecrypt,
  ccavenueEncrypt,
  ccavenueMode,
  CcavenueMode,
  ccavenueVerdict,
  CcavenueVerdict,
  checkoutRequestBody,
  isCcavenueOrderId,
  isTrackingId,
  newCcavenueOrderId,
  OrderStatus,
  parseApiResponse,
  parseRedirectResponse,
  returnUrl,
  rupees
} from "./lib/ccavenue";
import { isPlusPlan, passDays, passWindow, PLUS_PASSES, PlusPlan } from "./lib/razorpay";
import { consumeDailyQuota } from "./quota";
import { verifiedUsers } from "./trust";

/**
 * Unlimited Chat and Paire Plus paid through CCAvenue (cards, UPI, netbanking,
 * wallets) on the web. Off unless MUSE_CCAVENUE_ENABLED, the CCAvenue keys and
 * runtime/trust.ccavenueSales are all set (see docs/ccavenue.md).
 *
 * 1. createCcavenueOrder: the server sets the product and price, records
 *    ccavenueOrders/{orderId} and returns the encrypted request; the browser
 *    form-POSTs it to CCAvenue's payment page (a full-page redirect).
 * 2. CCAvenue form-POSTs the result to ccavenueResponse, which sends the
 *    browser back to the app with only the order id in the URL.
 * 3. Whatever the browser or that response says, access is granted only after
 *    CCAvenue's order status API (server to server, authenticated with the
 *    access code and working key) reports this exact order paid in full, in
 *    INR. ccavenueResponse, confirmCcavenueOrder and "Check payment status"
 *    all settle orders the same way, exactly once.
 *
 * ccavenueOrders is server-only (firestore.rules) and kept after account
 * deletion, like the other payment records.
 */

// syncPremium also reads store passes and the Razorpay switch, so those secrets are bound too.
const SECRETS = ["CCAVENUE_WORKING_KEY", "REVENUECAT_SECRET_KEY", "RAZORPAY_KEY_SECRET"];
const emulator = () => process.env.FUNCTIONS_EMULATOR === "true";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** An unpaid order is reused (never a second one) for this long, so two tabs can't pay twice. */
const OPEN_MS = 6 * 60 * 60_000;

type Kind = "chat" | "plus";
type Status = "created" | "paid" | "failed" | "refunded" | "chargeback" | "duplicate" | "orphaned" | "rejected";
type CcOrder = {
  uid: string;
  kind: Kind;
  plan?: PlusPlan;
  product: string;
  amountPaise: number;
  currency: "INR";
  mode: CcavenueMode;
  status: Status;
  trackingId?: string;
};

const workingKey = () => {
  const key = process.env.CCAVENUE_WORKING_KEY?.trim();
  return key && key !== "disabled" ? key : null;
};

/** The configured environment (orders from the other one are never confirmed with these keys). */
const configuredMode = () => ccavenueMode(process.env.CCAVENUE_ENV);

const appUrl = () => process.env.MUSE_APP_URL?.trim() || "https://www.paire.in/app/";

/**
 * Where CCAvenue sends the browser back to. CCAvenue only accepts the website its keys are
 * registered for (www.paire.in), so by default it's /pay/ccavenue/ on the app's own site,
 * which vercel.json forwards to this project's ccavenueResponse function.
 */
function responseUrl(): string {
  if (process.env.CCAVENUE_RESPONSE_URL?.trim()) return process.env.CCAVENUE_RESPONSE_URL.trim();
  if (emulator()) return `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT}/${REGION}/ccavenueResponse`;
  return new URL("/pay/ccavenue/", appUrl()).toString();
}

/** Test-mode money isn't real: outside the emulator it can only buy for shared test-cohort accounts. */
const testModeAllowedFor = (mode: CcavenueMode, cohort: unknown) => mode === "live" || emulator() || cohort === "test";

/** A call to CCAvenue's API with the server's own access code and working key. Null when CCAvenue has no such record. */
async function ccavenueApi(mode: CcavenueMode, command: "orderStatusTracker" | "refundOrder", payload: Record<string, string>): Promise<Record<string, unknown> | null> {
  const key = workingKey();
  if (!key) throw new HttpsError("failed-precondition", "Payments aren't available yet.");
  // A fake CCAvenue in the emulator's integration tests; never anywhere else.
  const url = (emulator() && process.env.CCAVENUE_API_URL) || CCAVENUE_HOSTS[mode].api;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      enc_request: ccavenueEncrypt(JSON.stringify(payload), key),
      access_code: process.env.CCAVENUE_ACCESS_CODE ?? "",
      command,
      request_type: "JSON",
      response_type: "JSON",
      version: "1.2"
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    logger.warn("CCAvenue API error", { command, status: response.status });
    throw new HttpsError("unavailable", "The payment service didn't respond. Please try again.");
  }
  try {
    return parseApiResponse(await response.text(), key);
  } catch (error) {
    logger.error("CCAvenue API response unreadable (check the working key and CCAVENUE_ENV)", { command, error: String(error) });
    throw new HttpsError("unavailable", "The payment service didn't respond. Please try again.");
  }
}

/** Money back for a payment that must not (or can no longer) buy anything. Failures are left on the order for support. */
async function refundOrder(orderId: string, order: CcOrder, trackingId: string | null, reason: string): Promise<void> {
  const ref = db.doc(`ccavenueOrders/${orderId}`);
  try {
    if (!trackingId) throw new Error("No CCAvenue tracking id.");
    const result = await ccavenueApi(order.mode, "refundOrder", { reference_no: trackingId, refund_amount: rupees(order.amountPaise), refund_ref_no: `R${orderId}` });
    if (!result || Number(result.refund_status) !== 0) throw new Error(String(result?.reason ?? "Refund refused."));
    await ref.update({ refundRequestedAt: Date.now(), refundReason: reason });
  } catch (error) {
    logger.error("CCAvenue refund failed", { orderId, reason, error: String(error) });
    await ref.update({ refundError: String(error).slice(0, 300), refundReason: reason });
  }
}

export type SettleResult = {
  /** paid: the member has what this order bought. */
  status: "paid" | "pending" | "failed" | "refunded" | "none" | "mismatch" | "unknown";
  kind: Kind | null;
  /** This payment is being returned (the member already owned it, or the account is gone). */
  refunding?: boolean;
};

/**
 * Asks CCAvenue what happened to an order and applies it, exactly once:
 * paid → Unlimited Chat or the Plus pass; refunded or charged back → it ends
 * (only what this order bought); failed → closed. Idempotent across the
 * redirect response, the app's confirmation and repeated checks.
 */
export async function settleCcavenueOrder(orderId: string): Promise<SettleResult> {
  const ref = db.doc(`ccavenueOrders/${orderId}`);
  const first = await ref.get();
  if (!first.exists) return { status: "unknown", kind: null };
  const order = first.data() as CcOrder;
  const kind = order.kind;
  if (order.mode !== configuredMode() || !workingKey()) {
    logger.warn("CCAvenue order from another environment", { orderId, mode: order.mode });
    return { status: order.status === "paid" ? "paid" : "unknown", kind };
  }
  const remote = (await ccavenueApi(order.mode, "orderStatusTracker", { order_no: orderId })) as OrderStatus | null;
  const verdict: CcavenueVerdict = ccavenueVerdict(remote, { orderId, amountPaise: order.amountPaise });
  const trackingId = isTrackingId(remote?.reference_no) ? String(remote!.reference_no) : null;
  const storeExpiry = kind === "plus" && verdict === "paid" && order.status === "created" ? await storeExpiryIfEnabled(order.uid) : 0;

  type Outcome = "granted" | "duplicate" | "orphaned" | "rejected" | "revoked" | "closed";
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    // Every read first (transactions can't read after writing).
    const [fresh, user, moderation, unlock, ledger] = await tx.getAll(
      ref,
      db.doc(`users/${order.uid}`),
      db.doc(`moderation/${order.uid}`),
      db.doc(`chatUnlocks/${order.uid}`),
      db.doc(`webPassLedger/${order.uid}`)
    );
    const status = fresh.get("status") as Status;
    const now = Date.now();
    const record = { ...(trackingId ? { trackingId } : {}), remoteStatus: String(remote?.order_status ?? "none").slice(0, 40), checkedAt: now, updatedAt: FieldValue.serverTimestamp() };

    if (verdict === "refunded" || verdict === "chargeback") {
      if (status !== "paid") {
        if (status === "created") tx.update(ref, { ...record, status: "failed" });
        return "closed";
      }
      tx.update(ref, { ...record, status: verdict, [verdict === "chargeback" ? "chargebackAt" : "refundedAt"]: now });
      if (kind === "chat" && unlock.get("status") === "active" && unlock.get("orderId") === orderId) {
        tx.update(unlock.ref, { status: "revoked", revokedAt: now, revokedReason: verdict === "chargeback" ? "chargeback" : "refund", updatedAt: FieldValue.serverTimestamp() });
      }
      return "revoked";
    }
    if (status !== "created") return status === "paid" ? "granted" : "closed";
    if (verdict === "pending") {
      tx.update(ref, { ...record, awaiting: true });
      return "closed";
    }
    if (verdict === "failed") {
      tx.update(ref, { ...record, status: "failed" });
      return "closed";
    }
    if (verdict === "mismatch") {
      // Paid the wrong amount, or an unexpected answer: never granted; support looks at it.
      tx.update(ref, { ...record, mismatchAt: now });
      return "closed";
    }
    if (verdict !== "paid") return "closed";
    if (!user.exists) {
      tx.update(ref, { ...record, status: "orphaned" });
      return "orphaned";
    }
    if (!testModeAllowedFor(order.mode, moderation.get("cohort"))) {
      tx.update(ref, { ...record, status: "rejected", rejectedReason: "test-mode-payment-for-real-account" });
      return "rejected";
    }
    if (kind === "plus") {
      // Passes never overlap: this one starts when any running pass (web or store) ends.
      const queuedUntil = Math.max(Number(ledger.get("until")) || 0, storeExpiry);
      const { startsAt, expiresAt } = passWindow(now, passDays(order.plan!), queuedUntil);
      tx.set(ledger.ref, { until: expiresAt, updatedAt: FieldValue.serverTimestamp() });
      tx.update(ref, { ...record, status: "paid", paidAt: now, startsAt, expiresAt, awaiting: false });
      return "granted";
    }
    if (unlock.get("status") === "active") {
      tx.update(ref, { ...record, status: "duplicate" });
      return "duplicate";
    }
    tx.set(unlock.ref, {
      status: "active",
      product: CHAT_UNLOCK.product,
      orderId,
      paymentId: trackingId ? `ccavenue:${trackingId}` : `ccavenue-order:${orderId}`,
      amountPaise: order.amountPaise,
      currency: order.currency,
      mode: order.mode,
      source: "ccavenue",
      grantedAt: now,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.update(ref, { ...record, status: "paid", paidAt: now, awaiting: false });
    return "granted";
  });

  if (outcome === "duplicate" || outcome === "orphaned") await refundOrder(orderId, order, trackingId, outcome === "duplicate" ? "already-owned" : "account-deleted");
  if (outcome !== "orphaned") {
    if (kind === "plus") {
      // A refunded pass pulls the queue back to the passes that remain.
      if (outcome === "revoked") await db.doc(`webPassLedger/${order.uid}`).set({ until: await webPassExpiry(order.uid), updatedAt: FieldValue.serverTimestamp() });
      if (outcome === "granted" || outcome === "revoked") await syncPremium(order.uid);
    } else {
      await syncChatAccess(order.uid);
    }
  }
  if (outcome !== "granted" && outcome !== "closed") logger.info("CCAvenue order settled", { orderId, kind, outcome });

  const status: SettleResult["status"] =
    outcome === "granted" || outcome === "duplicate" ? "paid"
      : outcome === "revoked" ? "refunded"
        : outcome === "orphaned" || outcome === "rejected" ? "failed"
          : verdict === "paid" ? "paid" : verdict === "chargeback" ? "refunded" : verdict;
  return { status, kind, ...(outcome === "duplicate" || outcome === "orphaned" ? { refunding: true } : {}) };
}

/** The member's newest unpaid CCAvenue order of this kind, still inside its reuse window. */
export async function openCcavenueOrder(uid: string, kind: Kind): Promise<DocumentSnapshot | null> {
  const snap = await db.collection("ccavenueOrders").where("uid", "==", uid).where("status", "==", "created").get();
  const now = Date.now();
  const open = snap.docs
    .filter((doc) => doc.get("kind") === kind && (Number(doc.get("createdAt")) || 0) + OPEN_MS > now)
    .sort((a, b) => (Number(b.get("createdAt")) || 0) - (Number(a.get("createdAt")) || 0));
  return open[0] ?? null;
}

export type CcavenueRedirect = { url: string; encRequest: string; accessCode: string; orderId: string };
type CreateResult = { status: "redirect"; redirect: CcavenueRedirect } | { status: "owned" } | { status: "pending" };

/**
 * Starts a CCAvenue payment: Unlimited Chat by default, or a Paire Plus pass
 * with `plan` ("day" | "week" | "month"). The server sets the price and the
 * account; nothing the client sends changes them.
 */
export const createCcavenueOrder = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request): Promise<CreateResult> => {
  const uid = requireAuth(request);
  const plan = (request.data as { plan?: unknown } | null)?.plan;
  if (plan !== undefined && !isPlusPlan(plan)) throw new HttpsError("invalid-argument", "Choose a 1-day, 7-day or 30-day pass.");
  const kind: Kind = plan ? "plus" : "chat";
  const mode = ccavenueSellingMode();
  if (!mode || !workingKey() || !(await ccavenueSalesOpen()) || (kind === "plus" && !billingEnabled())) {
    throw new HttpsError("failed-precondition", "Card and netbanking payments aren't available right now. You haven't been charged.", { reason: "sales-off" });
  }
  await consumeDailyQuota(uid, "ccavenueOrders", CHAT_UNLOCK.ordersPerDay);
  const [user, moderation, unlock] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`), db.doc(`chatUnlocks/${uid}`));
  if (!user.exists) throw new HttpsError("failed-precondition", "Finish creating your profile first.");
  if (moderation.get("status") === "banned") throw new HttpsError("permission-denied", "This account is unavailable. Contact support for help.");
  if (!testModeAllowedFor(mode, moderation.get("cohort"))) throw new HttpsError("failed-precondition", "Test payments are only for test accounts.");
  if (kind === "chat" && unlock.get("status") === "active") {
    await syncChatAccess(uid);
    return { status: "owned" };
  }

  // An earlier order of the same kind (another tab, a closed window): settle it before taking a second payment.
  const open = await openCcavenueOrder(uid, kind);
  if (open) {
    const earlier = await settleCcavenueOrder(open.id);
    if (earlier.status === "paid") return { status: "owned" };
    if (earlier.status === "pending") return { status: "pending" };
  }
  if (kind === "chat" && (await db.collection("matches").where("participants", "array-contains", uid).limit(1).get()).empty) {
    throw new HttpsError("failed-precondition", "Unlimited Chat opens up once you have a mutual match.", { reason: "no-match" });
  }
  if (kind === "plus" && (await syncPremium(uid)).active) throw new HttpsError("failed-precondition", "Your Plus pass is already active.");
  if (!(await verifiedUsers([uid])).has(uid)) throw new HttpsError("failed-precondition", "Verify your photos first, so you can use it straight away.", { reason: "verification-required" });

  let orderId = newCcavenueOrderId();
  while ((await db.doc(`ccavenueOrders/${orderId}`).get()).exists) orderId = newCcavenueOrderId();
  const amountPaise = kind === "plus" ? PLUS_PASSES[plan as PlusPlan].amountPaise : CHAT_UNLOCK.amountPaise;
  await db.doc(`ccavenueOrders/${orderId}`).set({
    uid,
    kind,
    ...(kind === "plus" ? { plan, product: "paire_plus" } : { product: CHAT_UNLOCK.product }),
    amountPaise,
    currency: "INR",
    mode,
    status: "created",
    createdAt: Date.now(),
    updatedAt: FieldValue.serverTimestamp()
  });
  const plain = checkoutRequestBody({
    merchantId: process.env.CCAVENUE_MERCHANT_ID!.trim(),
    orderId,
    amountPaise,
    redirectUrl: responseUrl(),
    cancelUrl: responseUrl(),
    email: (request.auth?.token.email as string | undefined) ?? null,
    // The product, never the uid: CCAvenue's dashboard shows merchant params.
    product: kind === "plus" ? `paire_plus_${plan}` : `${CHAT_UNLOCK.product}_${hash(uid).slice(0, 8)}`
  });
  return {
    status: "redirect",
    redirect: { url: CCAVENUE_HOSTS[mode].checkout, encRequest: ccavenueEncrypt(plain, workingKey()!), accessCode: process.env.CCAVENUE_ACCESS_CODE!.trim(), orderId }
  };
});

/**
 * "Check payment status", and the app's check after CCAvenue sends the member
 * back: settles `orderId` (the member's own), or their open order of `kind`.
 */
export const confirmCcavenueOrder = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (request): Promise<SettleResult> => {
  const uid = requireAuth(request);
  const body = (request.data ?? {}) as { orderId?: unknown; kind?: unknown };
  await consumeDailyQuota(uid, "ccavenueChecks", CHAT_UNLOCK.accessChecksPerDay);
  // Not ccavenueSalesOpen(): a payment already taken must still be confirmed if sales were paused meanwhile.
  if (!workingKey() || !configuredMode()) throw new HttpsError("failed-precondition", "Payments aren't available yet.");
  let orderId: string | null = null;
  if (body.orderId !== undefined) {
    if (!isCcavenueOrderId(body.orderId)) throw new HttpsError("invalid-argument", "That order isn't valid.");
    const order = await db.doc(`ccavenueOrders/${body.orderId}`).get();
    if (!order.exists || order.get("uid") !== uid) throw new HttpsError("not-found", "We couldn't find that order.");
    orderId = body.orderId;
  } else {
    orderId = (await openCcavenueOrder(uid, body.kind === "plus" ? "plus" : "chat"))?.id ?? null;
  }
  if (!orderId) return { status: "none", kind: body.kind === "plus" ? "plus" : "chat" };
  return settleCcavenueOrder(orderId);
});

/**
 * CCAvenue's redirect (and cancel) URL. It form-POSTs `encResp`; we read only
 * the order id from it, settle that order with CCAvenue's API, and send the
 * browser back to the app. Nothing in the request is trusted, and the URL we
 * redirect to carries only the order id (the app asks the server for the rest).
 */
export const ccavenueResponse = onRequest({ region: REGION, secrets: SECRETS, timeoutSeconds: 60 }, async (request, response) => {
  if (request.method !== "POST") {
    response.redirect(303, returnUrl(appUrl(), null));
    return;
  }
  let orderId: string | null = null;
  const key = workingKey();
  const encResp = (request.body as { encResp?: unknown } | undefined)?.encResp;
  if (key && typeof encResp === "string") {
    try {
      orderId = parseRedirectResponse(ccavenueDecrypt(encResp, key)).orderId;
    } catch {
      logger.warn("CCAvenue response couldn't be read");
    }
  }
  // CCAvenue also posts the order number in the clear; it's only a lookup key, settled with the API.
  const orderNo = (request.body as { orderNo?: unknown } | undefined)?.orderNo;
  if (!orderId && isCcavenueOrderId(orderNo)) orderId = orderNo;
  if (orderId) {
    try {
      await settleCcavenueOrder(orderId);
    } catch (error) {
      // The app checks again when the member lands, and "Check payment status" can retry.
      logger.warn("CCAvenue order not settled on return", { orderId, error: String(error) });
    }
  }
  response.redirect(303, returnUrl(appUrl(), orderId));
});
