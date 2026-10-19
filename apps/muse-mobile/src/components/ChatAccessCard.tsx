import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { webCheckout } from "../services/billingService";
import { MONTH_OFFER, PREMIUM_PLANS, webPlan } from "../config/premium";
import { ccavenueCheckout, confirmCcavenuePayment, startCcavenuePayment } from "../services/ccavenueService";
import { ChatAccess, fetchChatAccess, purchaseChatUnlock, startUpiUnlock, UpiOrder } from "../services/chatAccessService";
import { errorCode, friendlyError } from "../services/errors";
import { useAuthStore } from "../store/authStore";
import { useThemeColors } from "../theme/useThemeColors";
import { Icon } from "./Icon";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { showToast } from "./Toast";
import { UpiPayPanel } from "./UpiPayPanel";

type Phase = "idle" | "loading" | "pending" | "failed" | "cancelled";

/** Our payment functions explain themselves ("The payment service didn't respond…"); say that, not "offline". */
function checkoutError(error: unknown, fallback: string): string {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : "";
  if ((code === "functions/unavailable" || code === "functions/aborted") && message.length > 20) return message;
  return friendlyError(error, fallback);
}

type Props = {
  access: ChatAccess | undefined;
  /** The chat this card is in: after paying through CCAvenue the member comes back to it. */
  matchId?: string;
  onGetPlus: () => void;
  onVerify: () => void;
};

/**
 * Shown above the composer when sending needs access. Two deliberate choices,
 * nothing opens by itself, and the composed message stays in the box. After
 * paying, sending still takes a tap on Send.
 */
export function ChatAccessCard({ access, matchId, onGetPlus, onVerify }: Props) {
  const queryClient = useQueryClient();
  const uid = useAuthStore((state) => state.user?.uid);
  const { gradient } = useThemeColors();
  const [phase, setPhase] = useState<Phase>(access?.unlock.status === "pending" ? "pending" : "idle");
  const [error, setError] = useState<string | null>(null);
  const unlock = access?.unlock;
  const price = `₹${unlock?.priceInr ?? 49}`;
  const [upiOrder, setUpiOrder] = useState<UpiOrder | null>(null);
  const pending = phase === "pending" || unlock?.status === "pending";
  const upiPending = (unlock?.upiPending === true || upiOrder?.status === "submitted") && !access?.unlimited;
  // UPI to Paire's own account when it's on; otherwise Razorpay Checkout on the web. CCAvenue
  // (cards, UPI, netbanking) is its own choice when it's on, or the only one.
  const byUpi = unlock?.methods?.includes("upi") === true;
  const byRazorpay = webCheckout && (unlock?.methods ? unlock.methods.includes("razorpay") : true);
  const byCcavenue = ccavenueCheckout && unlock?.methods?.includes("ccavenue") === true;
  const available = unlock?.status === "available";
  const canBuy = available && (byUpi || byRazorpay || byCcavenue);
  const ccavenueOnly = byCcavenue && !byUpi && !byRazorpay;

  const payByCcavenue = async () => {
    setPhase("loading");
    setError(null);
    try {
      const result = await startCcavenuePayment(undefined, matchId);
      if (result === "redirecting") return; // The page is leaving for CCAvenue.
      const next = await settle(false).catch(() => null);
      if (result === "owned" || next?.unlimited) showToast("Unlimited chat is already unlocked on your account. Tap send when you're ready.", "success");
      setPhase(result === "pending" && !next?.unlimited ? "pending" : "idle");
    } catch (failure) {
      setError(checkoutError(failure, "We couldn't open the payment page. Please try again."));
      setPhase("failed");
    }
  };

  const payByUpi = async () => {
    setPhase("loading");
    setError(null);
    try {
      const result = await startUpiUnlock();
      if (result.status === "owned") {
        await settle(false).catch(() => null);
        showToast("Unlimited chat is already unlocked on your account. Tap send when you're ready.", "success");
      } else {
        setUpiOrder(result.order);
      }
      setPhase("idle");
    } catch (failure) {
      setError(checkoutError(failure, "We couldn't start the UPI payment. Please try again."));
      setPhase("failed");
    }
  };

  const settle = async (reconcile: boolean) => {
    const next = await fetchChatAccess(reconcile);
    queryClient.setQueryData(["chat-access", uid], next);
    return next;
  };

  const unlockChat = async () => {
    setPhase("loading");
    setError(null);
    try {
      const status = await purchaseChatUnlock(gradient[1] ?? "#B83A5E", matchId);
      if (status === "redirecting") return; // The page is leaving for checkout on kraftai.in.
      const next = await settle(false).catch(() => null);
      if (status === "owned" || next?.unlimited) {
        showToast("Unlimited chat unlocked. Your message is still in the box — tap send when you're ready.", "success");
        setPhase("idle");
      } else {
        setPhase("pending");
      }
    } catch (failure) {
      const cancelled = Boolean(failure && typeof failure === "object" && "userCancelled" in failure && failure.userCancelled === true);
      if (cancelled) {
        // A UPI payment can still complete after the window closes.
        const next = await settle(true).catch(() => null);
        setPhase(next?.unlimited ? "idle" : next?.unlock.status === "pending" ? "pending" : "cancelled");
        if (next?.unlimited) showToast("Unlimited chat unlocked. Tap send when you're ready.", "success");
      } else {
        setError(checkoutError(failure, "We couldn't open the payment. Please try again."));
        setPhase("failed");
      }
    }
  };

  const checkStatus = async () => {
    setPhase("loading");
    try {
      // A CCAvenue payment is settled with CCAvenue first (Razorpay ones by getChatAccess itself).
      if (unlock?.ccavenuePending || byCcavenue) await confirmCcavenuePayment({ kind: "chat" }).catch(() => null);
      const next = await settle(true);
      if (next.unlimited) showToast("Unlimited chat unlocked. Tap send when you're ready.", "success");
      setPhase(next.unlimited ? "idle" : next.unlock.status === "pending" ? "pending" : "idle");
    } catch (failure) {
      setError(checkoutError(failure, "We couldn't check right now. Please try again."));
      setPhase("failed");
    }
  };

  return (
    <YStack testID="chat-access-card" marginHorizontal="$3" marginBottom="$2" padding="$3" gap="$2" borderRadius="$5" borderWidth={1} borderColor="$border" backgroundColor="$backgroundSoft" accessibilityLiveRegion="polite">
      <XStack gap="$2" alignItems="center">
        <Icon name="lock-closed-outline" size={18} color="primary" />
        <Text fontWeight="700" flex={1}>Sending messages needs access</Text>
      </XStack>
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>
        Reading and receiving messages is always free. To send, choose one. Your message stays here either way.
      </Text>

      {upiPending ? (
        <YStack gap="$2" testID="chat-access-upi-pending">
          <Text fontSize="$2" lineHeight={20}>
            Thanks! We're confirming your UPI payment reached Paire, usually within a few hours. You won't be charged again, and chat unlocks as soon as it's confirmed.
          </Text>
          <SecondaryButton testID="chat-access-check" loading={phase === "loading"} onPress={() => void checkStatus()}>Check payment status</SecondaryButton>
        </YStack>
      ) : upiOrder ? (
        <UpiPayPanel order={upiOrder} onSubmitted={(next) => { setUpiOrder(next); void settle(false).catch(() => null); }} />
      ) : pending ? (
        <YStack gap="$2" testID="chat-access-pending">
          <Text fontSize="$2" lineHeight={20}>
            Payment received. Your bank is still confirming it, which usually takes a few minutes. You won't be charged again, and chat unlocks as soon as it's confirmed.
          </Text>
          <SecondaryButton testID="chat-access-check" loading={phase === "loading"} onPress={() => void checkStatus()}>Check payment status</SecondaryButton>
        </YStack>
      ) : (
        <YStack gap="$2">
          <PrimaryButton testID="chat-access-plus" disabled={phase === "loading"} onPress={onGetPlus}>Get Paire Plus</PrimaryButton>
          <Text fontSize="$1" color="$textMuted" lineHeight={18}>{webCheckout ? `From ₹${webPlan(PREMIUM_PLANS[2]).perDay} a day (${MONTH_OFFER.toLowerCase()}), and it never auto-renews.` : "Passes from ₹20 that never auto-renew."} Messaging is included while your pass runs, plus more likes and Super Likes.</Text>
          {canBuy ? (
            <>
              <SecondaryButton testID="chat-access-unlock" loading={phase === "loading"} onPress={() => void (byUpi ? payByUpi() : ccavenueOnly ? payByCcavenue() : unlockChat())}>
                {`Unlock unlimited chats — ${price} once`}
              </SecondaryButton>
              {byCcavenue && !ccavenueOnly ? (
                <SecondaryButton testID="chat-access-ccavenue" disabled={phase === "loading"} onPress={() => void payByCcavenue()}>
                  Pay by card, netbanking or wallet
                </SecondaryButton>
              ) : null}
              <Text fontSize="$1" color="$textMuted" lineHeight={18}>
                {`One payment of ${price} covers all your current and future mutual matches. No expiry, no renewal, no per-match charge. Messaging only: it doesn't include Plus's likes or filters.${byUpi ? " Pay by UPI." : ""}${byCcavenue ? ` ${byUpi ? "Or pay" : "Pay"} securely through CCAvenue with a card, UPI, netbanking or a wallet; you'll come back here after paying.` : ""}`}
              </Text>
            </>
          ) : unlock?.reason === "verification-required" ? (
            <SecondaryButton onPress={onVerify}>Verify my photos to unlock chat</SecondaryButton>
          ) : !webCheckout ? (
            <Text fontSize="$1" color="$textMuted" lineHeight={18}>Already unlocked chat on another device? It's tied to your account and shows up here automatically.</Text>
          ) : null}
        </YStack>
      )}

      {phase === "cancelled" ? (
        <YStack gap="$1">
          <Text fontSize="$2" color="$textMuted" lineHeight={20}>Checkout closed. If you finished paying (for example in your UPI app), it will show up here within a few minutes.</Text>
          <SecondaryButton onPress={() => void checkStatus()}>Check payment status</SecondaryButton>
        </YStack>
      ) : null}
      {phase === "failed" && error ? <Text fontSize="$2" color="$error" lineHeight={20}>{error}</Text> : null}

      <Text fontSize="$1" color="$textMuted" lineHeight={18}>
        Each person needs their own access to send: unlocking lets you send, not the other person. Paying never guarantees a match, a reply, someone's identity or your safety, and reporting, blocking and unmatching are always free.
      </Text>
    </YStack>
  );
}
