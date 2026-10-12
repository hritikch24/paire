import { Pressable } from "react-native";
import { Text, XStack } from "tamagui";

type ChipProps = {
  label: string;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  size?: "sm" | "md";
};

/** Selectable pill used for options, or a static tag when onPress is omitted. */
export function Chip({ label, emoji, selected, onPress, disabled, testID, size = "md" }: ChipProps) {
  const content = (
    <XStack
      alignItems="center"
      gap="$1"
      paddingHorizontal={size === "sm" ? "$2" : "$3"}
      paddingVertical={size === "sm" ? 4 : "$2"}
      borderRadius={999}
      borderWidth={1}
      borderColor={selected ? "$primary" : "$border"}
      backgroundColor={selected ? "$primarySoft" : "$backgroundStrong"}
      opacity={disabled ? 0.5 : 1}
    >
      {emoji ? <Text fontSize={size === "sm" ? "$1" : "$2"}>{emoji}</Text> : null}
      <Text
        fontSize={size === "sm" ? "$1" : "$2"}
        fontWeight={selected ? "700" : "500"}
        color={selected ? "$primary" : "$text"}
      >
        {label}
      </Text>
    </XStack>
  );

  if (!onPress) return content;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      {content}
    </Pressable>
  );
}

type ChipGroupProps<T extends string> = {
  options: Array<{ id: T; label: string; emoji?: string }>;
  selected: T[];
  onToggle: (id: T) => void;
  testIDPrefix?: string;
};

export function ChipGroup<T extends string>({ options, selected, onToggle, testIDPrefix }: ChipGroupProps<T>) {
  return (
    <XStack gap="$2" flexWrap="wrap">
      {options.map((option) => (
        <Chip
          key={option.id}
          testID={testIDPrefix ? `${testIDPrefix}-${option.id}` : undefined}
          label={option.label}
          emoji={option.emoji}
          selected={selected.includes(option.id)}
          onPress={() => onToggle(option.id)}
        />
      ))}
    </XStack>
  );
}
