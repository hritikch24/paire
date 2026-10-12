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
import { ALLOWANCE, dailyPrice, PREMIUM_PLANS, PremiumPlanId } from "../config/premium";
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
import { useAuthStore } from "../store/authStore";

export function PremiumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [selected, setSelected] = useState<PremiumPlanId>("week");
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
  const ready = Boolean(premium.data && !premium.isError && !premium.data.active);
  // Web: Razorpay checkout at server prices. App: the store's localised product.
  const canPurchase = webCheckout ? ready && premium.data?.webPurchaseAvailable === true : Boolean(product && ready && premium.data?.purchaseAvailable);
  const priceLabel = webCheckout ? `₹${plan.priceInr}` : (product?.priceString ?? `₹${plan.priceInr}`);
  const act = async (restore = false) => {
    if (!uid || (!restore && !webCheckout && !product)) return;
    setBusy(true); setMessage(null);
    try {
      const result = restore ? await restorePasses(uid) : webCheckout ? await purchaseWebPass(plan.id, colors.gradient[1] ?? "#B83A5E") : await purchasePass(uid, product!);
      const pending = "pending" in result && result.pending === true;
      setMessage(result.active ? "Your Plus pass is active. Enjoy a little more possibility." : restore ? "No active pass was found. Consumable passes may need support to recover after reinstalling." : pending ? "Payment received. Your bank is still confirming it; your pass starts as soon as it does (usually a few minutes). Refresh below." : "Purchase received. Refresh your status in a moment while we confirm it.");
      await premium.refetch(); await allowance.refetch();
    } catch (error) {
      const cancelled = Boolean(error && typeof error === "object" && "userCancelled" in error && error.userCancelled === true);
      if (!cancelled) setMessage(friendlyError(error, "We couldn’t complete that purchase. Please try again."));
      else if (webCheckout) {
        // A UPI payment can complete after the window closes; the webhook then starts the pass.
        const latest = await premium.refetch();
        setMessage(latest.data?.active ? "Your Plus pass is active. Enjoy a little more possibility." : "Payment window closed. If you completed a payment, your pass will appear here within a few minutes (tap Refresh).");
      }
    } finally { setBusy(false); }
  };
  return (
    <Screen scroll testID="premium-screen" header={<ScreenHeader title="Paire Plus" />} footer={
      <YStack gap="$2">
        <Text textAlign="center" fontSize="$2" color="$textMuted">{priceLabel} for {plan.detail.toLowerCase()} · one-time payment · no auto-renewal</Text>
        <PrimaryButton testID="premium-purchase" loading={busy} disabled={!canPurchase} onPress={() => void act()}>{premium.data?.active ? "Your pass is active" : canPurchase ? `Get ${plan.label} · ${priceLabel}` : "Plus is coming soon"}</PrimaryButton>
        <Text textAlign="center" fontSize="$1" color="$textMuted">{canPurchase ? (webCheckout ? "Pay securely with UPI, cards or netbanking via Razorpay." : "Pay securely through your app store.") : premium.data?.active ? `Available until ${new Date(premium.data.expiresAt!).toLocaleString("en-IN")}.` : "Purchases aren’t available yet. You won’t be charged."}</Text>
      </YStack>
    }>
      <YStack paddingTop="$4" gap="$5">
        <YStack width={58} height={58} borderRadius={20} backgroundColor="$primarySoft" alignItems="center" justifyContent="center">
          <Icon name="sparkles" size={28} color="primary" />
        </YStack>
        <YStack gap="$2">
          <Text color="$primary" fontSize="$2" fontWeight="700" letterSpacing={2}>PAIRE PLUS · FROM ₹10 A DAY</Text>
          <Text fontSize={34} lineHeight={40} fontWeight="700" accessibilityRole="header">More reach.{"\n"}Never more rules.</Text>
          <Text fontSize="$4" color="$textMuted" lineHeight={24}>Everything that matters is free. Plus is a pass for when you want to meet more people: no subscription, no auto-renewal.</Text>
        </YStack>
        <YStack gap="$2" accessibilityRole="radiogroup" accessibilityLabel="Plus pass duration">
          {PREMIUM_PLANS.map((item) => {
            const active = selected === item.id;
            return (
              <Pressable key={item.id} testID={`premium-plan-${item.id}`} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`${item.label}, ${item.priceInr} rupees, ${item.detail}, no auto-renewal`} onPress={() => setSelected(item.id)}>
                <XStack borderWidth={active ? 2 : 1} borderColor={active ? "$primary" : "$border"} borderRadius={20} backgroundColor={active ? "$primarySoft" : "$backgroundStrong"} padding="$4" alignItems="center" gap="$3">
                  <Icon name={active ? "radio-button-on" : "radio-button-off"} color={active ? "primary" : "textMuted"} />
                  <YStack flex={1} gap={3}>
                    <Text fontSize="$5" fontWeight="700">{item.label}</Text>
                    <Text fontSize="$2" color="$textMuted">{nativeBillingAvailable ? item.detail : `₹${dailyPrice(item.priceInr, item.days)}/day · ${item.detail}`}</Text>
                  </YStack>
                  <YStack alignItems="flex-end" gap={4}>
                    <Text fontSize="$6" fontWeight="700">{products.data?.find((product) => product.identifier === item.productId)?.priceString ?? `₹${item.priceInr}`}</Text>
                    <Text fontSize="$1" fontWeight="700" color="$primary">{products.data?.length ? item.detail : item.badge}</Text>
                  </YStack>
                </XStack>
              </Pressable>
            );
          })}
        </YStack>
        {message ? <Text accessibilityLiveRegion="polite" color="$textMuted" lineHeight={22}>{message}</Text> : null}
        {premium.data?.purchaseBlockReason === "verification-required" ? <YStack gap="$2"><Text color="$textMuted">Verify your photos before buying a pass, so you can use it straight away.</Text><SecondaryButton onPress={() => navigation.navigate("Verification")}>Verify my photos</SecondaryButton></YStack> : null}
        <SecondaryButton onPress={() => void premium.refetch()} loading={premium.isFetching}>Refresh pass status</SecondaryButton>
        {nativeBillingAvailable ? <SecondaryButton loading={busy} onPress={() => void act(true)}>Restore purchases</SecondaryButton> : null}
        <YStack gap="$3">
          <Text fontSize="$5" fontWeight="700">What Plus adds</Text>
          {[
            ["4× the likes", `${ALLOWANCE.plus.likes} likes and ${ALLOWANCE.plus.supers} Super Likes a day, instead of ${ALLOWANCE.free.likes} and ${ALLOWANCE.free.supers}.`],
            ["Priority likes", "Your likes are listed ahead of other plain likes in their “Likes you”. A note still beats everything, so write one."],
            ["Age-gap filter", "Show only Silver Foxes and Cougars (35+), or only people into someone older, and see each person's side on their card."],
            ["A pass, not a trap", "1 day, 7 days or 30 days. It simply ends: no auto-renewal, no cancellation hunt."]
          ].map(([title, description]) => (
            <XStack key={title} gap="$3" alignItems="flex-start">
              <Icon name="add-circle-outline" color="primary" size={22} />
              <YStack flex={1} gap={2}><Text fontWeight="700">{title}</Text><Text color="$textMuted" fontSize="$2" lineHeight={20}>{description}</Text></YStack>
            </XStack>
          ))}
        </YStack>
        <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor="$backgroundSoft">
          <XStack gap="$2" alignItems="center"><Icon name="heart-outline" size={19} color="primary" /><Text fontWeight="700" flex={1}>Free forever, for everyone</Text></XStack>
          <Text fontSize="$2" color="$textMuted" lineHeight={21}>See everyone who likes you, unlimited chat, likes with notes, Vibe first, Duos, AI icebreakers, every privacy control (incognito, private photos, notes only, I'll message first) and photo verification. Prices are the same for men and women.</Text>
          {allowance.data && !allowance.isError ? <Text fontSize="$2" color="$textMuted" lineHeight={21}>Your current allowance: {allowance.data.limits.likes} likes and {allowance.data.limits.supers} Super Likes per day. Resets daily at {resetTime}.</Text> : <Text fontSize="$2" color="$textMuted">Free discovery limits reset every day.</Text>}
          <Text fontSize="$1" color="$textMuted">{webCheckout ? "Prices include taxes. You pay once through Razorpay; nothing renews." : "Store prices are shown before payment when passes are available."} Paying never guarantees a match, and safety is never for sale.</Text>
          <Text fontSize="$1" color="$primary" accessibilityRole="link" onPress={() => void Linking.openURL(legal.refundsUrl)}>Cancellation and refund policy</Text>
        </YStack>
      </YStack>
    </Screen>
  );
}
