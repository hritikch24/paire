import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Text, YStack } from "tamagui";
import { PrimaryButton } from "./MuseButton";

export type SelfieCameraProps = {
  /** Base64 JPEG of the selfie (no data: prefix). */
  onCapture: (base64: string) => void;
  busy?: boolean;
};

/** Opens the front camera (never the gallery) and hands back a downscaled JPEG. */
export function SelfieCamera({ onCapture, busy }: SelfieCameraProps) {
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Paire needs the camera for the photo check. Allow it in your phone's settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 1, exif: false });
    if (result.canceled || !result.assets?.length) return;
    const [asset] = result.assets;
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > 1024) context.resize(asset.width >= asset.height ? { width: 1024 } : { height: 1024 });
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ compress: 0.88, format: SaveFormat.JPEG });
      onCapture(await FileSystem.readAsStringAsync(saved.uri, { encoding: FileSystem.EncodingType.Base64 }));
    } finally {
      image.release();
      context.release();
    }
  };

  return (
    <YStack gap="$2">
      {error ? <Text color="$error">{error}</Text> : null}
      <PrimaryButton testID="selfie-capture" loading={busy} onPress={() => void open()}>
        Open camera
      </PrimaryButton>
    </YStack>
  );
}
