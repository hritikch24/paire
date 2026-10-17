import { createCipheriv, createDecipheriv, createHash, randomInt } from "crypto";

/**
 * CCAvenue (Avenues India) helpers, kept free of Firestore so they can be unit
 * tested. CCAvenue's "non-seamless" integration:
 *
 * 1. The server encrypts the order (merchant id, order id, amount, return URLs)
 *    with the merchant's working key and the browser form-POSTs it, with the
 *    access code, to CCAvenue's payment page.
 * 2. After paying (or cancelling), CCAvenue form-POSTs `encResp` back to our
 *    redirect URL.
 * 3. We never trust that response: the server asks CCAvenue's order status API
 *    (authenticated with the access code and the working key) what happened to
 *    the order, and only that answer can unlock anything.
 *
 * Encryption is CCAvenue's own scheme: AES-128-CBC, the key is the MD5 of the
 * working key, a fixed IV of bytes 0..15, hex output.
 */

export type CcavenueMode = "test" | "live";

const IV = Buffer.from(Array.from({ length: 16 }, (_, index) => index));
const keyFor = (workingKey: string) => createHash("md5").update(workingKey).digest();

export function ccavenueEncrypt(plain: string, workingKey: string): string {
  const cipher = createCipheriv("aes-128-cbc", keyFor(workingKey), IV);
  return cipher.update(plain, "utf8", "hex") + cipher.final("hex");
}

/** Throws when the text wasn't encrypted with this working key. */
export function ccavenueDecrypt(hex: string, workingKey: string): string {
  if (!/^(?:[0-9a-fA-F]{32})+$/.test(hex)) throw new Error("Not a CCAvenue payload.");
  const decipher = createDecipheriv("aes-128-cbc", keyFor(workingKey), IV);
  return decipher.update(hex, "hex", "utf8") + decipher.final("utf8");
}

/** CCAvenue's payment page and API for each environment. */
export const CCAVENUE_HOSTS: Record<CcavenueMode, { checkout: string; api: string }> = {
  test: {
    checkout: "https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction",
    api: "https://apitest.ccavenue.com/apis/servlet/DoWebTrans"
  },
  live: {
    checkout: "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction",
    api: "https://api.ccavenue.com/apis/servlet/DoWebTrans"
  }
};

/** CCAVENUE_ENV says which environment the merchant id, access code and working key belong to. */
export function ccavenueMode(value: string | undefined): CcavenueMode | null {
  return value === "test" || value === "live" ? value : null;
}

const ORDER_ID = /^PA[A-Z0-9]{14}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Our CCAvenue order ids: "PA" + 14 characters (CCAvenue allows up to 30 alphanumerics). */
export const newCcavenueOrderId = () => `PA${Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
export const isCcavenueOrderId = (value: unknown): value is string => typeof value === "string" && ORDER_ID.test(value);

/** "4900" paise → "49.00", the format CCAvenue expects. */
export const rupees = (paise: number) => (paise / 100).toFixed(2);

/** "49.0", 49 or "49.00" → 4900. NaN for anything else. */
export function toPaise(amount: unknown): number {
  const value = typeof amount === "number" ? amount : typeof amount === "string" && /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Number(amount) : NaN;
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

export type CheckoutRequest = {
  merchantId: string;
  orderId: string;
  amountPaise: number;
  redirectUrl: string;
  cancelUrl: string;
  email?: string | null;
  /** Shown nowhere; returned with the response. Never trusted. */
  product: string;
};

/** The plain request CCAvenue's payment page expects, before encryption. */
export function checkoutRequestBody(request: CheckoutRequest): string {
  const params = new URLSearchParams({
    merchant_id: request.merchantId,
    order_id: request.orderId,
    currency: "INR",
    amount: rupees(request.amountPaise),
    redirect_url: request.redirectUrl,
    cancel_url: request.cancelUrl,
    language: "EN",
    merchant_param1: request.product
  });
  if (request.email) params.set("billing_email", request.email);
  return params.toString();
}

/** The fields of CCAvenue's redirect response we use (`order_id` only to find the order). */
export function parseRedirectResponse(plain: string): { orderId: string | null; status: string | null } {
  const params = new URLSearchParams(plain);
  const orderId = params.get("order_id");
  return { orderId: isCcavenueOrderId(orderId) ? orderId : null, status: params.get("order_status") };
}

/**
 * The API's answer: `status=0&enc_response=<hex>` (or `status=1&enc_response=<error text>`).
 * Returns the decrypted JSON, or null when CCAvenue reported an error (e.g. no such order).
 */
export function parseApiResponse(body: string, workingKey: string): Record<string, unknown> | null {
  const params = new URLSearchParams(body.trim());
  if (params.get("status") !== "0") return null;
  const parsed = JSON.parse(ccavenueDecrypt((params.get("enc_response") ?? "").trim(), workingKey)) as Record<string, unknown>;
  // Some API versions wrap the result; both shapes are accepted.
  const inner = (parsed.Order_Status_Result ?? parsed.Refund_Order_Result ?? parsed) as Record<string, unknown>;
  return inner && typeof inner === "object" ? inner : null;
}

export type OrderStatus = {
  order_no?: unknown;
  reference_no?: unknown;
  order_status?: unknown;
  order_amt?: unknown;
  order_currncy?: unknown;
  status?: unknown;
};

export type CcavenueVerdict = "paid" | "pending" | "failed" | "refunded" | "chargeback" | "mismatch" | "none";

const PAID = new Set(["Successful", "Shipped", "Success"]);
const PENDING = new Set(["Awaited", "Initiated"]);
const FAILED = new Set(["Aborted", "Unsuccessful", "Failure", "Invalid", "Timeout", "Auto-Cancelled", "Cancelled", "Fraud"]);
const REFUNDED = new Set(["Refunded", "Auto-Reversed", "System refund"]);

/**
 * What CCAvenue's order status API says about our order: paid only for this
 * exact order, amount and currency. `null` (no record at CCAvenue: the member
 * never reached the payment page) is "none".
 */
export function ccavenueVerdict(status: OrderStatus | null, order: { orderId: string; amountPaise: number }): CcavenueVerdict {
  if (!status) return "none";
  if (status.status !== undefined && Number(status.status) !== 0) return "none";
  if (status.order_no !== order.orderId) return "mismatch";
  const state = typeof status.order_status === "string" ? status.order_status.trim() : "";
  if (state === "Chargeback") return "chargeback";
  if (REFUNDED.has(state)) return "refunded";
  if (FAILED.has(state)) return "failed";
  if (toPaise(status.order_amt) !== order.amountPaise || (status.order_currncy !== undefined && status.order_currncy !== "INR")) return "mismatch";
  if (PAID.has(state)) return "paid";
  if (PENDING.has(state)) return "pending";
  return "mismatch";
}

/** CCAvenue tracking ids (reference_no) are numeric. */
export const isTrackingId = (value: unknown): value is string => (typeof value === "string" || typeof value === "number") && /^\d{6,20}$/.test(String(value));

/** Back to the app (MUSE_APP_URL, never a URL from the request, so this is no open redirect). */
export function returnUrl(appUrl: string, orderId: string | null): string {
  const url = new URL(appUrl);
  if (orderId) url.searchParams.set("ccavenue", orderId);
  return url.toString();
}
