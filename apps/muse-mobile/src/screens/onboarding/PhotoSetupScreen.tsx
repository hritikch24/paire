import { useEffect, useState } from "react";
import { Image } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { launchImageLibraryAsync, MediaTypeOptions, requestMediaLibraryPermissionsAsync } from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "../../components/Screen";
import { PrimaryButton, SecondaryButton } from "../../components/MuseButton";
import { OnboardingStackParamList } from "../../navigation/stacks/OnboardingStack";
import { useAuthStore } from "../../store/authStore";
import { db } from "../../services/firebase";
import { env } from "../../config/env";

export function PhotoSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isE2E =
    process.env.EXPO_PUBLIC_E2E === "true" ||
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true";

  useEffect(() => {
    if (!isE2E || !photoUrls.length || saving || uploading) {
      return;
    }
    const timer = setTimeout(() => {
      navigation.navigate("Interests");
    }, 500);
    return () => clearTimeout(timer);
  }, [isE2E, navigation, photoUrls.length, saving, uploading]);

  const uploadPhoto = async (params: { uri: string; mimeType?: string | null }) => {
    if (!user) return null;
    const { uri, mimeType } = params;
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const contentType = mimeType ?? "image/jpeg";
    const bucket = env.firebase.storageBucket;
    if (!bucket) {
      throw new Error("Storage bucket is not configured.");
    }
    const path = `user-uploads/${user.uid}/photos/${filename}`;
    const authToken = await user.getIdToken();
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(
      path
    )}`;
    const targetUri = uri.startsWith("content://")
      ? `${FileSystem.cacheDirectory}muse-upload-${filename}`
      : uri;
    if (targetUri !== uri) {
      await FileSystem.copyAsync({ from: uri, to: targetUri });
    }
    const uploadType = FileSystem.FileSystemUploadType?.BINARY_CONTENT;
    const uploadResult = await FileSystem.uploadAsync(uploadUrl, targetUri, {
      httpMethod: "POST",
      uploadType: uploadType ?? undefined,
      headers: {
        Authorization: `Firebase ${authToken}`,
        "Content-Type": contentType
      }
    });
    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Upload failed (${uploadResult.status}).`);
    }
    const downloadToken = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
      .toString(36)
      .slice(2)}`;
    await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Firebase ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          metadata: {
            firebaseStorageDownloadTokens: downloadToken
          }
        })
      }
    );
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
      path
    )}?alt=media&token=${downloadToken}`;
  };

  const handlePick = async () => {
    if (isE2E) {
      setPhotoUrls((prev) => [...prev, "https://picsum.photos/seed/muse/200/300"]);
      return;
    }
    setError(null);
    const permission = await requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      setError("Please allow photo access to add images.");
      return;
    }
    const result = await launchImageLibraryAsync({
      mediaTypes: MediaTypeOptions.Images,
      allowsEditing: true,
      base64: true,
      quality: 0.8
    });

    if (!result.canceled && result.assets.length) {
      setUploading(true);
      try {
        const asset = result.assets[0];
        const uploadedUrl = await uploadPhoto({
          uri: asset.uri,
          mimeType: asset.mimeType ?? null
        });
        if (uploadedUrl) {
          setPhotoUrls((prev) => [...prev, uploadedUrl]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to upload photo.";
        setError(message);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleNext = async () => {
    if (!user) return;
    if (isE2E) {
      const updatedAt = Date.now();
      if (profile) {
        setProfile({ ...profile, photoUrls, updatedAt });
      }
      navigation.navigate("Interests");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updatedAt = Date.now();
      await setDoc(
        doc(db, "users", user.uid),
        {
          photoUrls,
          updatedAt
        },
        { merge: true }
      );
      if (profile) {
        setProfile({ ...profile, photoUrls, updatedAt });
      }
      navigation.navigate("Interests");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save photos.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="700">
          Add a few photos
        </Text>
        <Text color="$textMuted">
          We will upload to secure storage when you go live.
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {photoUrls.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              testID={`photo-preview-${index}`}
              source={{ uri }}
              style={{ width: 96, height: 120, borderRadius: 16 }}
            />
          ))}
        </XStack>
        {error ? <Text color="$error">{error}</Text> : null}
        <SecondaryButton testID="onboarding-add-photo" onPress={handlePick} disabled={uploading || saving}>
          Add photo
        </SecondaryButton>
        <PrimaryButton testID="onboarding-photo-continue" disabled={saving || uploading} onPress={handleNext}>
          Continue
        </PrimaryButton>
      </YStack>
    </Screen>
  );
}
