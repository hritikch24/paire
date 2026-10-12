import type { ReactNode } from "react";
import { Spinner, Text, YStack, useTheme } from "tamagui";
import { Icon, IconName } from "./Icon";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  message?: string;
  children?: ReactNode;
  testID?: string;
};

export function EmptyState({ icon, title, message, children, testID }: EmptyStateProps) {
  return (
    <YStack testID={testID} flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
      <YStack
        width={72}
        height={72}
        borderRadius={36}
        backgroundColor="$primarySoft"
        alignItems="center"
        justifyContent="center"
      >
        <Icon name={icon} size={34} color="primary" />
      </YStack>
      <Text fontSize="$6" fontWeight="700" textAlign="center">
        {title}
      </Text>
      {message ? (
        <Text color="$textMuted" textAlign="center" maxWidth={320}>
          {message}
        </Text>
      ) : null}
      {children ? (
        <YStack gap="$2" width="100%" maxWidth={320} marginTop="$2">
          {children}
        </YStack>
      ) : null}
    </YStack>
  );
}

export function LoadingView({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" gap="$3" padding="$6">
      <Spinner size="large" color={theme.primary?.val} />
      {label ? <Text color="$textMuted">{label}</Text> : null}
    </YStack>
  );
}
