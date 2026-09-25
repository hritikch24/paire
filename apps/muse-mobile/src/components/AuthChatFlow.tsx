import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "@firebase/auth/dist/rn";
import { doc, getDoc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  useWindowDimensions
} from "react-native";
import { Card, Text, XStack, YStack, styled } from "tamagui";
import { auth, db } from "../services/firebase";
import { useAuthStore } from "../store/authStore";
import { UserProfile } from "../types/models";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { MuseInput } from "./MuseInput";
import { Screen } from "./Screen";
import { env } from "../config/env";
import { datingIntentions } from "../data/datingIntentions";

type FlowMode = "signin" | "signup";
type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type StepType = "email" | "password" | "name" | "age" | "pronouns" | "city" | "bio" | "intentions";
type StepConfig = {
  id: StepType;
  prompt: string;
  input: "text" | "email" | "password" | "number" | "chips" | "multi";
  optional?: boolean;
};

const pronounOptions = ["she/her", "he/him", "they/them", "skip"];

export function AuthChatFlow({
  mode,
  onSwitchMode,
  onBack,
  onHelp
}: {
  mode: FlowMode;
  onSwitchMode?: () => void;
  onBack?: () => void;
  onHelp?: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const setUser = useAuthStore((state) => state.setUser);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setAuthLoading = useAuthStore((state) => state.setLoading);
  const { width, fontScale } = useWindowDimensions();
  const compactHeader = width <= 360 || fontScale >= 1.2;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [intentions, setIntentions] = useState<string[]>([]);
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    age: "",
    pronouns: "",
    city: "",
    bio: ""
  });

  const steps = useMemo<StepConfig[]>(() => {
    if (mode === "signin") {
      return [
        {
          id: "email",
          prompt: "Welcome back! What's the email on your account?",
          input: "email"
        },
        {
          id: "password",
          prompt: "And your password?",
          input: "password"
        }
      ];
    }
    return [
      {
        id: "email",
        prompt: "Hey! I'm Muse ✨ What's the best email for your account?",
        input: "email"
      },
      {
        id: "password",
        prompt: "Set a password (8+ characters works best).",
        input: "password"
      },
      {
        id: "name",
        prompt: "What should I call you?",
        input: "text"
      },
      {
        id: "age",
        prompt: "How old are you?",
        input: "number"
      },
      {
        id: "pronouns",
        prompt: "Your pronouns?",
        input: "chips",
        optional: true
      },
      {
        id: "city",
        prompt: "Where are you based?",
        input: "text",
        optional: true
      },
      {
        id: "bio",
        prompt: "Describe your vibe in one line.",
        input: "text",
        optional: true
      },
      {
        id: "intentions",
        prompt: "What are you looking for right now?",
        input: "multi",
        optional: true
      }
    ];
  }, [mode]);

  useEffect(() => {
    setMessages([{ id: "intro", role: "assistant", text: steps[0].prompt }]);
    setStepIndex(0);
    setInputValue("");
    setIntentions([]);
    setForm({
      email: "",
      password: "",
      displayName: "",
      age: "",
      pronouns: "",
      city: "",
      bio: ""
    });
  }, [steps]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, typing]);

  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Request timed out after 15s."));
      }, timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });

  const enqueueAssistant = (text: string, nextIndex: number) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { id: `${Date.now()}-${nextIndex}`, role: "assistant", text }]);
      setStepIndex(nextIndex);
      setInputValue("");
      if (steps[nextIndex]?.input !== "multi" && steps[nextIndex]?.input !== "chips") {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    }, 500);
  };

  const advanceStep = (userText: string) => {
    const nextIndex = stepIndex + 1;
    setMessages((prev) => [...prev, { id: `${Date.now()}-user`, role: "user", text: userText }]);
    if (nextIndex >= steps.length) {
      return;
    }
    enqueueAssistant(steps[nextIndex].prompt, nextIndex);
  };

  const handleAuthError = (title: string, errorMessage: string) => {
    const diag = [
      `mode=${mode}`,
      `project=${env.firebase.projectId}`,
      `authDomain=${env.firebase.authDomain}`,
      `bucket=${env.firebase.storageBucket}`,
      `appId=${env.firebase.appId}`,
      `emulator=${env.useEmulator}`
    ]
      .filter(Boolean)
      .join(" | ");
    Alert.alert(title, `${errorMessage}\n${diag}`);
  };

  const handleSignIn = async () => {
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedPassword = form.password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      Alert.alert("Missing details", "Please enter email and password to sign in.");
      return;
    }
    setLoading(true);
    setAuthLoading(true);
    try {
      const credential = await withTimeout(
        signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword),
        15000
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
      handleAuthError("Sign-in failed", message);
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  const handleSignup = async () => {
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedPassword = form.password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      Alert.alert("Missing details", "Please enter email and password to create your account.");
      return;
    }
    const trimmedName = form.displayName.trim();
    const ageValue = Number(form.age);
    if (!trimmedName || !form.age || Number.isNaN(ageValue)) {
      Alert.alert("Almost there", "Please add your name and age.");
      return;
    }
    setLoading(true);
    setAuthLoading(true);
    try {
      const credential = await withTimeout(
        createUserWithEmailAndPassword(auth, normalizedEmail, normalizedPassword),
        15000
      );
      setUser(credential.user);
      const now = Date.now();
      const nextProfile: UserProfile = {
        uid: credential.user.uid,
        displayName: trimmedName,
        pronouns: form.pronouns,
        age: ageValue,
        city: form.city,
        bio: form.bio,
        photoUrls: [],
        interests: [],
        intentions,
        vibes: [],
        vibePreference: "any",
        maxDistanceKm: 50,
        location: null,
        shareLocation: false,
        createdAt: now,
        updatedAt: now,
        onboardingComplete: false,
        safetyConfirmed: false,
        lastActiveAt: now,
        isDiscoverable: true,
        quickAnswers: []
      };
      await withTimeout(setDoc(doc(db, "users", credential.user.uid), nextProfile, { merge: true }), 15000);
      await withTimeout(
        setDoc(
          doc(db, "users", credential.user.uid, "private", "info"),
          { email: credential.user.email ?? "" },
          { merge: true }
        ),
        15000
      );
      setProfile(nextProfile);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create account.";
      handleAuthError("Signup failed", message);
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  const handleSubmitInput = () => {
    Keyboard.dismiss();
    const step = steps[stepIndex];
    const trimmed = inputValue.trim();
    if (!trimmed && !step.optional) {
      Alert.alert("Missing details", "Please enter a response to continue.");
      return;
    }
    if (!trimmed && step.optional) {
      advanceStep("Skip for now");
      return;
    }

    switch (step.id) {
      case "email":
        setForm((prev) => ({ ...prev, email: trimmed }));
        break;
      case "password":
        setForm((prev) => ({ ...prev, password: trimmed }));
        break;
      case "name":
        setForm((prev) => ({ ...prev, displayName: trimmed }));
        break;
      case "age":
        setForm((prev) => ({ ...prev, age: trimmed }));
        break;
      case "city":
        setForm((prev) => ({ ...prev, city: trimmed }));
        break;
      case "bio":
        setForm((prev) => ({ ...prev, bio: trimmed }));
        break;
      default:
        break;
    }

    advanceStep(trimmed);

    if (mode === "signin" && step.id === "password") {
      handleSignIn();
    }

    if (mode === "signup" && step.id === "intentions") {
      handleSignup();
    }
  };

  const handlePronounSelect = (value: string) => {
    const chosen = value === "skip" ? "" : value;
    setForm((prev) => ({ ...prev, pronouns: chosen }));
    advanceStep(value === "skip" ? "Skip for now" : value);
  };

  const handleIntentionsContinue = () => {
    const summary = intentions.length ? intentions.join(", ") : "Skip for now";
    advanceStep(summary);
    handleSignup();
  };

  const step = steps[stepIndex];

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <YStack flex={1}>
          <YStack gap="$3" paddingHorizontal="$4">
            {mode === "signup" ? (
              compactHeader ? (
                <YStack gap="$2">
                  <SecondaryButton onPress={onBack} alignSelf="flex-start">
                    Back to sign in
                  </SecondaryButton>
                  <Text fontWeight="700">Muse</Text>
                </YStack>
              ) : (
                <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                  <SecondaryButton onPress={onBack}>Back to sign in</SecondaryButton>
                  <Text fontWeight="700">Muse</Text>
                </XStack>
              )
            ) : compactHeader ? (
              <YStack gap="$2">
                <Text fontWeight="700">Muse</Text>
                <SecondaryButton onPress={onSwitchMode} alignSelf="flex-start">
                  Create account
                </SecondaryButton>
              </YStack>
            ) : (
              <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                <Text fontWeight="700">Muse</Text>
                <SecondaryButton onPress={onSwitchMode}>Create account</SecondaryButton>
              </XStack>
            )}
            {onHelp ? (
              <XStack justifyContent="flex-end">
                <SecondaryButton onPress={onHelp}>Need help?</SecondaryButton>
              </XStack>
            ) : null}
          </YStack>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <YStack gap="$3">
              {messages.map((msg) => (
                <ChatRow key={msg.id} role={msg.role}>
                  <ChatBubble>
                    <Text color={msg.role === "user" ? "$text" : "$text"}>
                      {msg.text}
                    </Text>
                  </ChatBubble>
                </ChatRow>
              ))}
              {typing ? (
                <ChatRow role="assistant">
                  <ChatBubble>
                    <Text color="$textMuted">Muse is typing…</Text>
                  </ChatBubble>
                </ChatRow>
              ) : null}
            </YStack>
          </ScrollView>

          <YStack padding="$4" gap="$2" backgroundColor="$background">
            {step.input === "chips" ? (
              <XStack gap="$2" flexWrap="wrap">
                {pronounOptions.map((option) => (
                  <ChoicePill key={option} onPress={() => handlePronounSelect(option)}>
                    <Text fontWeight="600">{option}</Text>
                  </ChoicePill>
                ))}
              </XStack>
            ) : null}

            {step.input === "multi" ? (
              <YStack gap="$3">
                <XStack gap="$2" flexWrap="wrap">
                  {datingIntentions.map((intention) => {
                    const active = intentions.includes(intention.id);
                    return (
                      <ChoicePill
                        key={intention.id}
                        onPress={() =>
                          setIntentions((prev) =>
                            prev.includes(intention.id)
                              ? prev.filter((item) => item !== intention.id)
                              : [...prev, intention.id]
                          )
                        }
                        backgroundColor={active ? "$primarySoft" : "$backgroundSoft"}
                        borderColor={active ? "$primary" : "$border"}
                      >
                        <Text fontWeight="600">
                          {intention.emoji} {intention.label}
                        </Text>
                      </ChoicePill>
                    );
                  })}
                </XStack>
                <PrimaryButton onPress={handleIntentionsContinue} disabled={loading}>
                  Continue
                </PrimaryButton>
                {step.optional ? (
                  <SecondaryButton onPress={handleIntentionsContinue} disabled={loading}>
                    Skip for now
                  </SecondaryButton>
                ) : null}
              </YStack>
            ) : null}

            {step.input !== "chips" && step.input !== "multi" ? (
              <YStack gap="$2">
                <MuseInput
                  ref={inputRef}
                  placeholder={
                    step.input === "email"
                      ? "Email"
                      : step.input === "password"
                        ? "Password"
                        : step.input === "number"
                          ? "Age"
                          : "Your answer"
                  }
                  autoCapitalize={step.input === "email" ? "none" : "words"}
                  autoCorrect={step.input !== "email"}
                  textContentType={
                    step.input === "password" ? "password" : step.input === "email" ? "emailAddress" : "none"
                  }
                  autoComplete={
                    step.input === "password"
                      ? mode === "signup"
                        ? "password-new"
                        : "password"
                      : step.input === "email"
                        ? "email"
                        : "off"
                  }
                  keyboardType={
                    step.input === "email"
                      ? "email-address"
                      : step.input === "number"
                        ? "number-pad"
                        : "default"
                  }
                  secureTextEntry={step.input === "password"}
                  value={inputValue}
                  onChangeText={setInputValue}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitInput}
                />
                <PrimaryButton onPress={handleSubmitInput} disabled={loading}>
                  Send
                </PrimaryButton>
                {step.optional ? (
                  <SecondaryButton onPress={() => advanceStep("Skip for now")} disabled={loading}>
                    Skip for now
                  </SecondaryButton>
                ) : null}
              </YStack>
            ) : null}
          </YStack>
        </YStack>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const ChatRow = ({
  role,
  children
}: {
  role: "assistant" | "user";
  children: ReactNode;
}) => (
  <XStack justifyContent={role === "user" ? "flex-end" : "flex-start"} paddingHorizontal="$1">
    {children}
  </XStack>
);

const ChatBubble = styled(Card, {
  paddingHorizontal: "$4",
  paddingVertical: "$3",
  borderRadius: "$5",
  maxWidth: "86%",
  backgroundColor: "$backgroundSoft",
  borderWidth: 1,
  borderColor: "$border"
});

const ChoicePill = styled(Card, {
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderRadius: "$5",
  borderWidth: 1,
  backgroundColor: "$backgroundSoft",
  borderColor: "$border",
  pressStyle: { opacity: 0.85, scale: 0.98 }
});
