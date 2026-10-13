import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { Keyboard } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { ChipGroup } from "../../components/Chip";
import { GhostButton, PrimaryButton } from "../../components/MuseButton";
import { TextField } from "../../components/MuseInput";
import { OnboardingLayout } from "../../components/OnboardingLayout";
import { showToast } from "../../components/Toast";
import { signOut } from "../../services/accountService";
import { friendlyError } from "../../services/errors";
import { saveBasics } from "../../services/profileService";
import { useAuthStore } from "../../store/authStore";
import { GENDERS, Gender } from "../../types/models";
import { ageFromBirthDate, formatBirthDate, maskBirthDateInput, MIN_AGE, parseBirthDate } from "../../utils/age";
import {
  defaultShowMeFor,
  GENDER_LABELS,
  gendersForShowMe,
  ONBOARDING_STEPS,
  SHOW_ME_OPTIONS,
  ShowMeOption,
  showMeOptionFor
} from "../../utils/profile";
import type { OnboardingStackParamList } from "../../navigation/types";

const GENDER_OPTIONS = GENDERS.map((id) => ({ id, label: GENDER_LABELS[id] }));

export function BasicsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const profile = useAuthStore((state) => state.profile);
  const settings = useAuthStore((state) => state.settings);
  const info = useAuthStore((state) => state.info);

  // Google sign-ups arrive with a name: start from their first name.
  const googleName = useAuthStore((state) => state.user?.displayName?.trim().split(/\s+/)[0] ?? "");
  const [name, setName] = useState(profile?.displayName ?? googleName);
  const [birthday, setBirthday] = useState(formatBirthDate(info?.birthDate));
  const [gender, setGender] = useState<Gender | null>(
    profile?.gender && GENDERS.includes(profile.gender) ? profile.gender : null
  );
  const [showMe, setShowMe] = useState<ShowMeOption | null>(
    settings?.showMe?.length ? showMeOptionFor(settings.showMe) : null
  );
  const [saving, setSaving] = useState(false);

  const birthDate = parseBirthDate(birthday);
  const age = birthDate ? ageFromBirthDate(birthDate) : null;
  const underage = age !== null && age < MIN_AGE;
  const birthdayError =
    birthday.length === 10 && !birthDate
      ? "Enter a real date as DD/MM/YYYY."
      : underage
        ? "Paire is only for adults 18 and over."
        : null;
  const canContinue = Boolean(name.trim() && birthDate && !underage && gender && showMe);

  const handleContinue = async () => {
    if (!uid || !canContinue || !birthDate || !gender || !showMe || saving) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      await saveBasics(
        uid,
        { displayName: name, birthDate, gender, showMe: gendersForShowMe(showMe) },
        profile,
        settings
      );
      navigation.navigate("Photos");
    } catch (error) {
      showToast(friendlyError(error, "We couldn't save that. Please try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      step={1}
      total={ONBOARDING_STEPS}
      title="The basics"
      subtitle="About a minute and you're in."
      footer={
        <YStack gap="$1">
          <PrimaryButton testID="basics-continue" onPress={handleContinue} disabled={!canContinue} loading={saving}>
            Continue
          </PrimaryButton>
          <GhostButton onPress={() => void signOut()}>Not you? Sign out</GhostButton>
        </YStack>
      }
    >
      <TextField
        testID="basics-name"
        label="First name"
        placeholder="Your first name"
        autoCapitalize="words"
        autoComplete="name-given"
        textContentType="givenName"
        maxLength={40}
        value={name}
        onChangeText={setName}
      />
      <TextField
        testID="basics-birthday"
        label="Birthday"
        placeholder="DD/MM/YYYY · e.g. 24032001"
        // A text field with the number keypad: a web number field would reject the slashes we add.
        inputMode="numeric"
        autoComplete="birthdate-full"
        maxLength={10}
        value={birthday}
        onChangeText={(text) => setBirthday(maskBirthDateInput(text))}
        helper={
          age !== null && !underage
            ? `You'll show as ${age}. Your birthday stays private and can't be changed later.`
            : "Only your age is shown. You must be 18 or older."
        }
        error={birthdayError}
      />
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$2">
          I am a
        </Text>
        <ChipGroup
          testIDPrefix="gender"
          options={GENDER_OPTIONS}
          selected={gender ? [gender] : []}
          onToggle={(id) => {
            setGender(id);
            // Pre-select the usual choice; it stays one tap to change.
            setShowMe((current) => current ?? defaultShowMeFor(id));
          }}
        />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$2">
          Show me
        </Text>
        <ChipGroup
          testIDPrefix="showme"
          options={SHOW_ME_OPTIONS}
          selected={showMe ? [showMe] : []}
          onToggle={(id) => setShowMe(id)}
        />
        <XStack>
          <Text color="$textMuted" fontSize="$1">
            Kept private. It's only used to decide who you see, and who sees you.
          </Text>
        </XStack>
      </YStack>
    </OnboardingLayout>
  );
}
