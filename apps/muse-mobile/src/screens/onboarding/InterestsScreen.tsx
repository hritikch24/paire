import { useState } from "react";
import { useWindowDimensions } from "react-native";
import { Text, YStack, XStack, Card } from "tamagui";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { Screen } from "../../components/Screen";
import { PrimaryButton } from "../../components/MuseButton";
import { museCards } from "../../data/museCards";
import { OnboardingStackParamList } from "../../navigation/stacks/OnboardingStack";
import { useAuthStore } from "../../store/authStore";
import { db } from "../../services/firebase";

export function InterestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardWidth = Math.max(150, Math.floor((width - 44) / 2));
  const isE2E =
    process.env.EXPO_PUBLIC_E2E === "true" ||
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true";

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleNext = async () => {
    if (!user) return;
    if (isE2E) {
      const updatedAt = Date.now();
      if (profile) {
        setProfile({ ...profile, interests: selected, updatedAt });
      }
      navigation.navigate("RapidQuestions");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updatedAt = Date.now();
      await setDoc(
        doc(db, "users", user.uid),
        {
          interests: selected,
          updatedAt
        },
        { merge: true }
      );
      if (profile) {
        setProfile({ ...profile, interests: selected, updatedAt });
      }
      navigation.navigate("RapidQuestions");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save interests.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="700">
          Pick your Muse Cards
        </Text>
        <Text color="$textMuted">
          Choose a few to guide your discovery feed.
        </Text>
        <XStack gap="$3" flexWrap="wrap">
          {museCards.map((card) => {
            const active = selected.includes(card.id);
            return (
              <Card
                key={card.id}
                testID={`interest-${card.id}`}
                width={cardWidth}
                padding="$3"
                borderRadius="$4"
                backgroundColor={active ? "$primarySoft" : "$card"}
                borderColor={active ? "$primary" : "$border"}
                borderWidth={1}
                shadowColor="#000000"
                shadowOpacity={active ? 0.2 : 0.08}
                shadowRadius={active ? 14 : 10}
                shadowOffset={{ width: 0, height: 6 }}
                elevation={active ? 5 : 2}
                onPress={() => toggle(card.id)}
              >
                <Text fontSize="$6">{card.emoji}</Text>
                <Text fontWeight="700">{card.title}</Text>
                <Text fontSize="$2" color="$textMuted">
                  {card.description}
                </Text>
              </Card>
            );
          })}
        </XStack>
        {error ? <Text color="$error">{error}</Text> : null}
        <PrimaryButton testID="onboarding-interests-continue" disabled={saving} onPress={handleNext}>
          Continue
        </PrimaryButton>
      </YStack>
    </Screen>
  );
}
