import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Linking } from "react-native";
import { Text, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "../../components/MuseButton";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { legal } from "../../config/legal";
import type { AuthStackParamList } from "../../navigation/types";

const TOPICS = [
  {
    title: "Forgot your password?",
    body: "Use \"Forgot password?\" on the sign-in screen and we'll email you a reset link."
  },
  {
    title: "No longer have access to your email?",
    body: "Contact support from an address we can reply to and tell us the email on your account."
  },
  {
    title: "Account disabled?",
    body: "Accounts that break our Community Guidelines can be suspended. Contact support if you think this was a mistake."
  }
];

export function AuthHelpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  return (
    <Screen scroll>
      <ScreenHeader title="Help signing in" />
      <YStack gap="$3">
        {TOPICS.map((topic) => (
          <YStack key={topic.title} gap="$1" backgroundColor="$backgroundStrong" padding="$4" borderRadius="$5" borderWidth={1} borderColor="$border">
            <Text fontWeight="700" fontSize="$4">
              {topic.title}
            </Text>
            <Text color="$textMuted">{topic.body}</Text>
          </YStack>
        ))}
        <PrimaryButton onPress={() => navigation.navigate("ForgotPassword")}>Reset my password</PrimaryButton>
        {legal.supportEmail ? (
          <SecondaryButton onPress={() => void Linking.openURL(`mailto:${legal.supportEmail}?subject=Paire%20sign-in%20help`)}>
            Email {legal.supportEmail}
          </SecondaryButton>
        ) : null}
        <SecondaryButton onPress={() => void Linking.openURL(legal.websiteUrl)}>
          Visit our website
        </SecondaryButton>
      </YStack>
    </Screen>
  );
}
