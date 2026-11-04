import { useState } from "react";
import { Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import type { MemberOffer } from "../config/member-offer";
import { memberPrice } from "../config/member-offer";
import { formatInr } from "../config/launch-offer";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { dismissOffer, offerDismissed } from "../utils/offerDismissal";

/** Shown at the moment free likes run out, using the member's own server-earned offer. Free likes reset tomorrow, and the copy says so. */
export function OutOfLikesBar({ offer, likesLeft, onOpen }: { offer: MemberOffer | null | undefined; likesLeft: number | null | undefined; onOpen: () => void }) {
  const day = new Date().toISOString().slice(0, 10);
  const key = offer ? `out-of-likes-${offer.id}-${day}` : "";
  const [hidden, setHidden] = useState(false);
  if (Platform.OS !== "web" || !offer || likesLeft !== 0 || offer.expiresAt <= Date.now() || hidden || offerDismissed(key)) return null;
  const end = new Date(offer.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return <YStack testID="out-of-likes-bar" marginHorizontal="$4" marginBottom="$2" padding="$3" gap="$2" borderRadius={20} backgroundColor="$primarySoft">
    <Text fontWeight="700" fontSize="$4">{`You've used today's free likes`}</Text>
    <Text fontSize="$2" lineHeight={20}>{`Free likes come back tomorrow. Or keep going now: Monthly Plus is ${formatInr(memberPrice("month", offer.discountPercent))} (${offer.discountPercent}% off) until ${end} IST.`}</Text>
    <XStack gap="$2"><YStack flex={1}><PrimaryButton onPress={onOpen}>See my offer</PrimaryButton></YStack><SecondaryButton onPress={() => { dismissOffer(key); setHidden(true); }}>Not now</SecondaryButton></XStack>
  </YStack>;
}
