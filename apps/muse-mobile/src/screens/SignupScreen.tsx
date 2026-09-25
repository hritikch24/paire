import { createUserWithEmailAndPassword } from "@firebase/auth/dist/rn";
import { doc, getDoc } from "@firebase/firestore/dist/index.cjs.js";
import { useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput } from "react-native";
import { Text, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { MuseInput } from "../components/MuseInput";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { auth, db } from "../services/firebase";
import { useNavigation } from "@react-navigation/native";
import { AuthStackParamList } from "../navigation/stacks/AuthStack";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/authStore";
import { UserProfile } from "../types/models";

export function SignupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const setUser = useAuthStore((state) => state.setUser);
  const setAuthLoading = useAuthStore((state) => state.setLoading);
  const setProfile = useAuthStore((state) => state.setProfile);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    Keyboard.dismiss();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const normalizedConfirm = confirmPassword.trim();
    if (!normalizedEmail || !normalizedPassword) {
      const message = "Please enter an email and password to create your account.";
      setError(message);
      Alert.alert("Missing details", message);
      return;
    }
    if (normalizedPassword.length < 6) {
      const message = "Password must be at least 6 characters.";
      setError(message);
      Alert.alert("Weak password", message);
      return;
    }
    if (normalizedPassword !== normalizedConfirm) {
      const message = "Passwords do not match.";
      setError(message);
      Alert.alert("Check your password", message);
      return;
    }

    setLoading(true);
    setAuthLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        normalizedPassword
      );
      setUser(credential.user);
      try {
        const snapshot = await getDoc(doc(db, "users", credential.user.uid));
        const profile = snapshot.exists() ? (snapshot.data() as UserProfile) : null;
        setProfile(profile);
      } catch {
        setProfile(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create account.";
      setError(message);
      Alert.alert("Sign-up failed", message);
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 96 }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$5">
            <YStack gap="$3">
              <SecondaryButton onPress={() => navigation.goBack()}>
                Back to sign in
              </SecondaryButton>
              <YStack gap="$2">
                <Text fontSize="$8" fontWeight="700">
                  Create your account
                </Text>
                <Text color="$textMuted">
                  Start your Muse profile and meet creatives who match your spark.
                </Text>
              </YStack>
            </YStack>

            <YStack
              gap="$4"
              backgroundColor="$backgroundStrong"
              padding="$4"
              borderRadius="$5"
              borderWidth={1}
              borderColor="$border"
            >
              <YStack gap="$3">
                <MuseInput
                  testID="signup-email"
                  placeholder="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <MuseInput
                  ref={passwordRef}
                  testID="signup-password"
                  placeholder="Password"
                  secureTextEntry
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="password-new"
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                />
                <MuseInput
                  ref={confirmRef}
                  testID="signup-confirm-password"
                  placeholder="Confirm password"
                  secureTextEntry
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
                {error ? (
                  <Text color="$error" fontSize="$2">
                    {error}
                  </Text>
                ) : null}
              </YStack>

              <PrimaryButton testID="signup-continue" onPress={handleSignup} disabled={loading}>
                Create account
              </PrimaryButton>
              <SecondaryButton onPress={() => navigation.navigate("AuthHelp")}>
                Need help?
              </SecondaryButton>
            </YStack>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
