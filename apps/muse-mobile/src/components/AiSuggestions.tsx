import { Pressable } from "react-native";
import { Spinner, Text, XStack, YStack, useTheme } from "tamagui";
import { Icon } from "./Icon";

/** Tappable Paire AI suggestions (icebreakers, bio drafts). */
export function AiSuggestions({
  title,
  suggestions,
  loading,
  onPick,
  testID
}: {
  title: string;
  suggestions: string[];
  loading?: boolean;
  onPick: (text: string) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <YStack gap="$2" width="100%" testID={testID}>
      <XStack alignItems="center" gap="$2">
        <Icon name="sparkles" size={16} color="primary" />
        <Text fontSize="$2" fontWeight="700" color="$primary" textTransform="uppercase">
          {title}
        </Text>
        {loading ? <Spinner size="small" color={theme.primary?.val} /> : null}
      </XStack>
      {suggestions.map((line, index) => (
        <Pressable
          key={line}
          testID={testID ? `${testID}-${index}` : undefined}
          accessibilityRole="button"
          accessibilityHint="Puts this text in the message box so you can edit it"
          onPress={() => onPick(line)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <XStack
            gap="$2"
            alignItems="center"
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$border"
            borderRadius="$4"
            paddingHorizontal="$3"
            paddingVertical="$3"
          >
            <Text flex={1} fontSize="$3">
              {line}
            </Text>
            <Icon name="arrow-up-circle-outline" size={20} color="primary" />
          </XStack>
        </Pressable>
      ))}
    </YStack>
  );
}
