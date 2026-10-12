import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Linking } from "react-native";
import { Text, YStack } from "tamagui";
import { ChipGroup } from "../../components/Chip";
import { PrimaryButton } from "../../components/MuseButton";
import { OnboardingLayout } from "../../components/OnboardingLayout";
import { MAX_INTENTIONS, MuseCardPicker, toggleLimited } from "../../components/ProfileEditors";
import { SettingsSection, ToggleRow } from "../../components/SettingsRow";
import { showToast } from "../../components/Toast";
import { legal } from "../../config/legal";
import { datingIntentions } from "../../data/datingIntentions";
import { friendlyError } from "../../services/errors";
import { updateProfile, updateSettings } from "../../services/profileService";
import { useAuthStore } from "../../store/authStore";
import { trackConversion } from "../../services/analytics";
import { CASUAL_DESCRIPTION, CASUAL_LABEL, ONBOARDING_STEPS } from "../../utils/profile";

/** Last sign-up step: what you're into and what you're looking for. */
export function InterestsScreen() {
  const navigation = useNavigation();
  const uid = useAuthStore((state) => state.user?.uid);
  const profile = useAuthStore((state) => state.profile);
  const settings = useAuthStore((state) => state.settings);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [intentions, setIntentions] = useState<string[]>(profile?.intentions ?? []);
  const [casual, setCasual] = useState(Boolean(settings?.openToCasual));
  const [saving, setSaving] = useState(false);

  const handleStart = async () => {
    if (!uid || !interests.length || saving) return;
    setSaving(true);
    try {
      await updateSettings(uid, { openToCasual: casual });
      // Completing onboarding switches the navigator to the main app.
      await updateProfile(uid, { interests, intentions, safetyConfirmed: true, onboardingComplete: true });
      trackConversion("CompleteRegistration");
    } catch (error) {
      showToast(friendlyError(error, "We couldn't save that. Please try again."), "error");
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      step={2}
      total={ONBOARDING_STEPS}
      title="What are you into?"
      subtitle="Pick a few. Paire AI uses them to find people you'll click with."
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      footer={
        <PrimaryButton testID="interests-continue" onPress={handleStart} disabled={!interests.length} loading={saving}>
          {interests.length ? "Start matching" : "Pick at least one"}
        </PrimaryButton>
      }
    >
      <MuseCardPicker selected={interests} onChange={setInterests} />

      <YStack gap="$2">
        <Text fontWeight="700" fontSize="$4">
          Looking for
        </Text>
        <ChipGroup
          testIDPrefix="intention"
          options={datingIntentions}
          selected={intentions}
          onToggle={(id) => setIntentions(toggleLimited(intentions, id, MAX_INTENTIONS))}
        />
      </YStack>

      <SettingsSection>
        <ToggleRow
          testID="onboarding-casual"
          icon="moon-outline"
          label={CASUAL_LABEL}
          description={CASUAL_DESCRIPTION}
          value={casual}
          onValueChange={setCasual}
          showDivider={false}
        />
      </SettingsSection>

      <Text color="$textMuted" fontSize="$2">
        By starting, you agree to be real, be kind and take no for an answer.{" "}
        <Text color="$primary" fontSize="$2" fontWeight="600" onPress={() => void Linking.openURL(legal.guidelinesUrl)}>
          Community Guidelines
        </Text>
      </Text>
    </OnboardingLayout>
  );
}
