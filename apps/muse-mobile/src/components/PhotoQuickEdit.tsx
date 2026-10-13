import { useEffect, useRef, useState } from "react";
import { Text, YStack } from "tamagui";
import { usePhotoEditor } from "../hooks/usePhotoEditor";
import { friendlyError } from "../services/errors";
import { updateProfile } from "../services/profileService";
import { useAuthStore } from "../store/authStore";
import { PhotoGrid } from "./PhotoGrid";
import { showToast } from "./Toast";

const NO_PHOTOS: string[] = [];

/**
 * Add or change profile photos right where they're needed (the photo check),
 * without a trip to Edit profile. Every change is saved straight away; the last
 * photo can't be removed here.
 */
export function PhotoQuickEdit({ title, text, onSaved, testID }: { title: string; text: string; onSaved?: (photos: string[]) => void; testID?: string }) {
  const uid = useAuthStore((state) => state.user?.uid);
  const saved = useAuthStore((state) => state.profile?.photoUrls ?? NO_PHOTOS);
  const editor = usePhotoEditor(saved);
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef(JSON.stringify(saved));
  const { photos, uploading, commit, claim, pending, discard } = editor;

  // One save at a time; a change made meanwhile is saved when this one ends.
  useEffect(() => {
    const next = JSON.stringify(photos);
    if (!uid || uploading || saving || !photos.length || next === lastSaved.current) return;
    lastSaved.current = next;
    setSaving(true);
    // The store sees this write before it's confirmed, so the screen may re-render or
    // unmount us mid-save: these uploads must not be cleaned up as abandoned.
    claim(photos);
    const removedBefore = pending();
    updateProfile(uid, { photoUrls: photos })
      .then(() => { commit(photos, removedBefore); onSaved?.(photos); })
      .catch((error) => {
        // No automatic retry (it would loop while offline); the next change tries again.
        showToast(friendlyError(error, "We couldn't save your photos. Please try again."), "error");
      })
      .finally(() => setSaving(false));
  }, [uid, photos, uploading, saving, commit, claim, pending, onSaved]);

  // Photos uploaded but never saved (e.g. the member leaves mid-upload) are cleaned up.
  useEffect(() => () => discard(), [discard]);

  return (
    <YStack testID={testID} gap="$3" padding="$4" borderRadius={24} backgroundColor="$backgroundStrong" borderWidth={1} borderColor="$primary">
      <YStack gap={4}>
        <Text fontSize="$5" fontWeight="700">{title}</Text>
        <Text color="$textMuted" fontSize="$2" lineHeight={21}>{text}</Text>
      </YStack>
      <PhotoGrid
        photos={photos}
        uploading={uploading}
        onAdd={() => void editor.add()}
        onRemove={(index) => {
          if (photos.length <= 1) { showToast("Add another photo first, then remove this one.", "info"); return; }
          editor.remove(index);
        }}
        onMakeMain={editor.makeMain}
      />
      <Text color="$textMuted" fontSize="$1" accessibilityLiveRegion="polite">
        {uploading ? "Uploading…" : saving ? "Saving…" : photos.length ? "Saved. Tap a photo to make it your main one or remove it." : "Tap + to add a photo from your phone."}
      </Text>
    </YStack>
  );
}
