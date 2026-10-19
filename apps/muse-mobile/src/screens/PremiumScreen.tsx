import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { Linking, Pressable } from "react-native";
import { legal } from "../config/legal";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "../components/Icon";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { ALLOWANCE, dailyPrice, MONTH_OFFER, PREMIUM_PLANS, PremiumPlanId, webPlan } from "../config/premium";
import {
  fetchPassProducts,
  fetchPremiumStatus,
  nativeBillingAvailable,
  purchasePass,
  purchaseWebPass,
  restorePasses,
  webCheckout
} from "../services/billingService";
import { useThemeColors } from "../theme/useThemeColors";
import { friendlyError } from "../services/errors";
import { fetchDailyAllowance } from "../services/discoveryService";
import { trackConversion } from "../services/analytics";
import { useAuthStore } from "../store/authStore";
import { useChatAccess } from "../hooks/useChatAccess";
import { UpiPayPanel } from "../components/UpiPayPanel";
import { fetchOpenUpiOrder, startUpiUnlock, UpiOrder } from "../services/chatAccessService";
import { ccavenueCheckout, confirmCcavenuePayment, startCcavenuePayment } from "../services/ccavenueService";
import { useQueryClient } from "@tanstack/react-query";

export function PremiumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  // On the web the month pass (with a free month) leads and is chosen by default.
  const [selected, setSelected] = useState<PremiumPlanId>(webCheckout ? "month" : "week");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const uid = useAuthStore((state) => state.user?.uid);
  const allowance = useQuery({ queryKey: ["daily-allowance", uid], queryFn: fetchDailyAllowance, enabled: Boolean(uid), staleTime: 0, retry: 1 });
  const resetTime = allowance.data ? new Date(allowance.data.resetsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : null;
  const plan = PREMIUM_PLANS.find((item) => item.id === selected)!;
  const premium = useQuery({ queryKey: ["premium", uid], queryFn: fetchPremiumStatus, enabled: Boolean(uid), refetchInterval: 300_000, retry: 1 });
  const products = useQuery({ queryKey: ["pass-products", uid], queryFn: () => fetchPassProducts(uid!), enabled: Boolean(uid && nativeBillingAvailable), retry: 1 });
  const product = products.data?.find((item) => item.identifier === plan.productId);
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  // Paid chat: Plus includes unlimited messaging while it runs (copy follows the server's switch).
  const chat = useChatAccess().data;
  const paidChat = Boolean(chat?.enforced || chat?.enforceFrom);
  const ready = Boolean(premium.data && !premium.isError && !premium.data.active);
  // UPI straight to Paire when it's on (scan or open PhonePe/any UPI app); otherwise Razorpay on the
  // web, or the store's localised product in the app.
  const byUpi = premium.data?.upiPurchaseAvailable === true;
  const upiOrder = useQuery({ queryKey: ["upi-plus-order", uid], queryFn: () => fetchOpenUpiOrder("plus"), enabled: Boolean(uid && (byUpi || webCheckout)), retry: 1 });
  const [shownOrder, setShownOrder] = useState<UpiOrder | null>(null);
  const openOrder = shownOrder ?? upiOrder.data ?? null;
  const upiSubmitted = openOrder?.status === "submitted";
  // CCAvenue (cards, UPI, netbanking, wallets) on the web: its own button, or the main one when it's the only way.
  const byCcavenue = ccavenueCheckout && premium.data?.ccavenuePurchaseAvailable === true;
  const ccavenueOnly = byCcavenue && !byUpi && premium.data?.webPurchaseAvailable !== true;
  const canPurchase = byUpi ? ready && !upiSubmitted : ccavenueOnly ? ready && !upiSubmitted : webCheckout ? ready && premium.data?.webPurchaseAvailable === true : Boolean(product && ready && premium.data?.purchaseAvailable);
  const payByCcavenue = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await startCcavenuePayment(plan.id);
      if (result === "redirecting") return; // The page is leaving for CCAvenue.
      if (result === "pending") setMessage("Your earlier payment is still being confirmed by your bank, usually within a few minutes. You won't be charged again. Tap Refresh below.");
      await premium.refetch();
      setBusy(false);
    } catch (error) {
      setMessage(friendlyError(error, "We couldn't open the payment page. Please try again."));
      setBusy(false);
    }
  };
  const refreshStatus = async () => {
    // Settle a CCAvenue payment the bank was still confirming, then read the pass.
    if (byCcavenue) await confirmCcavenuePayment({ kind: "plus" }).catch(() => null);
    await premium.refetch();
  };
  const priceLabel = webCheckout || byUpi ? `₹${plan.priceInr}` : (product?.priceString ?? `₹${plan.priceInr}`);
  const offer = webCheckout ? webPlan(plan) : null;
  // "2 months" says the offer in two words on the buy button.
  const buyLabel = offer && plan.bonusDays ? "2 months" : plan.label;
  const plans = webCheckout ? [...PREMIUM_PLANS].reverse() : PREMIUM_PLANS;
  const fromPerDay = webCheckout ? Math.min(...PREMIUM_PLANS.map((item) => Number(webPlan(item).perDay))) : 10;
  const payByUpi = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await startUpiUnlock(plan.id);
      if (result.status === "order") setShownOrder(result.order);
    } catch (error) {
      setMessage(friendlyError(error, "We couldn't start the UPI payment. Please try again."));
    } finally { setBusy(false); }
  };
  const act = async (restore = false) => {
    if (!restore && byUpi) return payByUpi();
    if (!restore && ccavenueOnly) return payByCcavenue();
    if (!uid || (!restore && !webCheckout && !product)) return;
    setBusy(true); setMessage(null);
    let leaving = false;
    try {
      const result = restore ? await restorePasses(uid) : webCheckout ? await purchaseWebPass(plan.id, colors.gradient[1] ?? "#B83A5E") : await purchasePass(uid, product!);
      // Checkout on kraftai.in: the page is leaving, so keep the button busy (no second order).
      if ("redirecting" in result) { leaving = true; return; }
      const pending = "pending" in result && result.pending === true;
      if (!restore && webCheckout && (result.active || pending)) trackConversion("Purchase", { value: plan.priceInr, currency: "INR" });
      setMessage(result.active ? "Your Plus pass is active. Enjoy a little more possibility." : restore ? "No active pass was found. Consumable passes may need support to recover after reinstalling." : pending ? "Payment received. Your bank is still confirming it; your pass starts as soon as it does (usually a few minutes). Refresh below." : "Purchase received. Refresh your status in a moment while we confirm it.");
      await premium.refetch(); await allowance.refetch();
      void queryClient.invalidateQueries({ queryKey: ["chat-access"] });
    } catch (error) {
      const cancelled = Boolean(error && typeof error === "object" && "userCancelled" in error && error.userCancelled === true);
      if (!cancelled) setMessage(friendlyError(error, "We couldn’t complete that purchase. Please try again."));
      else if (webCheckout) {
        // A UPI payment can complete after the window closes; the webhook then starts the pass.
        const latest = await premium.refetch();
        setMessage(latest.data?.active ? "Your Plus pass is active. Enjoy a little more possibility." : "Payment window closed. If you completed a payment, your pass will appear here within a few minutes (tap Refresh).");
      }
    } finally { if (!leaving) setBusy(false); }
  };
  return (
    <Screen scroll testID="premium-screen" header={<ScreenHeader title="Paire Plus" />} footer={
      <YStack gap="$2">
        <Text textAlign="center" fontSize="$2" color="$textMuted">{priceLabel} for {offer ? `${offer.days} days` : plan.detail.toLowerCase()} · one-time payment · no auto-renewal</Text>
        <PrimaryButton testID="premium-purchase" loading={busy} disabled={!canPurchase} onPress={() => void act()}>{premium.data?.active ? "Your pass is active" : upiSubmitted ? "Confirming your UPI payment" : canPurchase ? (byUpi ? `Pay ${priceLabel} by UPI · ${buyLabel}` : `Get ${buyLabel} · ${priceLabel}`) : "Plus is coming soon"}</PrimaryButton>
        {byCcavenue && !ccavenueOnly && ready ? <SecondaryButton testID="premium-ccavenue" disabled={busy} onPress={() => void payByCcavenue()}>{`Pay ${priceLabel} by card, netbanking or wallet`}</SecondaryButton> : null}
        <Text textAlign="center" fontSize="$1" color="$textMuted">{upiSubmitted ? "Thanks! Your pass starts as soon as we confirm your UPI payment, usually within a few hours." : canPurchase ? (byUpi ? `Pay by UPI straight to Paire: scan the QR code, or open PhonePe, Google Pay, Paytm or any UPI app.${byCcavenue ? " Or pay by card, netbanking or wallet through CCAvenue." : ""}` : ccavenueOnly ? "Pay securely with cards, UPI, netbanking or wallets via CCAvenue. You'll come back here after paying." : webCheckout ? "Paire is owned by KraftAI, so you'll see KraftAI on the payment page and on your bank statement. Pay securely with UPI, cards or netbanking via Razorpay; you'll come back here after paying." : "Pay securely through your app store.") : premium.data?.active ? `Available until ${new Date(premium.data.expiresAt!).toLocaleString("en-IN")}.` : "Purchases aren’t available yet. You won’t be charged."}</Text>
      </YStack>
    }>
      <YStack paddingTop="$4" gap="$5">
        <YStack width={58} height={58} borderRadius={20} backgroundColor="$primarySoft" alignItems="center" justifyContent="center">
          <Icon name="sparkles" size={28} color="primary" />
        </YStack>
        <YStack gap="$2">
          <Text color="$primary" fontSize="$2" fontWeight="700" letterSpacing={2}>{`PAIRE PLUS · FROM ₹${fromPerDay} A DAY`}</Text>
          <Text fontSize={34} lineHeight={40} fontWeight="700" accessibilityRole="header">More reach.{"\n"}Never more rules.</Text>
          <Text fontSize="$4" color="$textMuted" lineHeight={24}>{paidChat ? "Matching and safety are free. Plus is a pass for meeting more people, with messaging included while it runs: no subscription, no auto-renewal." : "Everything that matters is free. Plus is a pass for when you want to meet more people: no subscription, no auto-renewal."}</Text>
        </YStack>
        <YStack gap="$2" accessibilityRole="radiogroup" accessibilityLabel="Plus pass duration">
          {plans.map((item) => {
            const active = selected === item.id;
            const view = webCheckout ? webPlan(item) : null;
            const deal = Boolean(view && item.bonusDays);
            return (
              <Pressable key={item.id} testID={`premium-plan-${item.id}`} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`${view?.label ?? item.label}, ${item.priceInr} rupees, ${view ? `${view.days} days, ${view.perDay} rupees a day` : item.detail}, no auto-renewal`} onPress={() => setSelected(item.id)}>
                <YStack borderWidth={active || deal ? 2 : 1} borderColor={active ? "$primary" : deal ? "$primary" : "$border"} borderRadius={20} backgroundColor={active ? "$primarySoft" : "$backgroundStrong"} overflow="hidden">
                  {deal ? (
                    <XStack testID="premium-month-offer" backgroundColor="$primary" paddingHorizontal="$4" paddingVertical={6} alignItems="center" gap="$2">
                      <Text fontSize="$2" aria-hidden>🎁</Text>
                      <Text fontSize="$2" fontWeight="700" color="$primaryForeground" flex={1}>{MONTH_OFFER}</Text>
                      <Text fontSize="$1" fontWeight="700" color="$primaryForeground">{`SAVE ${view!.savePercent}%`}</Text>
                    </XStack>
                  ) : null}
                  <XStack padding="$4" alignItems="center" gap="$3">
                    <Icon name={active ? "radio-button-on" : "radio-button-off"} color={active ? "primary" : "textMuted"} />
                    <YStack flex={1} gap={3}>
                      <Text fontSize="$5" fontWeight="700">{view?.label ?? item.label}</Text>
                      <Text fontSize="$2" color="$textMuted">{view ? view.detail : nativeBillingAvailable ? item.detail : `₹${dailyPrice(item.priceInr, item.days)}/day · ${item.detail}`}</Text>
                    </YStack>
                    <YStack alignItems="flex-end" gap={2}>
                      {view ? <Text fontSize={deal ? "$7" : "$6"} fontWeight="700" color={deal ? "$primary" : "$text"}>{`₹${view.perDay}/day`}</Text> : null}
                      <Text fontSize={view ? "$2" : "$6"} fontWeight={view ? "400" : "700"} color={view ? "$textMuted" : "$text"}>{products.data?.find((product) => product.identifier === item.productId)?.priceString ?? `₹${item.priceInr}${view ? " total" : ""}`}</Text>
                      {!view ? <Text fontSize="$1" fontWeight="700" color="$primary">{products.data?.length ? item.detail : item.badge}</Text> : null}
                    </YStack>
                  </XStack>
                </YStack>
              </Pressable>
            );
          })}
        </YStack>
        {premium.data?.previousPaymentFailed && !openOrder ? (
          <YStack testID="premium-previous-failed" padding="$3" borderRadius="$4" backgroundColor="$primarySoft" gap="$1">
            <Text fontWeight="700">Your earlier payment didn't go through</Text>
            <Text fontSize="$2" lineHeight={20}>You weren't charged. Plus is now paid by UPI: choose a pass, then scan the QR code or open PhonePe, Google Pay or Paytm.</Text>
          </YStack>
        ) : null}
        {message ? <Text accessibilityLiveRegion="polite" color="$textMuted" lineHeight={22}>{message}</Text> : null}
        {byUpi && openOrder && !upiSubmitted && !premium.data?.active ? (
          <UpiPayPanel order={openOrder} onSubmitted={(next) => { setShownOrder(next); void upiOrder.refetch(); }} />
        ) : null}
        {premium.data?.purchaseBlockReason === "verification-required" ? <YStack gap="$2"><Text color="$textMuted">Verify your photos before buying a pass, so you can use it straight away.</Text><SecondaryButton onPress={() => navigation.navigate("Verification")}>Verify my photos</SecondaryButton></YStack> : null}
        <SecondaryButton onPress={() => void refreshStatus()} loading={premium.isFetching}>Refresh pass status</SecondaryButton>
        {nativeBillingAvailable ? <SecondaryButton loading={busy} onPress={() => void act(true)}>Restore purchases</SecondaryButton> : null}
        <YStack gap="$3">
          <Text fontSize="$5" fontWeight="700">What Plus adds</Text>
          {[
            ...(paidChat ? [["Unlimited messaging", `Send messages in all your chats while your pass runs. Only want to chat? Unlimited Chat is ₹${chat?.unlock.priceInr ?? 49} once, for messaging only, and never expires.`]] : []),
            [`${Math.round(ALLOWANCE.plus.likes / ALLOWANCE.free.likes)}× the likes`, `${ALLOWANCE.plus.likes} likes and ${ALLOWANCE.plus.supers} Super Likes a day, instead of ${ALLOWANCE.free.likes} and ${ALLOWANCE.free.supers}.`],
            ["Priority likes", "Your likes are listed ahead of other plain likes in their “Likes you”. A note still beats everything, so write one."],
            ["Age-gap filter", "Show only Silver Foxes and Cougars (35+), or only people into someone older, and see each person's side on their card."],
            ["A pass, not a trap", `${webCheckout ? "1 day, 7 days or 2 months" : "1 day, 7 days or 30 days"}. It simply ends: no auto-renewal, no cancellation hunt.`]
          ].map(([title, description]) => (
            <XStack key={title} gap="$3" alignItems="flex-start">
              <Icon name="add-circle-outline" color="primary" size={22} />
              <YStack flex={1} gap={2}><Text fontWeight="700">{title}</Text><Text color="$textMuted" fontSize="$2" lineHeight={20}>{description}</Text></YStack>
            </XStack>
          ))}
        </YStack>
        <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor="$backgroundSoft">
          <XStack gap="$2" alignItems="center"><Icon name="heart-outline" size={19} color="primary" /><Text fontWeight="700" flex={1}>Free forever, for everyone</Text></XStack>
          <Text fontSize="$2" color="$textMuted" lineHeight={21}>{paidChat ? "Joining, see everyone who likes you, mutual matching, likes with notes, reading every message you receive, Vibe first, Duos, AI icebreakers, every privacy control (incognito, private photos, notes only, I'll message first), photo verification, and reporting, blocking and unmatching. Sending messages needs Plus or Unlimited Chat. Prices are the same for men and women." : "See everyone who likes you, chat with your matches, likes with notes, Vibe first, Duos, AI icebreakers, every privacy control (incognito, private photos, notes only, I'll message first) and photo verification. Prices are the same for men and women."}</Text>
          {chat?.enforceFrom ? <Text fontSize="$2" color="$text" lineHeight={21}>{`From ${new Date(chat.enforceFrom).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}, sending messages will need Paire Plus or a one-time ₹${chat.unlock.priceInr} Unlimited Chat unlock. Reading messages stays free.`}</Text> : null}
          {allowance.data && !allowance.isError ? <Text fontSize="$2" color="$textMuted" lineHeight={21}>Your current allowance: {allowance.data.limits.likes} likes and {allowance.data.limits.supers} Super Likes per day. Resets daily at {resetTime}.</Text> : <Text fontSize="$2" color="$textMuted">Free discovery limits reset every day.</Text>}
          <Text fontSize="$1" color="$textMuted">{byUpi ? "Prices include taxes. You pay once by UPI, straight to Paire; nothing renews." : ccavenueOnly ? "Prices include taxes. You pay once through CCAvenue; nothing renews." : webCheckout ? "Prices include taxes. You pay once through Razorpay to KraftAI, which owns Paire; nothing renews." : "Store prices are shown before payment when passes are available."} Paying never guarantees a match, and safety is never for sale.</Text>
          <Text fontSize="$1" color="$primary" accessibilityRole="link" onPress={() => void Linking.openURL(legal.refundsUrl)}>Cancellation and refund policy</Text>
        </YStack>
      </YStack>
    </Screen>
  );
}
