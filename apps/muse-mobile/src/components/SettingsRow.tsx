import type { ReactNode } from "react";
import { Pressable, Switch } from "react-native";
import { Separator, Text, XStack, YStack, useTheme } from "tamagui";
import { Icon, IconName } from "./Icon";

export function SettingsSection({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <YStack gap="$2">
      {title ? (
        <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase" paddingHorizontal="$1">
          {title}
        </Text>
      ) : null}
      <YStack backgroundColor="$backgroundStrong" borderRadius="$5" borderWidth={1} borderColor="$border" overflow="hidden">
        {children}
      </YStack>
      {footer ? (
        <Text fontSize="$1" color="$textMuted" paddingHorizontal="$1">
          {footer}
        </Text>
      ) : null}
    </YStack>
  );
}

type RowProps = {
  icon?: IconName;
  label: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  destructive?: boolean;
  showDivider?: boolean;
  right?: ReactNode;
  testID?: string;
};

export function SettingsRow({
  icon,
  label,
  value,
  description,
  onPress,
  destructive,
  showDivider = true,
  right,
  testID
}: RowProps) {
  const content = (
    <XStack paddingHorizontal="$4" paddingVertical="$3" gap="$3" alignItems="center" minHeight={56}>
      {icon ? <Icon name={icon} size={22} color={destructive ? "error" : "textMuted"} /> : null}
      <YStack flex={1} gap={2}>
        <Text fontSize="$4" color={destructive ? "$error" : "$text"} fontWeight={destructive ? "600" : "500"}>
          {label}
        </Text>
        {description ? (
          <Text fontSize="$2" color="$textMuted">
            {description}
          </Text>
        ) : null}
      </YStack>
      {value ? (
        <Text color="$textMuted" fontSize="$3" numberOfLines={1} maxWidth="45%">
          {value}
        </Text>
      ) : null}
      {right}
      {onPress && !right ? <Icon name="chevron-forward" size={18} color="textMuted" /> : null}
    </XStack>
  );

  return (
    <YStack>
      {showDivider ? <Separator borderColor="$border" /> : null}
      {onPress ? (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </YStack>
  );
}

export function ToggleRow({
  icon,
  label,
  description,
  value,
  onValueChange,
  disabled,
  showDivider = true,
  testID
}: {
  icon?: IconName;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  showDivider?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      showDivider={showDivider}
      right={
        <Switch
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: theme.border?.val, true: theme.primary?.val }}
          thumbColor={value ? theme.primaryForeground?.val : "#FFFFFF"}
        />
      }
    />
  );
}
