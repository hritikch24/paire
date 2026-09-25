import { useState } from "react";
import { Card, Text, XStack, YStack, styled } from "tamagui";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { Screen } from "../../components/Screen";
import { PrimaryButton, SecondaryButton } from "../../components/MuseButton";
import { getRapidQuestionSet } from "../../data/rapidQuestions";
import { OnboardingStackParamList } from "../../navigation/stacks/OnboardingStack";
import { useAuthStore } from "../../store/authStore";
import { db } from "../../services/firebase";
import { QuickAnswer } from "../../types/models";

const AnswerPill = styled(Card, {
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderRadius: "$5",
  borderWidth: 1,
  backgroundColor: "$backgroundSoft",
  borderColor: "$border",
  pressStyle: { opacity: 0.85, scale: 0.98 }
});

export function RapidQuestionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const questions = getRapidQuestionSet();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isE2E =
    process.env.EXPO_PUBLIC_E2E === "true" ||
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true";

  const handleSelect = (questionId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleContinue = async () => {
    if (!user) return;
    if (isE2E) {
      const updatedAt = Date.now();
      const quickAnswers: QuickAnswer[] = questions
        .filter((question) => answers[question.id])
        .map((question) => ({
          questionId: question.id,
          answer: answers[question.id]
        }));
      if (profile) {
        setProfile({ ...profile, quickAnswers, updatedAt });
      }
      navigation.navigate("SafetyConfirm");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updatedAt = Date.now();
      const quickAnswers: QuickAnswer[] = questions
        .filter((question) => answers[question.id])
        .map((question) => ({
          questionId: question.id,
          answer: answers[question.id]
        }));
      await setDoc(
        doc(db, "users", user.uid),
        {
          quickAnswers,
          updatedAt
        },
        { merge: true }
      );
      if (profile) {
        setProfile({ ...profile, quickAnswers, updatedAt });
      }
      navigation.navigate("SafetyConfirm");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save quick answers.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <YStack gap="$2">
          <Text fontSize="$7" fontWeight="700">
            Rapid questions
          </Text>
          <Text color="$textMuted">
            Quick answers help your Blind Date matches get to know your vibe.
          </Text>
        </YStack>
        <YStack gap="$4">
          {questions.map((question) => (
            <YStack key={question.id} gap="$2">
              <Text fontWeight="700">{question.question}</Text>
              <XStack gap="$2" flexWrap="wrap">
                {question.options.map((option) => {
                  const selected = answers[question.id] === option;
                  return (
                    <AnswerPill
                      key={`${question.id}-${option}`}
                      onPress={() => handleSelect(question.id, option)}
                      backgroundColor={selected ? "$primarySoft" : "$backgroundSoft"}
                      borderColor={selected ? "$primary" : "$border"}
                    >
                      <Text color={selected ? "$text" : "$textMuted"}>{option}</Text>
                    </AnswerPill>
                  );
                })}
              </XStack>
            </YStack>
          ))}
        </YStack>
        {error ? <Text color="$error">{error}</Text> : null}
        <PrimaryButton disabled={saving} onPress={handleContinue}>
          Continue
        </PrimaryButton>
        <SecondaryButton onPress={() => navigation.navigate("SafetyConfirm")}>
          Skip for now
        </SecondaryButton>
      </YStack>
    </Screen>
  );
}
