import { useState } from "react";
import { Modal, Pressable, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Text, XStack, YStack } from "tamagui";
import { GIFT_PLANS, giftPlanLabel } from "../utils/gifts";
import type { GiftPlanId } from "../services/giftService";
import { closeGiftRequest, fetchGiftRequests, requestPlusGift, GiftRequest } from "../services/giftRequestService";
import { useAuthStore } from "../store/authStore";
import { friendlyError } from "../services/errors";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
export function GiftRequestSheet({ matchId, onClose, onGift }: { matchId: string; onClose: () => void; onGift: (plan: GiftPlanId) => void }) {
  const uid = useAuthStore(state => state.user?.uid);
  const query = useQuery({ queryKey: ["gift-requests", uid, matchId], queryFn: () => fetchGiftRequests(matchId), staleTime: 30_000, retry: false });
  const [plan, setPlan] = useState<GiftPlanId>("month"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const act = async (work: () => Promise<unknown>, success: string) => { if (busy) return; setBusy(true); setMessage(""); try { await work(); setMessage(success); await query.refetch(); } catch (error) { setMessage(friendlyError(error, "Your choice was not saved. Please try again.")); } finally { setBusy(false); } };
  const close = (request: GiftRequest) => act(() => closeGiftRequest(request, request.fromUid === uid ? "withdraw" : "decline"), "Request closed. No money was taken.");
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end" alignItems="center"><YStack testID="gift-request-sheet" width="100%" maxWidth={520} maxHeight="90%" backgroundColor="$background" borderTopLeftRadius={24} borderTopRightRadius={24} padding="$4" paddingBottom={28}>
    <ScrollView><YStack gap="$3">
      <Text fontSize="$6" fontWeight="700" accessibilityRole="header">Ask for a Plus gift</Text>
      <Text lineHeight={23}>Anyone can ask a match. They can say no. A gift does not buy a reply, a date, sex or company. Do not pressure someone who says no.</Text>
      <Text color="$textMuted" lineHeight={22}>This sends a request only. It does not charge anyone or open payment. You can ask the same person once every 7 days, up to 3 people a day.</Text>
      <XStack flexWrap="wrap" gap="$2">{GIFT_PLANS.map(item => <Pressable key={item.id} testID={`request-plan-${item.id}`} accessibilityRole="button" accessibilityState={{ selected: plan === item.id }} onPress={() => setPlan(item.id as GiftPlanId)}><YStack padding="$3" borderRadius={16} borderWidth={1} borderColor={plan === item.id ? "$primary" : "$border"}><Text>{giftPlanLabel(item.id as GiftPlanId)}</Text></YStack></Pressable>)}</XStack>
      <PrimaryButton testID="gift-request-send" disabled={busy || query.data?.enabled !== true} loading={busy} onPress={() => void act(() => requestPlusGift(matchId, plan), "Request sent. Your match can say no. No money was taken.")}>Ask for {giftPlanLabel(plan)}</PrimaryButton>
      {query.data?.enabled === false ? <Text color="$textMuted">Gift requests are not available in this chat right now.</Text> : null}
      {query.isError ? <Text color="$error">Could not load requests. Please close this page and try again.</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
      {query.data?.requests.map(request => <YStack key={request.id} gap="$2" padding="$3" borderRadius={18} backgroundColor="$backgroundStrong">
        <Text fontWeight="700">{request.fromUid === uid ? "You asked for" : "Your match asked for"} {giftPlanLabel(request.plan)}</Text>
        <Text>{({ pending: "Request open. Check Your gifts separately for any gift or payment.", declined: request.fromUid === uid ? "They said no for now. Please respect their choice." : "You said no for now.", withdrawn: "The request was closed.", expired: "The request expired." })[request.status]}</Text>
        {request.status === "pending" ? <>
          {request.toUid === uid ? <PrimaryButton testID="request-choose-gift" disabled={busy || !query.data?.enabled} onPress={() => { onGift(request.plan); onClose(); }}>Choose a gift · see price first</PrimaryButton> : <Text color="$textMuted" fontSize="$2">Already received a gift? Close this request. Your actual gift and payment status are shown separately.</Text>}
          <SecondaryButton disabled={busy} onPress={() => void close(request)}>{request.fromUid === uid ? "Close my request" : "No thanks"}</SecondaryButton>
        </> : null}
      </YStack>)}
      <SecondaryButton onPress={onClose}>Close</SecondaryButton>
    </YStack></ScrollView>
  </YStack></YStack></Modal>;
}
