import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { XStack, YStack } from "tamagui";
import { Icon } from "./Icon";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  accessibilityLabel: string;
  testID?: string;
};

export function Checkbox({ checked, onChange, children, accessibilityLabel, testID }: CheckboxProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!checked)}
      hitSlop={6}
    >
      <XStack gap="$3" alignItems="flex-start">
        <YStack
          width={24}
          height={24}
          marginTop={1}
          borderRadius={7}
          borderWidth={2}
          borderColor="$primary"
          backgroundColor={checked ? "$primary" : "transparent"}
          alignItems="center"
          justifyContent="center"
        >
          {checked ? <Icon name="checkmark" size={16} color="primaryForeground" /> : null}
        </YStack>
        <YStack flex={1}>{children}</YStack>
      </XStack>
    </Pressable>
  );
}
