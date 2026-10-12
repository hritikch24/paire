import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { IconButton } from "./IconButton";
import { Screen } from "./Screen";

type OnboardingLayoutProps = {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  footer: ReactNode;
  children: ReactNode;
};

export function OnboardingLayout({ step, total, title, subtitle, onBack, footer, children }: OnboardingLayoutProps) {
  return (
    <Screen scroll footer={footer}>
      <XStack alignItems="center" gap="$3" marginBottom="$4" minHeight={44}>
        {onBack ? (
          <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={onBack} size={40} iconSize={26} />
        ) : null}
        <XStack
          flex={1}
          gap={6}
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${total}`}
          accessibilityValue={{ min: 1, max: total, now: step }}
        >
          {Array.from({ length: total }, (_, index) => (
            <YStack
              key={index}
              flex={1}
              height={5}
              borderRadius={3}
              backgroundColor={index < step ? "$primary" : "$border"}
            />
          ))}
        </XStack>
      </XStack>
      <YStack gap="$2" marginBottom="$5">
        <Text fontSize="$8" fontWeight="700" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text color="$textMuted" fontSize="$4">{subtitle}</Text> : null}
      </YStack>
      <YStack gap="$5">{children}</YStack>
    </Screen>
  );
}
