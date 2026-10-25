import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { useGifts } from "../hooks/useGifts";
import { friendlyError } from "../services/errors";
import { claimGift, declineGift } from "../services/giftService";
import { formatGiftDate, giftPlanLabel } from "../utils/gifts";
import { GhostButton, PrimaryButton } from "./MuseButton";
import { showToast } from "./Toast";

/**
 * A gift waiting for you: shown on Matches while one is pending, whatever the
 * gift-sales switch says (a gift already paid for can always be accepted). Nothing
 * is owed for saying no.
 */
export function GiftBanner() {
  const queryClient = useQueryClient();
  const gifts = useGifts().data;
  const [working, setWorking] = useState<"accept" | "decline" | null>(null);
  const inFlight = useRef(false);
  const pending = (gifts?.received ?? []).filter((gift) => gift.status === "pending").sort((a, b) => a.expiresAt - b.expiresAt)[0];
  if (!pending) return null;

  const refresh = (keys: string[]) => keys.forEach((key) => void queryClient.invalidateQueries({ queryKey: [key] }));
  const answer = async (choice: "accept" | "decline") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(choice);
    try {
      if (choice === "accept") {
        const claimed = await claimGift(pending.id);
        showToast(`Gift added. Your Plus runs until ${formatGiftDate(claimed.endsAt)}.`, "success");
        refresh(["gifts", "premium", "chat-access", "daily-allowance", "send-policy"]);
      } else {
        await declineGift(pending.id);
        showToast("No problem. The gift has gone back to them.");
        refresh(["gifts"]);
      }
    } catch (error) {
      showToast(friendlyError(error, "We couldn't do that just now. Please try again."), "error");
      // It may have expired or been settled meanwhile: show what's true now.
      refresh(["gifts"]);
    } finally {
      inFlight.current = false;
      setWorking(null);
    }
  };

  return (
    <YStack testID="gift-banner" marginHorizontal="$4" padding="$4" gap="$3" borderRadius={18} backgroundColor="$primarySoft" accessible={false}>
      <YStack gap={2}>
        <Text fontSize="$4" fontWeight="700" color="$primary" accessibilityRole="header">{`${pending.counterpartName} gifted you Paire Plus: ${giftPlanLabel(pending.plan)}`}</Text>
        <Text fontSize="$2" color="$textMuted">It's yours to accept whenever you like. Saying no is fine.</Text>
      </YStack>
      <XStack gap="$2" alignItems="center">
        <PrimaryButton testID="gift-accept" flex={1} loading={working === "accept"} disabled={working !== null} accessibilityLabel={`Accept gift from ${pending.counterpartName}`} onPress={() => void answer("accept")}>
          Accept gift
        </PrimaryButton>
        <GhostButton testID="gift-decline" loading={working === "decline"} disabled={working !== null} accessibilityLabel={`No thanks to the gift from ${pending.counterpartName}`} onPress={() => void answer("decline")}>
          No thanks
        </GhostButton>
      </XStack>
    </YStack>
  );
}
