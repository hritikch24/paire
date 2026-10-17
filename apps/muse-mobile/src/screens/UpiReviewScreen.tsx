import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState, LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { fetchUpiReviewQueue, reviewUpiPayment, UpiReviewItem } from "../services/chatAccessService";
import { friendlyError } from "../services/errors";

/**
 * Moderators only (the server checks the moderator claim). Approve a UPI
 * payment only after finding it in Paire's bank statement with the same
 * amount, paise included, and UTR. Approving unlocks the member's chat.
 */
export function UpiReviewScreen() {
  const queue = useQuery({ queryKey: ["upi-review"], queryFn: fetchUpiReviewQueue, refetchInterval: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (item: UpiReviewItem, decision: "approve" | "reject") => {
    setBusy(`${item.orderId}:${decision}`);
    try {
      await reviewUpiPayment(item.orderId, decision);
      showToast(decision === "approve" ? `Approved ${item.amountLabel}: chat unlocked for ${item.memberName}.` : `Rejected ${item.orderId}.`, "success");
      await queue.refetch();
    } catch (error) {
      showToast(friendlyError(error, "That didn't work. Please try again."), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll header={<ScreenHeader title="UPI payments to confirm" />}>
      <YStack gap="$3" paddingTop="$3">
        <Text color="$textMuted" lineHeight={22}>
          Find each payment in the bank statement or UPI app for Paire's account. Approve only if the amount (with paise) and the UTR both match. Reject if you can't find it; the member can try again. Payments for someone who already has Unlimited Chat need a manual refund.
        </Text>
        {queue.isLoading ? <LoadingView /> : null}
        {queue.isError ? <Text color="$error">{friendlyError(queue.error, "Couldn't load the queue.")}</Text> : null}
        {queue.data && !queue.data.length ? <EmptyState icon="checkmark-done-outline" title="Nothing to confirm" message="New UPI payments appear here once members enter their UPI reference." /> : null}
        {queue.data?.map((item) => (
          <YStack key={item.orderId} testID={`upi-review-${item.orderId}`} gap="$2" padding="$3" borderRadius="$4" borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize="$7" fontWeight="700">{item.amountLabel}</Text>
              <Text color="$textMuted" fontSize="$2">{item.orderId}</Text>
            </XStack>
            <Text selectable>UTR: <Text fontWeight="700" selectable>{item.utr ?? "—"}</Text></Text>
            <Text color="$textMuted" fontSize="$2">
              {item.memberName} · submitted {item.submittedAt ? new Date(item.submittedAt).toLocaleString("en-IN") : "—"}
            </Text>
            <XStack gap="$2">
              <YStack flex={1}>
                <PrimaryButton loading={busy === `${item.orderId}:approve`} disabled={Boolean(busy)} onPress={() => void decide(item, "approve")}>Approve</PrimaryButton>
              </YStack>
              <YStack flex={1}>
                <SecondaryButton loading={busy === `${item.orderId}:reject`} disabled={Boolean(busy)} onPress={() => void decide(item, "reject")}>Reject</SecondaryButton>
              </YStack>
            </XStack>
          </YStack>
        ))}
      </YStack>
    </Screen>
  );
}
