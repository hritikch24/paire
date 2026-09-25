import { useState } from "react";
import { Pressable } from "react-native";
import { Text, YStack, XStack } from "tamagui";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { Screen } from "../../components/Screen";
import { PrimaryButton } from "../../components/MuseButton";
import { useAuthStore } from "../../store/authStore";
import { db } from "../../services/firebase";

export function SafetyConfirmScreen() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isE2E =
    process.env.EXPO_PUBLIC_E2E === "true" ||
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true";

  const handleFinish = async () => {
    if (!user) return;
    if (isE2E) {
      const updatedAt = Date.now();
      if (profile) {
        setProfile({ ...profile, safetyConfirmed: confirmed, onboardingComplete: true, updatedAt });
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updatedAt = Date.now();
      await setDoc(
        doc(db, "users", user.uid),
        {
          safetyConfirmed: confirmed,
          onboardingComplete: true,
          updatedAt
        },
        { merge: true }
      );
      if (profile) {
        setProfile({ ...profile, safetyConfirmed: confirmed, onboardingComplete: true, updatedAt });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to finish onboarding.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="700">
          Safety first
        </Text>
        <Text color="$textMuted">
          I agree to keep Muse respectful and to report unsafe behavior.
        </Text>
        <Pressable
          testID="onboarding-safety-switch"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => setConfirmed((prev) => !prev)}
        >
          <XStack alignItems="center" gap="$3">
            <XStack
              width={24}
              height={24}
              borderRadius={12}
              borderWidth={2}
              borderColor="$primary"
              alignItems="center"
              justifyContent="center"
              backgroundColor={confirmed ? "$primary" : "transparent"}
            >
              {confirmed ? (
                <Text color="$primaryForeground" fontSize="$3">
                  ✓
                </Text>
              ) : null}
            </XStack>
            <Text>I agree</Text>
          </XStack>
        </Pressable>
        {error ? <Text color="$error">{error}</Text> : null}
        <PrimaryButton testID="onboarding-finish" disabled={!confirmed || saving} onPress={handleFinish}>
          Enter Muse
        </PrimaryButton>
      </YStack>
    </Screen>
  );
}
