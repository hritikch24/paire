import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useState } from "react";
import { Keyboard } from "react-native";
import { Text, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "../../components/MuseButton";
import { TextField } from "../../components/MuseInput";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { EmptyState } from "../../components/States";
import { env } from "../../config/env";
import { testServerPasswordHelp } from "../../config/testServer";
import { isValidEmail, sendPasswordReset } from "../../services/accountService";
import { errorCode, friendlyError } from "../../services/errors";
import type { AuthStackParamList } from "../../navigation/types";

export function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<AuthStackParamList, "ForgotPassword">>();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!isValidEmail(email) || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      // Don't reveal whether an account exists for this email.
      if (errorCode(err) === "auth/user-not-found") {
        setSent(true);
      } else {
        setError(friendlyError(err, "We couldn't send the email. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  if (env.testServer) {
    return (
      <Screen>
        <ScreenHeader />
        <EmptyState icon="key-outline" title={testServerPasswordHelp.title} message={testServerPasswordHelp.message}>
          <PrimaryButton onPress={() => navigation.goBack()}>Back to sign in</PrimaryButton>
        </EmptyState>
      </Screen>
    );
  }

  if (sent) {
    return (
      <Screen>
        <ScreenHeader />
        <EmptyState
          icon="mail-outline"
          title="Check your inbox"
          message={`If an account exists for ${email.trim()}, we've sent a link to reset your password. It can take a few minutes, so check spam too.`}
        >
          <PrimaryButton onPress={() => navigation.goBack()}>Back to sign in</PrimaryButton>
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={
        <PrimaryButton testID="reset-submit" onPress={handleSend} disabled={!isValidEmail(email)} loading={loading}>
          Send reset link
        </PrimaryButton>
      }
    >
      <ScreenHeader />
      <YStack gap="$2" marginBottom="$5">
        <Text fontSize="$8" fontWeight="700" accessibilityRole="header">
          Reset your password
        </Text>
        <Text color="$textMuted" fontSize="$4">
          Enter the email you signed up with and we'll send you a reset link.
        </Text>
      </YStack>
      <TextField
        testID="reset-email"
        label="Email"
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="send"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={handleSend}
        error={error}
      />
      <YStack marginTop="$4">
        <SecondaryButton onPress={() => navigation.goBack()}>Cancel</SecondaryButton>
      </YStack>
    </Screen>
  );
}
