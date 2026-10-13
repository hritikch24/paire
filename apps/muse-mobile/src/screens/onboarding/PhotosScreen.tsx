import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import { GhostButton, PrimaryButton } from "../../components/MuseButton";
import { OnboardingLayout } from "../../components/OnboardingLayout";
import { PhotoGrid } from "../../components/PhotoGrid";
import { showToast } from "../../components/Toast";
import { usePhotoEditor } from "../../hooks/usePhotoEditor";
import { friendlyError } from "../../services/errors";
import { updateProfile } from "../../services/profileService";
import { useAuthStore } from "../../store/authStore";
import { ONBOARDING_STEPS } from "../../utils/profile";
import type { OnboardingStackParamList } from "../../navigation/types";

/** Optional sign-up step: a photo now saves a hunt through Edit profile later. */
export function PhotosScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const [initial] = useState(() => useAuthStore.getState().profile?.photoUrls ?? []);
  const editor = usePhotoEditor(initial);
  const [saving, setSaving] = useState(false);
  const hasPhotos = editor.photos.length > 0;
  const { discard } = editor;
  // Going back without continuing leaves no stray uploads behind (saved ones are already claimed).
  useEffect(() => () => discard(), [discard]);

  const handleContinue = async () => {
    if (!uid || saving || editor.uploading) return;
    if (!hasPhotos) { void editor.add(); return; }
    setSaving(true);
    try {
      if (JSON.stringify(editor.photos) !== JSON.stringify(initial)) {
        await updateProfile(uid, { photoUrls: editor.photos });
        editor.commit(editor.photos);
      }
      navigation.navigate("Interests");
    } catch (error) {
      showToast(friendlyError(error, "We couldn't save your photos. Please try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    editor.discard();
    navigation.navigate("Interests");
  };

  return (
    <OnboardingLayout
      step={2}
      total={ONBOARDING_STEPS}
      title="Add a photo"
      subtitle="People with a photo get far more likes. You can add more later."
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      footer={
        <YStack gap="$1">
          <PrimaryButton testID="photos-continue" onPress={() => void handleContinue()} loading={saving || editor.uploading}>
            {hasPhotos ? "Continue" : "Add a photo"}
          </PrimaryButton>
          {!hasPhotos ? <GhostButton testID="photos-skip" disabled={editor.uploading} onPress={skip}>Skip for now</GhostButton> : null}
        </YStack>
      }
    >
      <PhotoGrid
        photos={editor.photos}
        uploading={editor.uploading}
        onAdd={() => void editor.add()}
        onRemove={editor.remove}
        onMakeMain={editor.makeMain}
      />
      <Text color="$textMuted" fontSize="$2" lineHeight={21}>
        Your first photo is the one people see first. A clear, recent photo of just you works best, and it's also what the free verified badge checks against.
      </Text>
    </OnboardingLayout>
  );
}
