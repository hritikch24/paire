import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Text, XStack, YStack } from "tamagui";
import { Icon, IconName } from "../components/Icon";
import { SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import type { AppStackParamList } from "../navigation/types";

const SIGNALS: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "heart-outline", title: "What you’re looking for", text: "The dating intentions you both choose to share." },
  { icon: "musical-notes-outline", title: "The little things you love", text: "Shared interests, vibes and answers to profile questions." },
  { icon: "options-outline", title: "Preferences that go both ways", text: "Both people’s age, gender and distance preferences shape discovery." }
];

export function VibeGuideScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  return (
    <Screen scroll header={<ScreenHeader title="Behind the vibe" />}>
      <YStack gap="$5" paddingTop="$4">
        <Icon name="sparkles-outline" size={42} color="primary" />
        <YStack gap="$2">
          <Text fontSize={34} lineHeight={40} fontWeight="700" accessibilityRole="header">A reason to say hi.{"\n"}Room to be surprised.</Text>
          <Text color="$textMuted" fontSize="$4" lineHeight={24}>Your vibe score helps sort people by what you both shared. You decide whether there’s a spark.</Text>
        </YStack>
        {SIGNALS.map((signal) => (
          <XStack key={signal.title} gap="$3" padding="$4" backgroundColor="$backgroundStrong" borderWidth={1} borderColor="$border" borderRadius={20}>
            <Icon name={signal.icon} color="primary" /><YStack flex={1} gap="$1"><Text fontWeight="700">{signal.title}</Text><Text color="$textMuted" fontSize="$2" lineHeight={21}>{signal.text}</Text></YStack>
          </XStack>
        ))}
        <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor="$primarySoft">
          <Text fontWeight="700">A starting point, never a promise</Text>
          <Text color="$textMuted" fontSize="$2" lineHeight={21}>The score is a ranking out of 100, not a percentage chance of a relationship. It uses shared profile choices, approximate distance and recent activity. It doesn’t measure attractiveness or confirm safety.</Text>
          <Text color="$textMuted" fontSize="$2" lineHeight={21}>Matching starts with shared profile choices. If you both enable AI vibe matching, Paire AI can refine the order using only selected interests, vibes and dating intentions. AI never overrides mutual preferences. If it’s unavailable, Paire uses its usual ranking.</Text>
        </YStack>
        <SecondaryButton onPress={() => navigation.navigate("Settings")}>Adjust my preferences</SecondaryButton>
      </YStack>
    </Screen>
  );
}
