import { useCallback, useRef, useState } from "react";
import { showToast } from "../components/Toast";
import { friendlyError } from "../services/errors";
import { deleteProfilePhoto, pickPhoto, uploadProfilePhoto } from "../services/photoService";
import { MAX_PHOTOS } from "../utils/profile";

/**
 * Local editing state for a member's photos. Removed photos are only deleted
 * from storage once the change is saved; uploads abandoned without saving are
 * cleaned up by `discard`.
 */
export function usePhotoEditor(initial: string[]) {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [uploading, setUploading] = useState(false);
  const removed = useRef<string[]>([]);
  const uploaded = useRef<string[]>([]);

  const add = useCallback(async () => {
    if (uploading || photos.length >= MAX_PHOTOS) return;
    const picked = await pickPhoto().catch(() => null);
    if (!picked) return;
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(picked);
      uploaded.current.push(url);
      setPhotos((current) => [...current, url].slice(0, MAX_PHOTOS));
    } catch (error) {
      showToast(friendlyError(error, "We couldn't upload that photo. Please try again."), "error");
    } finally {
      setUploading(false);
    }
  }, [photos.length, uploading]);

  const remove = useCallback((index: number) => {
    setPhotos((current) => {
      const url = current[index];
      if (url) removed.current.push(url);
      return current.filter((_, i) => i !== index);
    });
  }, []);

  const makeMain = useCallback((index: number) => {
    setPhotos((current) => [current[index], ...current.filter((_, i) => i !== index)]);
  }, []);

  /** Call after the new photo list is saved. */
  const commit = useCallback((saved: string[]) => {
    removed.current.filter((url) => !saved.includes(url)).forEach((url) => void deleteProfilePhoto(url));
    removed.current = [];
    uploaded.current = [];
  }, []);

  /** Call when leaving without saving. */
  const discard = useCallback(() => {
    uploaded.current.forEach((url) => void deleteProfilePhoto(url));
    uploaded.current = [];
    removed.current = [];
  }, []);

  return { photos, uploading, add, remove, makeMain, commit, discard };
}
