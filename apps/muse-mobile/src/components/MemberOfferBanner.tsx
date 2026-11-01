import { useState } from "react";
import { Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import type { MemberOffer } from "../config/member-offer";
import { memberPrice } from "../config/member-offer";
import { formatInr } from "../config/launch-offer";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { dismissOffer, offerDismissed } from "../utils/offerDismissal";

export function MemberOfferBanner({ offer, compact = false, onExplore }: { offer: MemberOffer | null | undefined; compact?: boolean; onExplore?: () => void }) {
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const key = offer ? `member-${offer.id}-${offer.discountPercent}` : "";
  if (Platform.OS !== "web" || !offer || offer.expiresAt <= Date.now() || (compact && (hiddenKey === key || offerDismissed(key)))) return null;
  const end = new Date(offer.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return <YStack testID="member-offer-banner" backgroundColor="$primarySoft" padding="$4" marginHorizontal={compact ? "$4" : 0} marginBottom={compact ? "$3" : 0} borderRadius={20} gap="$2">
    <Text fontSize="$2" color="$primary" fontWeight="700">{offer.city ? `YOUR PLUS OFFER · ${offer.city.toUpperCase()}` : "YOUR PLUS OFFER"}</Text>
    <Text fontSize={compact ? 21 : 26} fontWeight="700">{`${offer.discountPercent}% off Monthly & Lifetime Plus`}</Text>
    <Text fontSize="$2" lineHeight={21}>{offer.reason === "both-limits" ? "You unlocked our largest saving by using your free likes and Super Likes." : offer.reason === "daily-limit" ? "Your free allowance unlocked a little more possibility." : offer.reason === "regular-use" ? "A little thank-you for coming back to connect." : "Welcome to more ways to connect. Choose a pass at your pace."}</Text>
    {offer.interest ? <Text fontSize="$2">{`Into ${offer.interest}? Try a note about it with your next like.`}</Text> : null}
    <Text fontWeight="700">{`Monthly ${formatInr(memberPrice("month", offer.discountPercent))} · Lifetime ${formatInr(memberPrice("lifetime", offer.discountPercent))}`}</Text>
    <Text fontSize="$1" color="$textMuted">{`Ends ${end} IST. Your expiry stays fixed when you unlock a better discount. No auto-renewal; payment never guarantees a match.`}</Text>
    {compact && onExplore ? <XStack gap="$2"><YStack flex={1}><PrimaryButton onPress={onExplore}>See my offer</PrimaryButton></YStack><SecondaryButton onPress={() => { dismissOffer(key); setHiddenKey(key); }}>Maybe later</SecondaryButton></XStack> : null}
  </YStack>;
}
