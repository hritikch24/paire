import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import { showToast } from "../components/Toast";
import type { AppStackParamList } from "../navigation/types";
import { confirmCcavenuePayment, takeReturnChat } from "../services/ccavenueService";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";
import { restoreDrafts } from "../utils/chatAccess";

const ORDER = /^PA[A-Z0-9]{14}$/;

/**
 * Web: CCAvenue sends the member back to /app/?ccavenue=<orderId>. The URL
 * carries no result; the server asks CCAvenue what happened, then we say so
 * once and refresh what the payment bought.
 */
export function useCcavenueReturn() {
  const uid = useAuthStore((state) => state.user?.uid);
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  useEffect(() => {
    if (Platform.OS !== "web" || isSupportView || !uid || typeof window === "undefined") return;
    restoreDrafts();
    const url = new URL(window.location.href);
    const orderId = url.searchParams.get("ccavenue");
    if (!orderId) return;
    url.searchParams.delete("ccavenue");
    window.history.replaceState(window.history.state, "", url.toString());
    if (!ORDER.test(orderId)) return;
    // Back to the chat the payment was started from (this tab only), where the draft is waiting.
    const chat = takeReturnChat();
    if (chat) setTimeout(() => navigation.navigate("Chat", { matchId: chat }), 0);
    void confirmCcavenuePayment({ orderId })
      .then((result) => {
        const plus = result.kind === "plus";
        if (result.status === "paid") {
          showToast(
            result.refunding
              ? "This was already on your account, so we're refunding that payment. Nothing else changes."
              : plus ? "Payment received. Your Paire Plus pass is active." : "Payment received. Unlimited chat is unlocked: your message is still in the chat, ready to send.",
            "success"
          );
        } else if (result.status === "pending") {
          showToast("Payment received. Your bank is still confirming it, usually within a few minutes. You won't be charged again.");
        } else if (result.status === "mismatch") {
          showToast("We couldn't match that payment to your order. If you were charged, contact support and we'll sort it out.", "error");
        } else {
          showToast("The payment didn't go through, and you weren't charged.");
        }
      })
      .catch(() => showToast("We couldn't check your payment yet. Open Paire Plus or your chat and tap Check payment status."))
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ["chat-access"] });
        void queryClient.invalidateQueries({ queryKey: ["premium"] });
        void queryClient.invalidateQueries({ queryKey: ["daily-allowance"] });
      });
  }, [navigation, queryClient, uid]);
}
