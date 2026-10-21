import { Platform, type ViewStyle } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "./Icon";
import { PrimaryButton } from "./MuseButton";

/** Decorative silhouettes: locked responses never include the real photos or identities. */
export function LockedLikes({ count, hasMore, onUpgrade }: { count: number; hasMore?: boolean; onUpgrade: () => void }) {
  return <YStack testID="likes-locked" marginHorizontal="$4" padding="$4" gap="$3" borderRadius={22} backgroundColor="$primarySoft" alignItems="center">
    <XStack gap="$2" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {Array.from({ length: Math.min(3, count) }, (_, index) => <YStack key={index} width={70} height={88} borderRadius={18} backgroundColor="$backgroundStrong" alignItems="center" justifyContent="center" overflow="hidden">
        <YStack alignItems="center" gap={4} style={Platform.OS === "web" ? ({ filter: "blur(7px)", opacity: 0.7 } as ViewStyle) : { opacity: 0.5 }}>
          <YStack width={27} height={27} borderRadius={20} backgroundColor="$primary" />
          <YStack width={49} height={39} borderRadius={24} backgroundColor="$primary" />
        </YStack>
      </YStack>)}
    </XStack>
    <XStack gap="$2" alignItems="center"><Icon name="lock-closed" color="primary" size={17} /><Text fontSize="$5" fontWeight="700" textAlign="center">{count === 1 && !hasMore ? "Someone liked you" : `${count}${hasMore ? "+" : ""} people liked you`}</Text></XStack>
    <Text fontSize="$2" color="$textMuted" lineHeight={21} textAlign="center">Get Paire Plus to see who likes you. Your likes include people outside your search filters.</Text>
    <PrimaryButton testID="likes-upgrade" onPress={onUpgrade} alignSelf="stretch">See who likes you with Plus</PrimaryButton>
  </YStack>;
}
