import { Platform } from "react-native";
import { MuseInput } from "./MuseInput";
import { Text, XStack, YStack } from "tamagui";
import { LAUNCH_OFFER } from "../config/launch-offer";
import { useLaunchOffer } from "../hooks/useLaunchOffer";
import { SecondaryButton } from "./MuseButton";
import { friendlyError } from "../services/errors";
export function LaunchOfferCode({ offer, available }: { offer: ReturnType<typeof useLaunchOffer>; available: boolean }) {
  if (Platform.OS !== "web" || (!offer.quote.data?.active && !offer.code)) return null;
  return <YStack padding="$3" borderRadius="$4" backgroundColor="$primarySoft" gap="$2" testID="launch-offer-code">
    <Text fontWeight="700">30–31 October · your first hello costs less</Text>
    <Text fontSize="$2">{`Offer ends ${LAUNCH_OFFER.endLabel}. Promo codes are for the first 250 new members joining on these dates, on one purchase per account. All codes share the same limit.`}</Text>
    {available ? <><XStack gap="$2"><MuseInput flex={1} accessibilityLabel="Promo code" placeholder="Have a promo code?" maxLength={32} autoCorrect={false} autoCapitalize="characters" onSubmitEditing={offer.apply} value={offer.input} onChangeText={offer.setInput} /><SecondaryButton disabled={offer.quote.isFetching || !offer.input.trim()} onPress={offer.apply}>Apply</SecondaryButton></XStack>
    {offer.code ? <SecondaryButton onPress={offer.remove}>Remove promo code</SecondaryButton> : null}</> : null}
    {offer.quote.isError ? <Text accessibilityRole="alert">{friendlyError(offer.quote.error, "We couldn't verify that code. Remove it or try again.")}</Text> : offer.quote.data?.code ? <Text accessibilityLiveRegion="polite">{`${offer.quote.data.code} applied. Your final price is shown below. Pay securely through KraftAI.`}</Text> : <Text fontSize="$1">{offer.quote.data?.couponAvailable ? `${offer.quote.data.remaining} new-member claims remaining. Enter a marketing code for an extra saving.` : "New-member promo eligibility is checked at checkout."}</Text>}
  </YStack>;
}
