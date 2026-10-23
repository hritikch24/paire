import { Platform } from "react-native";
import { rememberReturnChat, stashDrafts } from "../utils/chatAccess";
import { callFunction } from "./firebase";

/**
 * CCAvenue (cards, UPI, netbanking, wallets) on the web. The server creates the
 * order at its own price for the signed-in account and encrypts it; the browser
 * then leaves for CCAvenue's payment page and comes back to /app/?ccavenue=<id>.
 * Nothing unlocks until the server confirms the payment with CCAvenue itself.
 */

export const ccavenueCheckout = Platform.OS === "web";

type Redirect = { url: string; encRequest: string; accessCode: string; orderId: string };
type CreateResult = { status: "redirect"; redirect: Redirect } | { status: "owned" } | { status: "pending" };

export type CcavenueResult = {
  status: "paid" | "pending" | "failed" | "refunded" | "none" | "mismatch" | "unknown";
  kind: "chat" | "plus" | null;
  /** This payment is being returned: the account already had what it bought. */
  refunding?: boolean;
};

/** CCAvenue's non-seamless checkout is a form POST (encRequest + access_code), not a link. */
function postTo(redirect: Redirect) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = redirect.url;
  form.style.display = "none";
  for (const [name, value] of [["encRequest", redirect.encRequest], ["access_code", redirect.accessCode]]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/**
 * Starts a CCAvenue payment: Unlimited Chat, or a Plus pass with `plan`.
 * Resolves "redirecting" while the browser leaves for CCAvenue, or "owned" /
 * "pending" when an earlier payment already covers it (never a second charge).
 */
export async function startCcavenuePayment(plan?: "day" | "week" | "month" | "halfyear" | "lifetime", returnToChat?: string): Promise<"redirecting" | "owned" | "pending"> {
  if (!ccavenueCheckout) throw new Error("Card payments are available on paire.in.");
  const created = await callFunction<CreateResult>("createCcavenueOrder", plan ? { plan } : {});
  if (created.status !== "redirect") return created.status;
  // Composed messages, and the chat they were written in, come back with the member.
  stashDrafts();
  rememberReturnChat(returnToChat);
  postTo(created.redirect);
  return "redirecting";
}

/** Asks the server to settle an order with CCAvenue: `orderId` after the return, or your open order of `kind`. */
export const confirmCcavenuePayment = (target: { orderId: string } | { kind: "chat" | "plus" }) =>
  callFunction<CcavenueResult>("confirmCcavenueOrder", target);
