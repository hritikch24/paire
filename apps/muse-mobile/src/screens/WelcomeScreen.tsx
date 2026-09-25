import { Image } from "react-native";
import { Text, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../navigation/stacks/AuthStack";
import { useAuthStore } from "../store/authStore";
import { createGuestProfile } from "../utils/guestProfile";
import { useResponsiveFlags } from "../hooks/useResponsiveFlags";

export function WelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const setGuest = useAuthStore((state) => state.setGuest);
  const { isCompact } = useResponsiveFlags();

  return (
    <Screen scrollable={isCompact} contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} justifyContent="space-between" gap="$6">
        <YStack gap="$5" flex={1}>
          <YStack gap="$2">
            <Text fontSize="$8" fontWeight="700">
              Muse
            </Text>
            <Text color="$textMuted">
              Thoughtful connections, curated for your energy.
            </Text>
          </YStack>

          <YStack
            backgroundColor="$backgroundStrong"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$border"
            gap="$3"
            width="100%"
            maxWidth={420}
            alignSelf="center"
          >
            <Text fontWeight="700">Start here</Text>
            <Text color="$textMuted" fontSize="$2">
              Choose how you want to continue. You can always switch later.
            </Text>
            <PrimaryButton
              accessibilityLabel="Log in"
              onPress={() => navigation.navigate("AuthHome")}
            >
              Log in
            </PrimaryButton>
            <SecondaryButton
              accessibilityLabel="Create account"
              onPress={() => navigation.navigate("Signup")}
            >
              Create account
            </SecondaryButton>
            <SecondaryButton
              accessibilityLabel="Explore as guest"
              onPress={() => setGuest(createGuestProfile())}
            >
              Explore as guest
            </SecondaryButton>
          </YStack>
        </YStack>

        <YStack alignItems="center" gap="$2">
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 54, height: 54, borderRadius: 18 }}
          />
          <Text color="$textMuted" fontSize="$1">
            A safer way to date, built for real life.
          </Text>
        </YStack>
      </YStack>
    </Screen>
  );
}
