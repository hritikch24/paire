import { Linking } from "react-native";
import { Screen } from "../components/Screen";
import { SecondaryButton } from "../components/MuseButton";
import { Text, YStack } from "tamagui";
import { useNavigation } from "@react-navigation/native";

export function AuthHelpScreen() {
  const navigation = useNavigation();

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="700">
          Need help signing in?
        </Text>
        <Text color="$textMuted">
          Use your email and a password with at least 6 characters. If you already
          signed up on another device, choose “Continue”.
        </Text>
        <Text fontWeight="600">Contact support</Text>
        <Text color="$textMuted">support@muse.com</Text>
        <SecondaryButton onPress={() => Linking.openURL("mailto:support@muse.com")}>
          Email support
        </SecondaryButton>
        <SecondaryButton onPress={() => navigation.goBack()}>
          Back
        </SecondaryButton>
      </YStack>
    </Screen>
  );
}
