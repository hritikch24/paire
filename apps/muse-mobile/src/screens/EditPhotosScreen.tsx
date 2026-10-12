import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Text, YStack } from "tamagui";
import { PrimaryButton } from "../components/MuseButton";
import { PhotoGrid } from "../components/PhotoGrid";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { showToast } from "../components/Toast";
import { usePhotoEditor } from "../hooks/usePhotoEditor";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { friendlyError } from "../services/errors";
import { updateProfile } from "../services/profileService";
import { useAuthStore } from "../store/authStore";
import { MIN_PHOTOS } from "../utils/profile";

export function EditPhotosScreen() {
  const navigation = useNavigation();
  const uid = useAuthStore((state) => state.user?.uid);
  const [initial] = useState(() => useAuthStore.getState().profile?.photoUrls ?? []);
  const editor = usePhotoEditor(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(editor.photos) !== JSON.stringify(initial);
  const canSave = dirty && editor.photos.length >= MIN_PHOTOS && !editor.uploading;
  useUnsavedChangesGuard(dirty && !saving, editor.discard);

  const handleSave = async () => {
    if (!uid || !canSave || saving) return;
    setSaving(true);
    try {
      await updateProfile(uid, { photoUrls: editor.photos });
      editor.commit(editor.photos);
      showToast("Photos saved.", "success");
      navigation.goBack();
    } catch (error) {
      setSaving(false);
      showToast(friendlyError(error, "We couldn't save your photos. Please try again."), "error");
    }
  };

  return (
    <Screen
      scroll
      footer={
        <PrimaryButton testID="edit-photos-save" onPress={handleSave} disabled={!canSave} loading={saving}>
          Save photos
        </PrimaryButton>
      }
    >
      <ScreenHeader title="Photos" subtitle="Tap a photo to make it your main one or remove it." />
      <YStack gap="$4">
        <PhotoGrid
          photos={editor.photos}
          uploading={editor.uploading}
          onAdd={() => void editor.add()}
          onRemove={editor.remove}
          onMakeMain={editor.makeMain}
        />
        {editor.photos.length < MIN_PHOTOS ? (
          <Text color="$error">Keep at least one photo on your profile.</Text>
        ) : (
          <Text color="$textMuted" fontSize="$2">
            Your first photo is the one people see first. Clear, recent photos of just you work best.
          </Text>
        )}
      </YStack>
    </Screen>
  );
}
