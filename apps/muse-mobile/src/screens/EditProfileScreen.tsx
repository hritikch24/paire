import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Card, Text, XStack, YStack, styled } from "tamagui";
import { Screen } from "../components/Screen";
import { MuseInput } from "../components/MuseInput";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { useAuthStore } from "../store/authStore";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { useNavigation } from "@react-navigation/native";
import { getRapidQuestionSet, rapidQuestionMap } from "../data/rapidQuestions";
import { datingIntentions } from "../data/datingIntentions";
import { QuickAnswer } from "../types/models";
import { vibeOptions } from "../data/vibes";

export function EditProfileScreen() {
  const navigation = useNavigation();
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [intentions, setIntentions] = useState<string[]>(profile?.intentions ?? []);
  const [vibes, setVibes] = useState<string[]>(profile?.vibes ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questions = useMemo(() => getRapidQuestionSet(), []);
  const initialQuickAnswers = useMemo(() => {
    const existing = profile?.quickAnswers ?? [];
    return existing.reduce<Record<string, string>>((acc, entry) => {
      if (rapidQuestionMap.has(entry.questionId)) {
        acc[entry.questionId] = entry.answer;
      }
      return acc;
    }, {});
  }, [profile]);
  const [quickAnswers, setQuickAnswers] = useState<Record<string, string>>(initialQuickAnswers);

  const handleSelect = (questionId: string, option: string) => {
    setQuickAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const toggleIntention = (id: string) => {
    setIntentions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleVibe = (id: string) => {
    setVibes((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const rapidAnswers: QuickAnswer[] = questions
        .filter((question) => quickAnswers[question.id])
        .map((question) => ({
          questionId: question.id,
          answer: quickAnswers[question.id]
        }));
      const updatedAt = Date.now();
      await setDoc(
        doc(db, "users", profile.uid),
        {
          bio,
          city,
          intentions,
          vibes,
          quickAnswers: rapidAnswers,
          updatedAt
        },
        { merge: true }
      );
      setProfile({
        ...profile,
        bio,
        city,
        intentions,
        vibes,
        quickAnswers: rapidAnswers,
        updatedAt
      });
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$4">
            <Text fontSize="$7" fontWeight="700">
              Edit profile
            </Text>
            <MuseInput placeholder="City" value={city} onChangeText={setCity} />
            <MuseInput placeholder="Bio" value={bio} onChangeText={setBio} />
            <YStack gap="$2">
              <Text fontWeight="700">Your vibe</Text>
              <Text color="$textMuted">Choose up to three to set your tone.</Text>
              <XStack gap="$2" flexWrap="wrap">
                {vibeOptions.map((vibe) => {
                  const active = vibes.includes(vibe.id);
                  return (
                    <AnswerPill
                      key={vibe.id}
                      onPress={() => toggleVibe(vibe.id)}
                      backgroundColor={active ? "$primarySoft" : "$backgroundSoft"}
                      borderColor={active ? "$primary" : "$border"}
                    >
                      <Text color={active ? "$text" : "$textMuted"}>
                        {vibe.emoji} {vibe.label}
                      </Text>
                    </AnswerPill>
                  );
                })}
              </XStack>
            </YStack>
            <YStack gap="$2">
              <Text fontWeight="700">Looking for</Text>
              <Text color="$textMuted">Keep your intentions clear.</Text>
              <XStack gap="$2" flexWrap="wrap">
                {datingIntentions.map((intention) => {
                  const active = intentions.includes(intention.id);
                  return (
                    <AnswerPill
                      key={intention.id}
                      onPress={() => toggleIntention(intention.id)}
                      backgroundColor={active ? "$primarySoft" : "$backgroundSoft"}
                      borderColor={active ? "$primary" : "$border"}
                    >
                      <Text color={active ? "$text" : "$textMuted"}>
                        {intention.emoji} {intention.label}
                      </Text>
                    </AnswerPill>
                  );
                })}
              </XStack>
            </YStack>
            <YStack gap="$3">
              <Text fontWeight="700">Rapid questions</Text>
              <Text color="$textMuted">Pick quick answers to share in Blind Date mode.</Text>
              <YStack gap="$3">
                {questions.map((question) => (
                  <YStack key={question.id} gap="$2">
                    <Text fontWeight="600">{question.question}</Text>
                    <XStack gap="$2" flexWrap="wrap">
                      {question.options.map((option) => {
                        const selected = quickAnswers[question.id] === option;
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
            </YStack>
            {error ? <Text color="$error">{error}</Text> : null}
            <PrimaryButton onPress={handleSave} disabled={saving}>
              Save
            </PrimaryButton>
            <SecondaryButton onPress={() => navigation.goBack()}>Cancel</SecondaryButton>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const AnswerPill = styled(Card, {
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderRadius: "$5",
  borderWidth: 1,
  backgroundColor: "$backgroundSoft",
  borderColor: "$border",
  pressStyle: { opacity: 0.85, scale: 0.98 }
});
