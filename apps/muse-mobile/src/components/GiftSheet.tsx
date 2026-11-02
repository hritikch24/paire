import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { webPlan } from "../config/premium";
import { useGifts } from "../hooks/useGifts";
import { friendlyError } from "../services/errors";
import { createGift, type GiftPlanId, type GiftView } from "../services/giftService";
import { GIFT_PLANS, giftPlanLabel, giftStatusWord } from "../utils/gifts";
import { GhostButton } from "./MuseButton";

type GiftSheetProps = { visible: boolean; matchId: string; name: string; onClose: () => void; requestedPlan?: GiftPlanId };

function GiftRow({ gift, side }: { gift: GiftView; side: "sent" | "received" }) {
  return (
    <YStack testID={`gift-row-${gift.id}`} gap={2} paddingVertical="$2" accessible accessibilityLabel={`${side === "sent" ? "To" : "From"} ${gift.counterpartName}, ${giftPlanLabel(gift.plan)}. ${giftStatusWord(gift.status, side, gift.refundStatus)}`}>
      <Text fontSize="$3" fontWeight="600">{`${side === "sent" ? "To" : "From"} ${gift.counterpartName}`}</Text>
      <Text fontSize="$2" color="$textMuted">{`${giftPlanLabel(gift.plan)} · ${giftStatusWord(gift.status, side, gift.refundStatus)}`}</Text>
    </YStack>
  );
}

/**
 * Gift a Plus pass to the person in this chat: the three existing passes at
 * their existing prices. Choosing one sends the buyer to the secure payment
 * page and back to this chat. When the server can't take a gift (a limit, the
 * person already has Lifetime Plus, …) its plain message is shown here and
 * nothing redirects.
 */
export function GiftSheet({ visible, matchId, name, onClose, requestedPlan }: GiftSheetProps) {
  const insets = useSafeAreaInsets();
  const gifts = useGifts().data;
  const [busy, setBusy] = useState<GiftPlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const starting = useRef(false);
  // Back from the payment page can restore this page from the browser's back/forward cache with the sheet mid-checkout.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const reset = (event: Event) => {
      if (!(event as PageTransitionEvent).persisted) return;
      starting.current = false;
      setBusy(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const first = name.split(" ")[0] || "them";
  const history = [...(gifts?.sent ?? []).map((gift) => ({ gift, side: "sent" as const })), ...(gifts?.received ?? []).map((gift) => ({ gift, side: "received" as const }))];

  const start = async (plan: GiftPlanId) => {
    if (starting.current) return;
    starting.current = true;
    setBusy(plan);
    setMessage(null);
    try {
      await createGift(matchId, plan);
      // The page is leaving for the payment page: stay busy so a second tap can't start another order.
    } catch (error) {
      setMessage(friendlyError(error, "We couldn't start that gift. You haven't been charged. Please try again."));
      starting.current = false;
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end" alignItems="center">
        <YStack
          testID="gift-sheet"
          width="100%"
          maxWidth={520}
          maxHeight="90%"
          backgroundColor="$background"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          paddingTop="$5"
          paddingHorizontal="$5"
          paddingBottom={Math.max(insets.bottom, 16) + 8}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <YStack gap="$3">
              <Text fontSize="$7" fontWeight="700" accessibilityRole="header">{`Gift Paire Plus to ${first}`}</Text>
              <Text color="$textMuted">Premium passes only. No cash, items or chat-only unlocks. They can accept or say no. If they say no, do not accept within 7 days, or the match ends, we request a refund to your original payment method. Your bank may take more time to return the money.</Text>
              {requestedPlan ? <Text fontWeight="700">They asked for {giftPlanLabel(requestedPlan)}. You can choose any available gift or close this page. You do not owe them a gift.</Text> : null}
              <YStack gap="$2">
                {GIFT_PLANS.map((plan) => {
                  const details = webPlan(plan);
                  const price = `₹${plan.priceInr}`;
                  return (
                    <Pressable
                      key={plan.id}
                      testID={`gift-plan-${plan.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Gift ${details.label}, ${price}`}
                      accessibilityState={{ disabled: busy !== null, busy: busy === plan.id }}
                      disabled={busy !== null}
                      onPress={() => void start(plan.id)}
                      style={({ pressed }) => ({ opacity: pressed || (busy !== null && busy !== plan.id) ? 0.6 : 1 })}
                    >
                      <XStack padding="$4" gap="$3" borderRadius={18} borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong" alignItems="center" justifyContent="space-between">
                        <YStack flex={1} gap={2}>
                          <Text fontSize="$4" fontWeight="700" textAlign="left">{details.label}</Text>
                          <Text fontSize="$2" color="$textMuted" textAlign="left">{busy === plan.id ? "Opening secure payment…" : details.detail}</Text>
                        </YStack>
                        <Text fontSize="$5" fontWeight="700" color="$primary">{price}</Text>
                      </XStack>
                    </Pressable>
                  );
                })}
              </YStack>
              {message ? (
                <YStack testID="gift-error" accessibilityRole="alert" padding="$3" borderRadius={14} backgroundColor="$backgroundSoft">
                  <Text color="$error">{message}</Text>
                </YStack>
              ) : null}
              {history.length ? (
                <YStack gap="$1" paddingTop="$2">
                  <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase" accessibilityRole="header">Your gifts</Text>
                  {history.map(({ gift, side }) => <GiftRow key={`${side}-${gift.id}`} gift={gift} side={side} />)}
                </YStack>
              ) : null}
              <GhostButton testID="gift-close" onPress={onClose}>Close</GhostButton>
            </YStack>
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  );
}
