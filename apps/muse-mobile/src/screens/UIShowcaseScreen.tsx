import { Text, XStack, YStack, Card } from "tamagui";
import { Screen } from "../components/Screen";
import { MuseInput } from "../components/MuseInput";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";

export function UIShowcaseScreen() {
  return (
    <Screen scrollable>
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="700">
          Muse UI
        </Text>
        <MuseInput placeholder="Sample input" />
        <XStack gap="$3" flexWrap="wrap">
          <PrimaryButton flex={1}>Primary</PrimaryButton>
          <SecondaryButton flex={1}>Secondary</SecondaryButton>
        </XStack>
        <Card padding="$4" borderRadius="$4" backgroundColor="$card" bordered>
          <Text fontWeight="700">Feature card</Text>
          <Text color="$textMuted">Reusable surfaces with soft depth.</Text>
        </Card>
      </YStack>
    </Screen>
  );
}
