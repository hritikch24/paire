import Constants from "expo-constants";
import { Platform } from "react-native";
import type { PurchasesStoreProduct } from "react-native-purchases";
import { env } from "../config/env";
import { PREMIUM_PLANS, PremiumPlanId } from "../config/premium";
import { rememberReturnChat, stashDrafts } from "../utils/chatAccess";
import { auth, callFunction } from "./firebase";

export type PremiumStatus = {
  active: boolean;
  expiresAt: number | null;
  /** Store checkout in the Android/iOS app. */
  purchaseAvailable: boolean;
  /** Razorpay checkout on the web. */
  webPurchaseAvailable?: boolean;
  /** UPI straight to Paire: scan the QR or open a UPI app. */
  upiPurchaseAvailable?: boolean;
  /** CCAvenue on the web: cards, UPI, netbanking, wallets. */
  ccavenuePurchaseAvailable?: boolean;
  /** An earlier card/Razorpay checkout didn't go through; nothing was charged. */
  previousPaymentFailed?: boolean;
  purchaseBlockReason?: "verification-required";
};
export const fetchPremiumStatus = () => callFunction<PremiumStatus>("getPremiumStatus");

/** On the web, Plus passes are paid with Razorpay (UPI, cards, netbanking). */
export const webCheckout = Platform.OS === "web";

/**
 * A server-created Razorpay order: the server set the product, price and account.
 * `hostedUrl`: Checkout opens on kraftai.in (whose Razorpay account takes Paire's
 * payments) instead of in this page; see docs/kraftai-checkout.md.
 */
export type CheckoutOrder = { orderId: string; amount: number; currency: string; keyId: string; name: string; description: string; email: string | null; hostedUrl?: string | null };
type PlusOrder = CheckoutOrder;
export type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCheckout = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: unknown) => void) => void };

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<RazorpayCheckout> {
  const existing = (globalThis as { Razorpay?: RazorpayCheckout }).Razorpay;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => {
      const loaded = (globalThis as { Razorpay?: RazorpayCheckout }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error("The payment window didn't load. Please try again."));
    };
    script.onerror = () => reject(new Error("The payment window didn't load. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

/** Thrown when the member closes the payment window. */
export class CheckoutCancelled extends Error {
  readonly userCancelled = true;
  constructor() {
    super("Payment cancelled.");
  }
}

/**
 * Web: leaves for Checkout on kraftai.in. It sends the member back to
 * /app/?kraftai=… (useKraftaiReturn), where the server verifies the payment as
 * usual. Drafts and the chat they were in come back with them.
 */
export function leaveForHostedCheckout(order: CheckoutOrder, returnToChat?: string) {
  stashDrafts();
  rememberReturnChat(returnToChat);
  window.location.assign(order.hostedUrl!);
}

/** Opens Razorpay Checkout for a server-created order. Resolves with Checkout's signed response, which the server still verifies. */
export async function openCheckout(order: CheckoutOrder, theme: string): Promise<CheckoutResult> {
  const Razorpay = await loadCheckout();
  return new Promise<CheckoutResult>((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      order_id: order.orderId,
      prefill: order.email ? { email: order.email } : undefined,
      theme: { color: theme },
      handler: (response: CheckoutResult) => resolve(response),
      modal: { ondismiss: () => reject(new CheckoutCancelled()) }
    });
    checkout.on("payment.failed", () => undefined); // Checkout shows the error and lets them retry.
    checkout.open();
  });
}

/**
 * Buys a Plus pass on the web: the server creates the order at its own price,
 * Razorpay Checkout takes the payment, and the server confirms it with Razorpay
 * before granting anything. A successful popup alone never grants Plus.
 */
export async function purchaseWebPass(planId: PremiumPlanId, theme: string): Promise<(PremiumStatus & { pending?: boolean }) | { redirecting: true }> {
  const order = await callFunction<PlusOrder>("createPlusOrder", { plan: planId });
  if (order.hostedUrl) {
    leaveForHostedCheckout(order);
    return { redirecting: true };
  }
  const result = await openCheckout(order, theme);
  try {
    return await callFunction<PremiumStatus & { pending?: boolean }>("confirmPlusPayment", {
      orderId: result.razorpay_order_id,
      paymentId: result.razorpay_payment_id,
      signature: result.razorpay_signature
    });
  } catch {
    // The money has moved: never invite a second payment. Razorpay's signed webhook
    // grants the pass even if this confirmation call failed.
    const status = await fetchPremiumStatus().catch(() => ({ active: false, expiresAt: null, purchaseAvailable: false }));
    return { ...status, pending: !status.active };
  }
}

const key = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : Platform.OS === "android" ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : undefined;
export const nativeBillingAvailable = Boolean(key && !env.testServer && !env.useEmulator && Constants.executionEnvironment !== "storeClient");

async function purchasesFor(uid: string) {
  if (!nativeBillingAvailable || auth.currentUser?.uid !== uid) throw new Error("Store purchases aren’t available here.");
  const { default: Purchases } = await import("react-native-purchases");
  if (!await Purchases.isConfigured()) Purchases.configure({ apiKey: key!, appUserID: uid });
  else if (await Purchases.getAppUserID() !== uid) await Purchases.logIn(uid);
  return Purchases;
}

export async function fetchPassProducts(uid: string): Promise<PurchasesStoreProduct[]> {
  if (!nativeBillingAvailable) return [];
  const Purchases = await purchasesFor(uid);
  const products = await Purchases.getProducts(PREMIUM_PLANS.map((plan) => plan.productId), Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  return products.filter((product) => product.productCategory === "NON_SUBSCRIPTION" && product.productType === "CONSUMABLE");
}

export async function purchasePass(uid: string, product: PurchasesStoreProduct): Promise<PremiumStatus> {
  const Purchases = await purchasesFor(uid);
  const status = await fetchPremiumStatus();
  if (!status.purchaseAvailable || status.active) throw new Error(status.active ? "Your pass is already active." : "Passes aren’t available yet.");
  if (auth.currentUser?.uid !== uid || await Purchases.getAppUserID() !== uid) throw new Error("Please sign in again.");
  await Purchases.purchaseStoreProduct(product);
  // SDK success alone never enables premium or increases a server quota.
  return fetchPremiumStatus();
}

export async function restorePasses(uid: string): Promise<PremiumStatus> {
  const Purchases = await purchasesFor(uid);
  await Purchases.restorePurchases();
  return fetchPremiumStatus();
}
