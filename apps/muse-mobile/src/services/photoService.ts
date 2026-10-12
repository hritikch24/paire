import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { env } from "../config/env";
import { auth, storageApiBase, storageBucket } from "./firebase";
import { resolveServerUrl } from "./testServer";

// Sharp on any phone screen, and small enough (~150-250 KB) to load fast on mobile data.
const MAX_EDGE_PX = 1080;
const JPEG_QUALITY = 0.82;

export type PickedPhoto = { uri: string; width: number; height: number };

/**
 * Opens the system photo picker. On Android 13+ this is the Photo Picker, which
 * needs no storage permission, as Google Play's photo & video policy requires.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  if (env.isE2E) {
    // The system picker can't be driven by Maestro; use a stable sample image.
    return { uri: "e2e-sample", width: 800, height: 1000 };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [4, 5],
    quality: 1,
    exif: false
  });
  if (result.canceled || !result.assets?.length) return null;
  const [asset] = result.assets;
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * Downscales and re-encodes to JPEG. Re-encoding also strips EXIF metadata,
 * including any GPS coordinates the camera embedded in the original photo.
 */
async function preparePhoto(photo: PickedPhoto): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MAX_EDGE_PX) {
    context.resize(photo.width >= photo.height ? { width: MAX_EDGE_PX } : { height: MAX_EDGE_PX });
  }
  try {
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
      return saved.uri;
    } finally {
      // Native bitmaps aren't freed by JS garbage collection soon enough.
      image.release();
    }
  } finally {
    context.release();
  }
}

function parseDownloadToken(body: string): string | null {
  try {
    const tokens = (JSON.parse(body) as { downloadTokens?: string }).downloadTokens;
    return tokens ? tokens.split(",")[0] : null;
  } catch {
    return null;
  }
}

// Test-server builds keep the placeholder origin in stored photo URLs (so they
// survive address changes) and resolve it only for the request itself.
const objectUrl = (encodedPath: string) => `${storageApiBase}/v0/b/${storageBucket}/o/${encodedPath}`;

/**
 * Uploads through the Firebase Storage REST API (the JS SDK's Blob uploads are
 * unreliable on React Native) and returns a download URL for the photo.
 *
 * Uses the resumable protocol, like the Firebase SDKs: the content type travels
 * as object metadata, which the Storage rules check. (The emulator ignores the
 * Content-Type header of a single-request upload, so rules would refuse it.)
 */
export async function uploadProfilePhoto(photo: PickedPhoto): Promise<string> {
  if (env.isE2E) {
    return `https://picsum.photos/seed/muse-e2e-${Date.now()}/800/1000`;
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const fileUri = await preparePhoto(photo);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const name = `user-uploads/${user.uid}/photos/${fileName}`;
  const encodedPath = encodeURIComponent(name);
  const authHeader = { Authorization: `Firebase ${await user.getIdToken()}` };
  const failed = (status: number) => new Error(`Photo upload failed (${status}). Please try again.`);

  try {
    const start = await fetch(resolveServerUrl(`${storageApiBase}/v0/b/${storageBucket}/o?name=${encodedPath}`), {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json; charset=utf-8",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Type": "image/jpeg"
      },
      body: JSON.stringify({ name, contentType: "image/jpeg" })
    });
    const sessionUrl = start.headers.get("x-goog-upload-url");
    if (!start.ok || !sessionUrl) throw failed(start.status);

    // Send the bytes to our own Storage address: the emulator answers with its
    // local one, which a phone can't reach.
    const uploadUrl = sessionUrl.replace(/^https?:\/\/[^/]+/, storageApiBase);
    const headers = { ...authHeader, "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" };
    let upload: { status: number; body: string };
    if (Platform.OS === "web") {
      const image = await fetch(fileUri);
      const bytes = await image.blob();
      if (bytes.size > 10 * 1024 * 1024) throw new Error("Please choose a smaller photo.");
      const response = await fetch(resolveServerUrl(uploadUrl), { method: "POST", headers, body: bytes });
      upload = { status: response.status, body: await response.text() };
    } else {
      upload = await FileSystem.uploadAsync(resolveServerUrl(uploadUrl), fileUri, { httpMethod: "POST", headers });
    }
    if (upload.status < 200 || upload.status >= 300) throw failed(upload.status);

    let token = parseDownloadToken(upload.body);
    if (!token) {
      const metadata = await fetch(resolveServerUrl(objectUrl(encodedPath)), { headers: authHeader });
      token = parseDownloadToken(await metadata.text());
    }
    if (!token) throw new Error("Photo uploaded, but no download link was issued. Please try again.");
    return `${objectUrl(encodedPath)}?alt=media&token=${token}`;
  } finally {
    if (Platform.OS !== "web") FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    else if (fileUri.startsWith("blob:")) URL.revokeObjectURL(fileUri);
  }
}

/** Best-effort removal of a photo the member deleted from their profile. */
export async function deleteProfilePhoto(url: string): Promise<void> {
  const user = auth.currentUser;
  const match = url.match(/\/o\/([^?]+)/);
  if (!user || !match) return;
  const path = decodeURIComponent(match[1]);
  if (!path.startsWith(`user-uploads/${user.uid}/`)) return;
  await fetch(resolveServerUrl(objectUrl(encodeURIComponent(path))), {
    method: "DELETE",
    headers: { Authorization: `Firebase ${await user.getIdToken()}` }
  }).catch(() => undefined);
}
