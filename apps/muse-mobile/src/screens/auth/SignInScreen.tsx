import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { Keyboard, TextInput } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { GhostButton, PrimaryButton } from "../../components/MuseButton";
import { PasswordField, TextField } from "../../components/MuseInput";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { GoogleButton } from "../../components/GoogleButton";
import { isValidEmail, signIn } from "../../services/accountService";
import { googleSignInAvailable } from "../../services/googleAuth";
import { friendlyError } from "../../services/errors";
import type { AuthStackParamList } from "../../navigation/types";

export function SignInScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canSubmit = isValidEmail(email) && password.length > 0;

  const handleSignIn = async () => {
    if (!canSubmit || loading) return;
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // The session listener routes to onboarding or the app.
    } catch (err) {
      setError(friendlyError(err, "We couldn't sign you in. Please try again."));
      setLoading(false);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <YStack gap="$2">
          <PrimaryButton testID="signin-submit" onPress={handleSignIn} disabled={!canSubmit} loading={loading}>
            Sign in
          </PrimaryButton>
          <XStack justifyContent="center" alignItems="center">
            <Text color="$textMuted">New to Paire?</Text>
            <GhostButton onPress={() => navigation.replace("SignUp")}>Create account</GhostButton>
          </XStack>
        </YStack>
      }
    >
      <ScreenHeader />
      <YStack gap="$2" marginBottom="$5">
        <Text fontSize="$8" fontWeight="700" accessibilityRole="header">
          Welcome back
        </Text>
        <Text color="$textMuted" fontSize="$4">
          Sign in to pick up where you left off.
        </Text>
      </YStack>
      <GoogleButton testID="signin-google" onError={setError} />
      {googleSignInAvailable ? (
        <XStack alignItems="center" gap="$3" marginVertical="$4">
          <YStack flex={1} height={1} backgroundColor="$border" />
          <Text color="$textMuted" fontSize="$2">or with email</Text>
          <YStack flex={1} height={1} backgroundColor="$border" />
        </XStack>
      ) : null}
      <YStack gap="$3">
        <TextField
          testID="signin-email"
          label="Email"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <PasswordField
          ref={passwordRef}
          testID="signin-password"
          label="Password"
          placeholder="Your password"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSignIn}
          error={error}
        />
        <XStack justifyContent="space-between">
          <GhostButton onPress={() => navigation.navigate("AuthHelp")}>Need help?</GhostButton>
          <GhostButton
            testID="signin-forgot"
            onPress={() => navigation.navigate("ForgotPassword", { email: email.trim() })}
          >
            Forgot password?
          </GhostButton>
        </XStack>
      </YStack>
    </Screen>
  );
}
