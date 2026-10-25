import { useNavigation } from "@react-navigation/native";
import { useMemo, useState, type ReactNode } from "react";
import { Keyboard } from "react-native";
import { Text, YStack } from "tamagui";
import { ChipGroup } from "../components/Chip";
import { GenderPicker } from "../components/GenderPicker";
import { AiSuggestions } from "../components/AiSuggestions";
import { Icon } from "../components/Icon";
import { GhostButton, PrimaryButton } from "../components/MuseButton";
import { TextField } from "../components/MuseInput";
import {
  answersToRecord,
  BasicsEditor,
  BIO_MAX,
  LanguagePicker,
  MuseCardPicker,
  RapidQuestionPicker,
  recordToAnswers,
  toggleLimited
} from "../components/ProfileEditors";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { showToast } from "../components/Toast";
import { datingIntentions } from "../data/datingIntentions";
import { vibeOptions } from "../data/vibes";
import { useSendPolicy } from "../hooks/useSendPolicy";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { fetchBioSuggestions } from "../services/aiService";
import { friendlyError } from "../services/errors";
import { updateProfile } from "../services/profileService";
import { useAuthStore } from "../store/authStore";
import { Gender, ProfileBasics } from "../types/models";

/** Work is free text: trim it, and drop it when blank (the rules reject empty strings). */
function withTrimmedWork(basics: ProfileBasics): ProfileBasics {
  const { work, ...rest } = basics;
  return work?.trim() ? { ...rest, work: work.trim() } : rest;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <YStack gap="$2">
      <Text fontWeight="700" fontSize="$4">
        {title}
      </Text>
      {hint ? (
        <Text color="$textMuted" fontSize="$2">
          {hint}
        </Text>
      ) : null}
      {children}
    </YStack>
  );
}

export function EditProfileScreen() {
  const navigation = useNavigation();
  const uid = useAuthStore((state) => state.user?.uid);
  const profile = useAuthStore((state) => state.profile);
  const sendPolicy = useSendPolicy();

  const initial = useMemo(
    () => ({
      displayName: profile?.displayName ?? "",
      gender: profile?.gender ?? ("woman" as Gender),
      city: profile?.city ?? "",
      bio: profile?.bio ?? "",
      intentions: profile?.intentions ?? [],
      vibes: profile?.vibes ?? [],
      interests: profile?.interests ?? [],
      languages: profile?.languages ?? [],
      basics: profile?.basics ?? {},
      answers: answersToRecord(profile?.quickAnswers)
    }),
    // Snapshot once: later profile updates shouldn't reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [bioIdeas, setBioIdeas] = useState<string[] | null>(null);
  const [bioLoading, setBioLoading] = useState(false);

  const writeBio = async () => {
    setBioLoading(true);
    try {
      setBioIdeas((await fetchBioSuggestions()).suggestions);
    } catch (error) {
      showToast(friendlyError(error, "Paire AI couldn't write ideas right now. Try again later."), "error");
    } finally {
      setBioLoading(false);
    }
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const valid = Boolean(form.displayName.trim()) && form.interests.length > 0;
  useUnsavedChangesGuard(dirty && !saving);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!uid || !valid || saving) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      await updateProfile(uid, {
        displayName: form.displayName.trim(),
        gender: form.gender,
        city: form.city.trim(),
        bio: form.bio.trim(),
        intentions: form.intentions,
        vibes: form.vibes,
        interests: form.interests,
        languages: form.languages,
        basics: withTrimmedWork(form.basics),
        quickAnswers: recordToAnswers(form.answers)
      });
      showToast("Profile saved.", "success");
      navigation.goBack();
    } catch (error) {
      setSaving(false);
      showToast(friendlyError(error, "We couldn't save your profile. Please try again."), "error");
    }
  };

  return (
    <Screen
      scroll
      footer={
        <PrimaryButton testID="edit-profile-save" onPress={handleSave} disabled={!dirty || !valid} loading={saving}>
          Save changes
        </PrimaryButton>
      }
    >
      <ScreenHeader title="Edit profile" />
      <YStack gap="$6">
        <YStack gap="$3">
          <TextField label="First name" value={form.displayName} maxLength={40} autoCapitalize="words" onChangeText={(value) => set("displayName", value)} />
          <YStack gap="$1">
            <Text fontWeight="600" fontSize="$2">
              Age
            </Text>
            <Text color="$textMuted">
              {profile?.age}. Your age comes from your birthday, which can't be changed in the app. Contact support if it's wrong.
            </Text>
          </YStack>
          <TextField label="Bio" value={form.bio} multiline textAlignVertical="top" minHeight={110} paddingTop="$3" maxLength={BIO_MAX} showCount onChangeText={(value) => set("bio", value)} />
          {bioIdeas ? (
            <AiSuggestions
              testID="bio-ideas"
              title="Paire AI ideas"
              suggestions={bioIdeas}
              onPick={(text) => set("bio", text.slice(0, BIO_MAX))}
            />
          ) : (
            <GhostButton
              alignSelf="flex-start"
              testID="bio-write-ai"
              loading={bioLoading}
              leftIcon={<Icon name="sparkles" size={16} color="primary" />}
              onPress={() => void writeBio()}
            >
              Write it with Paire AI
            </GhostButton>
          )}
          <TextField label="City" value={form.city} maxLength={60} autoCapitalize="words" onChangeText={(value) => set("city", value)} />
        </YStack>

        <Section title="Gender">
          <GenderPicker value={form.gender} onChange={(id) => set("gender", id)} locked={sendPolicy.data?.womenSendFree === true && Boolean(profile?.gender)} />
        </Section>

        <Section title="Languages I speak" hint="Up to 6. People who speak your language see it first.">
          <LanguagePicker selected={form.languages} onChange={(next) => set("languages", next)} />
        </Section>

        <Section title="Basics" hint="All optional. Shown on your profile so the right people find you.">
          <BasicsEditor value={form.basics} onChange={(next) => set("basics", next)} />
        </Section>

        <Section title="Looking for" hint="Up to 2">
          <ChipGroup options={datingIntentions} selected={form.intentions} onToggle={(id) => set("intentions", toggleLimited(form.intentions, id, 2))} />
        </Section>

        <Section title="Your vibe" hint="Up to 3">
          <ChipGroup options={vibeOptions} selected={form.vibes} onToggle={(id) => set("vibes", toggleLimited(form.vibes, id, 3))} />
        </Section>

        <Section title="Interests" hint="Pick at least one">
          <MuseCardPicker selected={form.interests} onChange={(next) => set("interests", next)} />
        </Section>

        <Section title="Rapid questions">
          <RapidQuestionPicker answers={form.answers} onChange={(next) => set("answers", next)} />
        </Section>
      </YStack>
    </Screen>
  );
}
