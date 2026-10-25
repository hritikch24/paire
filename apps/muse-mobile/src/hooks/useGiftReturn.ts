import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import { showToast } from "../components/Toast";
import type { AppStackParamList } from "../navigation/types";
import { friendlyError } from "../services/errors";
import { confirmGiftPayment } from "../services/giftService";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";
import { restoreDrafts, takeReturnChat } from "../utils/chatAccess";

const ORDER = /^order_[A-Za-z0-9]{6,40}$/;
const PAYMENT = /^pay_[A-Za-z0-9]{6,40}$/;
const SIGNATURE = /^[a-f0-9]{64}$/;

/** Returns already handled in this page load, so a repeated effect run can never confirm (or toast) twice. */
const handled = new Set<string>();

/**
 * Web: Checkout on kraftai.in returns to /app/?kraftai=paid|failed|cancelled&kind=gift&order=…[&payment=…&signature=…].
 * This acts on kind=gift only and must run BEFORE useKraftaiReturn, which strips the
 * parameters: it reads them without removing anything, and leaves plus and chat alone.
 * The URL is only a hint: no gift exists unless the server confirms the payment with Razorpay.
 */
export function useGiftReturn() {
  const uid = useAuthStore((state) => state.user?.uid);
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  useEffect(() => {
    if (Platform.OS !== "web" || isSupportView || !uid || typeof window === "undefined") return;
    const params = new URL(window.location.href).searchParams;
    const result = params.get("kraftai");
    if (!result || params.get("kind") !== "gift") return;
    const [orderId, paymentId, signature] = [params.get("order") ?? "", params.get("payment") ?? "", params.get("signature") ?? ""];
    const key = `${result}:${orderId}:${paymentId}`;
    if (handled.has(key)) return;
    handled.add(key);

    restoreDrafts();
    // Back to the chat the gift was started from (this tab only), where any draft is waiting.
    const chat = takeReturnChat();
    if (chat) setTimeout(() => navigation.navigate("Chat", { matchId: chat }), 0);

    const paid = result === "paid";
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["gifts"] });
      void queryClient.invalidateQueries({ queryKey: ["send-policy"] });
    };
    if (!paid) {
      showToast("The payment didn't go through, and you weren't charged.");
      refresh();
      return;
    }
    if (!(ORDER.test(orderId) && PAYMENT.test(paymentId) && SIGNATURE.test(signature))) {
      showToast("We couldn't confirm your payment from that link. If you were charged, the gift is delivered automatically within a few minutes, or the payment is refunded.");
      refresh();
      return;
    }
    void confirmGiftPayment(orderId, paymentId, signature)
      .then((outcome) => {
        // refunding with "paid" is a second payment for a gift that already exists; refunding with
        // "pending" is the member's only payment for a gift that can't be delivered.
        if (outcome.refunding) showToast(outcome.status === "paid" ? "That was a second payment, and it is being refunded." : "This payment is being refunded, and you won't be charged.");
        else if (outcome.status === "paid") showToast("Gift paid. They'll see it when they open Paire.", "success");
        else showToast("Payment received. Your bank is still confirming it; you won't be charged again.");
      })
      .catch((error) => {
        // Server refusals (a refunded or test payment) explain themselves; anything else is likely a dropped connection, and the signed webhook still completes a real payment.
        showToast(friendlyError(error, "We couldn't confirm your payment yet. If you were charged, the gift reaches them automatically within a few minutes."), "error");
      })
      .finally(refresh);
  }, [navigation, queryClient, uid]);
}
