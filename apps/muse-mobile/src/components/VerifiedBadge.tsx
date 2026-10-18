import { Text, XStack } from "tamagui";
import { Icon } from "./Icon";

/**
 * "Verified": photos checked against a live selfie. Shown on cards and profiles;
 * the server decides who has it (photoVerified), never the app.
 */
export function VerifiedBadge({ onDark = false, size = "small" }: { onDark?: boolean; size?: "small" | "large" }) {
  const large = size === "large";
  return (
    <XStack
      testID="verified-badge"
      accessibilityLabel="Verified: photos checked with a live selfie"
      alignItems="center"
      gap={4}
      paddingHorizontal={large ? 10 : 7}
      paddingVertical={large ? 4 : 2}
      borderRadius={99}
      backgroundColor={onDark ? "rgba(29, 155, 240, 0.92)" : "#E8F4FD"}
      borderWidth={onDark ? 0 : 1}
      borderColor="#9CCDF2"
      alignSelf="flex-start"
    >
      <Icon name="checkmark-circle" size={large ? 16 : 13} color={onDark ? "#FFFFFF" : "#1D9BF0"} />
      <Text fontSize={large ? 13 : 11} fontWeight="700" color={onDark ? "#FFFFFF" : "#0B6CB0"}>Verified</Text>
    </XStack>
  );
}
