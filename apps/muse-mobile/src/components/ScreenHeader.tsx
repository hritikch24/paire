import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { IconButton } from "./IconButton";

type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  /** Show a back chevron (default) or a close X; set false to hide. */
  back?: "back" | "close" | false;
  onBack?: () => void;
  right?: ReactNode;
  large?: boolean;
};

export function ScreenHeader({ title, subtitle, back = "back", onBack, right, large }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const handleBack = onBack ?? (() => navigation.goBack());

  return (
    <XStack alignItems="center" gap="$2" minHeight={48} marginBottom="$2">
      {back ? (
        <IconButton
          testID="header-back"
          icon={back === "close" ? "close" : "chevron-back"}
          accessibilityLabel={back === "close" ? "Close" : "Go back"}
          onPress={handleBack}
          size={40}
          iconSize={26}
        />
      ) : null}
      <YStack flex={1} minWidth={0}>
        {title ? (
          <Text
            fontSize={large ? "$8" : "$6"}
            fontWeight="700"
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text color="$textMuted" fontSize="$2" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {right ? <XStack gap="$1">{right}</XStack> : null}
    </XStack>
  );
}
