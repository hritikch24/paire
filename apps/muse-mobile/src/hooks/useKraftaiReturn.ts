import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import { showToast } from "../components/Toast";
import type { AppStackParamList } from "../navigation/types";
import { fetchPremiumStatus, PremiumStatus } from "../services/billingService";
import { ChatAccess, fetchChatAccess } from "../services/chatAccessService";
import { callFunction } from "../services/firebase";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";
import { restoreDrafts, takeReturnChat } from "../utils/chatAccess";

const ORDER = /^order_[A-Za-z0-9]{6,40}$/;
const PAYMENT = /^pay_[A-Za-z0-9]{6,40}$/;
const SIGNATURE = /^[a-f0-9]{64}$/;
const PARAMS = ["kraftai", "kind", "order", "payment", "signature"];

type Outcome = "paid" | "pending" | "not-paid";

/** A paid return: the server checks the signature, then asks Razorpay itself, before granting. */
async function confirm(kind: "plus" | "chat", orderId: string, paymentId: string, signature: string): Promise<Outcome> {
  const body = { orderId, paymentId, signature };
  if (kind === "plus") {
    const status = await callFunction<PremiumStatus & { pending?: boolean }>("confirmPlusPayment", body);
    return status.active ? "paid" : "pending";
  }
  const result = await callFunction<{ status: "owned" | "pending" }>("confirmChatUnlock", body);
  return result.status === "owned" ? "paid" : "pending";
}

/** A cancelled or failed return: a UPI payment can still finish after the window closed, so look once. */
async function recheck(kind: "plus" | "chat"): Promise<Outcome> {
  if (kind === "plus") return (await fetchPremiumStatus()).active ? "paid" : "not-paid";
  const access: ChatAccess = await fetchChatAccess(true);
  return access.unlimited ? "paid" : access.unlock.status === "pending" ? "pending" : "not-paid";
}

/**
 * Web: Checkout on kraftai.in sends the member back to
 * /app/?kraftai=paid|failed|cancelled&kind=plus|chat&order=…[&payment=…&signature=…].
 * The URL is only a hint: nothing is granted unless the server confirms the
 * payment with Razorpay (and the signed webhook covers anything missed here).
 */
export function useKraftaiReturn() {
  const uid = useAuthStore((state) => state.user?.uid);
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  useEffect(() => {
    if (Platform.OS !== "web" || isSupportView || !uid || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("kraftai");
    if (!result) return;
    const get = (name: string) => url.searchParams.get(name) ?? "";
    const [kind, orderId, paymentId, signature] = [get("kind"), get("order"), get("payment"), get("signature")];
    for (const name of PARAMS) url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url.toString());
    if (kind !== "plus" && kind !== "chat") return;

    restoreDrafts();
    // Back to the chat the payment was started from (this tab only), where the draft is waiting.
    const chat = takeReturnChat();
    if (chat) setTimeout(() => navigation.navigate("Chat", { matchId: chat }), 0);

    const paid = result === "paid" && ORDER.test(orderId) && PAYMENT.test(paymentId) && SIGNATURE.test(signature);
    const plus = kind === "plus";
    void (paid ? confirm(kind, orderId, paymentId, signature) : recheck(kind))
      .then((outcome) => {
        if (outcome === "paid") {
          showToast(plus ? "Payment received. Your Paire Plus pass is active." : "Payment received. Unlimited chat is unlocked: your message is still in the chat, ready to send.", "success");
        } else if (outcome === "pending") {
          showToast("Payment received. Your bank is still confirming it, usually within a few minutes. You won't be charged again.");
        } else if (result === "cancelled") {
          showToast("Payment cancelled. You weren't charged.");
        } else {
          showToast("The payment didn't go through, and you weren't charged.");
        }
      })
      .catch(() => {
        showToast(paid
          ? "We couldn't confirm your payment yet. It reaches your account automatically within a few minutes; open Paire Plus or your chat to check."
          : "We couldn't check your payment yet. Open Paire Plus or your chat and tap Refresh.");
      })
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ["chat-access"] });
        void queryClient.invalidateQueries({ queryKey: ["premium"] });
        void queryClient.invalidateQueries({ queryKey: ["daily-allowance"] });
      });
  }, [navigation, queryClient, uid]);
}
