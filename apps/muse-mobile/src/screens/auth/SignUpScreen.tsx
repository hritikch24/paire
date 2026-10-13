import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { Keyboard, TextInput } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Checkbox } from "../../components/Checkbox";
import { GoogleButton } from "../../components/GoogleButton";
import { googleSignInAvailable } from "../../services/googleAuth";
import { LegalLinks } from "../../components/LegalText";
import { GhostButton, PrimaryButton } from "../../components/MuseButton";
import { PasswordField, TextField } from "../../components/MuseInput";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { isValidEmail, MIN_PASSWORD_LENGTH, signUp } from "../../services/accountService";
import { friendlyError } from "../../services/errors";
import type { AuthStackParamList } from "../../navigation/types";
import { isDisposableEmail } from "../../utils/disposableEmail";

export function SignUpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const throwaway = isDisposableEmail(email);
  const emailError =
    email.length > 3 && !isValidEmail(email)
      ? "Enter a valid email address."
      : throwaway
        ? "Use your own email. Temporary inboxes can't be used on Paire."
        : null;
  const passwordError =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : null;
  const confirmError = confirm.length > 0 && confirm !== password ? "Passwords don't match." : null;
  const canSubmit =
    isValidEmail(email) && !throwaway && password.length >= MIN_PASSWORD_LENGTH && confirm === password && agreed;

  const handleSignUp = async () => {
    if (!canSubmit || loading) return;
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      await signUp(email, password);
      // The session listener moves the new member into onboarding.
    } catch (err) {
      setError(friendlyError(err, "We couldn't create your account. Please try again."));
      setLoading(false);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <YStack gap="$2">
          {error ? (
            <Text color="$error" textAlign="center" fontSize="$2">
              {error}
            </Text>
          ) : null}
          <PrimaryButton testID="signup-submit" onPress={handleSignUp} disabled={!canSubmit} loading={loading}>
            Create account
          </PrimaryButton>
          <XStack justifyContent="center" alignItems="center">
            <Text color="$textMuted">Already on Paire?</Text>
            <GhostButton onPress={() => navigation.replace("SignIn")}>Sign in</GhostButton>
          </XStack>
        </YStack>
      }
    >
      <ScreenHeader />
      <YStack gap="$2" marginBottom="$5">
        <Text fontSize="$8" fontWeight="700" accessibilityRole="header">
          Create your account
        </Text>
        <Text color="$textMuted" fontSize="$4">
          It takes about a minute. We'll email you a link to confirm it's you.
        </Text>
      </YStack>
      <YStack gap="$3">
        <TextField
          testID="signup-email"
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
          error={emailError}
        />
        <PasswordField
          ref={passwordRef}
          testID="signup-password"
          label="Password"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="next"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => confirmRef.current?.focus()}
          error={passwordError}
        />
        <PasswordField
          ref={confirmRef}
          testID="signup-confirm"
          label="Confirm password"
          placeholder="Type it again"
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="done"
          value={confirm}
          onChangeText={setConfirm}
          error={confirmError}
        />
        <Checkbox
          testID="signup-consent"
          checked={agreed}
          onChange={setAgreed}
          accessibilityLabel="I am 18 or older and agree to the Terms of Service, Privacy Policy and Community Guidelines"
        >
          <LegalLinks prefix="I'm 18 or older and I agree to Paire's" />
        </Checkbox>
        {googleSignInAvailable ? (
          <YStack gap="$2" marginTop="$2">
            <XStack alignItems="center" gap="$3">
              <YStack flex={1} height={1} backgroundColor="$border" />
              <Text color="$textMuted" fontSize="$2">or</Text>
              <YStack flex={1} height={1} backgroundColor="$border" />
            </XStack>
            <GoogleButton testID="signup-google" disabled={!agreed} onError={setError} />
            {!agreed ? (
              <Text color="$textMuted" fontSize="$1" textAlign="center">
                Tick the box above to continue with Google.
              </Text>
            ) : null}
          </YStack>
        ) : null}
      </YStack>
    </Screen>
  );
}
