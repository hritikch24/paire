import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "@firebase/auth/dist/rn";
import { doc, getDoc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
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
import { createGuestProfile } from "../utils/guestProfile";
import { useResponsiveFlags } from "../hooks/useResponsiveFlags";

export function AuthScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const setUser = useAuthStore((state) => state.setUser);
  const setAuthLoading = useAuthStore((state) => state.setLoading);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setGuest = useAuthStore((state) => state.setGuest);
  const setDemo = useAuthStore((state) => state.setDemo);
  const passwordRef = useRef<TextInput>(null);
  const { isCompact } = useResponsiveFlags();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const allowDemoLogin = __DEV__ || process.env.EXPO_PUBLIC_E2E === "true";
  const demoTimeoutMs = 4000;

  const buildDemoProfile = (uid: string): UserProfile => {
    const now = Date.now();
    return {
      uid,
      displayName: "Muse Demo",
      pronouns: "they/them",
      age: 25,
      city: "Mumbai",
      bio: "Here to test Muse. Coffee walks, museum dates, and music nights.",
      photoUrls: [],
      interests: ["soundscape", "canvas", "taste"],
      intentions: ["long-term", "short-term"],
      vibes: ["cozy", "adventurous", "curious"],
      vibePreference: "any",
      maxDistanceKm: 25,
      quickAnswers: [
        { questionId: "ideal_date", answer: "Coffee + walk" },
        { questionId: "perfect_sunday", answer: "Brunch + market" },
        { questionId: "texting_style", answer: "Long chats" }
      ],
      location: null,
      shareLocation: false,
      createdAt: now,
      updatedAt: now,
      onboardingComplete: true,
      safetyConfirmed: true,
      lastActiveAt: now,
      isDiscoverable: true
    };
  };

  const handleSignIn = async () => {
    Keyboard.dismiss();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      const message = "Please enter your email and password to continue.";
      setError(message);
      Alert.alert("Missing details", message);
      return;
    }
    setLoading(true);
    setAuthLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(
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
      const message = err instanceof Error ? err.message : "Unable to sign in.";
      setError(message);
      Alert.alert("Sign-in failed", message);
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    const demoEmail = "demo@muse.app";
    const demoPassword = "Muse123!";
    setError(null);
    setLoading(true);
    setAuthLoading(true);
    try {
      const withTimeout = async <T,>(promise: Promise<T>) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("demo-timeout")), demoTimeoutMs);
        });
        try {
          return await Promise.race([promise, timeoutPromise]);
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      };
      let credential;
      try {
        credential = await withTimeout(
          signInWithEmailAndPassword(auth, demoEmail, demoPassword)
        );
      } catch {
        credential = await withTimeout(
          createUserWithEmailAndPassword(auth, demoEmail, demoPassword)
        );
      }
      setUser(credential.user);
      const demoProfile = buildDemoProfile(credential.user.uid);
      await setDoc(doc(db, "users", credential.user.uid), demoProfile, { merge: true });
      setProfile(demoProfile);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in to the demo account.";
      const normalized = message.toLowerCase();
      const isNetwork =
        normalized.includes("network-request-failed") || normalized.includes("demo-timeout");
      if (isNetwork) {
        const demoProfile = buildDemoProfile("demo-local");
        setDemo(demoProfile);
        Alert.alert(
          "Offline demo mode",
          "Firebase emulators are unreachable. You are now in offline demo mode."
        );
        return;
      }
      setError(message);
      Alert.alert(
        "Demo sign-in failed",
        `${message}\n\nIf you are using emulators, start them with: firebase emulators:start --only auth,firestore,storage,functions`
      );
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
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: isCompact ? "flex-start" : "center",
            paddingBottom: isCompact ? 120 : 96
          }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$5">
            <YStack gap="$2">
              <Text fontSize={isCompact ? "$7" : "$8"} fontWeight="700">
                Welcome back
              </Text>
              <Text color="$textMuted">Sign in to keep your Muse story going.</Text>
            </YStack>

            <YStack
              gap="$4"
              backgroundColor="$backgroundStrong"
              padding="$4"
              borderRadius="$5"
              borderWidth={1}
              borderColor="$border"
              width="100%"
              maxWidth={420}
              alignSelf="center"
            >
              <YStack gap="$3">
                <MuseInput
                  testID="auth-email"
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
                  testID="auth-password"
                  placeholder="Password"
                  secureTextEntry
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
                />
                {error ? (
                  <Text color="$error" fontSize="$2">
                    {error}
                  </Text>
                ) : null}
              </YStack>

              <YStack gap="$3">
                <PrimaryButton
                  testID="auth-continue"
                  accessibilityLabel="auth-continue"
                  onPress={handleSignIn}
                  disabled={loading}
                >
                  Continue
                </PrimaryButton>
                <SecondaryButton
                  testID="auth-create-account"
                  accessibilityLabel="auth-create-account"
                  onPress={() => navigation.navigate("Signup")}
                  disabled={loading}
                >
                  Create account
                </SecondaryButton>
              </YStack>

              <SecondaryButton onPress={() => navigation.navigate("AuthHelp")}>
                Need help?
              </SecondaryButton>
              {allowDemoLogin ? (
                <SecondaryButton
                  accessibilityLabel="demo-login"
                  onPress={handleDemoLogin}
                  disabled={loading}
                >
                  Use demo account
                </SecondaryButton>
              ) : null}
              <SecondaryButton onPress={() => setGuest(createGuestProfile())}>
                Explore as guest
              </SecondaryButton>
            </YStack>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
