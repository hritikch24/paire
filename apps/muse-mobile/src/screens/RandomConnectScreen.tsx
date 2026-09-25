import { useMemo, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/stacks/AppStack";
import { createRoomId } from "../utils/call";
import { demoProfiles } from "../data/demoProfiles";
import { useAuthStore } from "../store/authStore";
import * as Haptics from "expo-haptics";
import { useResponsiveFlags } from "../hooks/useResponsiveFlags";

export function RandomConnectScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { isCompact } = useResponsiveFlags();
  const profile = useAuthStore((state) => state.profile);
  const [seed] = useState(() => Date.now());
  const demoTarget = useMemo(() => {
    if (!demoProfiles.length) {
      return { uid: "demo_anya", displayName: "Muse" };
    }
    const index = Math.abs(seed) % demoProfiles.length;
    return demoProfiles[index];
  }, [seed]);

  const handleRandomChat = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Chat", {
      matchId: `random-${seed}`,
      targetUid: demoTarget.uid
    });
  };

  const handleRandomCall = async (video: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Call", { roomId: createRoomId(), video });
  };

  return (
    <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} gap={isCompact ? "$3" : "$4"}>
        <YStack gap="$2">
          <Text fontSize="$7" fontWeight="700">
            Muse Now
          </Text>
          <Text color="$textMuted">
            Jump into a spontaneous chat or call with someone new who matches your vibe.
          </Text>
        </YStack>

        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$3"
        >
          <Text fontWeight="700">How it works</Text>
          <Text fontSize="$2" color="$textMuted">
            We pair you with a nearby Muse for a quick hello. If it feels right, you can
            keep chatting or exchange a call link.
          </Text>
          <Text fontSize="$2" color="$textMuted">
            Your safety comes first. You can leave any time and report or block instantly.
          </Text>
        </YStack>

        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$3"
        >
          <Text fontWeight="700">Start with a Muse</Text>
          <Text fontSize="$2" color="$textMuted">
            {profile?.displayName ? `${profile.displayName}, ` : ""}say hi and let the vibe
            guide you.
          </Text>
          <PrimaryButton accessibilityLabel="Start random chat" onPress={handleRandomChat}>
            Start random chat
          </PrimaryButton>
          <XStack gap="$3" flexWrap="wrap">
            <SecondaryButton onPress={() => handleRandomCall(false)}>Random audio call</SecondaryButton>
            <SecondaryButton onPress={() => handleRandomCall(true)}>Random video call</SecondaryButton>
          </XStack>
        </YStack>

        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontWeight="700">Safety reminders</Text>
          <Text fontSize="$2" color="$textMuted">
            Meet in public, keep personal info private, and trust your instincts.
          </Text>
          <SecondaryButton onPress={() => navigation.navigate("SafetyCenter")}>
            Safety center
          </SecondaryButton>
        </YStack>
      </YStack>
    </Screen>
  );
}
