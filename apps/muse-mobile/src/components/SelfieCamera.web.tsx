import { createElement, useEffect, useRef, useState } from "react";
import { Text, YStack } from "tamagui";
import { PrimaryButton } from "./MuseButton";
import type { SelfieCameraProps } from "./SelfieCamera";

const MAX_EDGE = 1024;

/**
 * A live front-camera view in the browser (phone or laptop). Only a frame taken
 * here can be sent, never a file from the gallery.
 */
export function SelfieCamera({ onCapture, busy }: SelfieCameraProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera. Try Chrome or Safari on your phone.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((media) => {
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().then(() => setReady(true)).catch(() => setReady(true));
        }
      })
      .catch((err: { name?: string }) => {
        setError(err?.name === "NotAllowedError"
          ? "Camera access is blocked. Allow the camera for paire.in in your browser settings, then try again."
          : "We couldn't open your camera. Close other apps using it and try again.");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = () => {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(element.videoWidth, element.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(element.videoWidth * scale);
    canvas.height = Math.round(element.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.88).split(",")[1] ?? "");
  };

  return (
    <YStack gap="$3">
      <YStack borderRadius={24} overflow="hidden" backgroundColor="#000" aspectRatio={3 / 4} maxHeight={420} maxWidth={315} width="100%" alignSelf="center" alignItems="center" justifyContent="center">
        {error ? (
          <Text color="#fff" padding="$4" textAlign="center">{error}</Text>
        ) : (
          // Mirrored like a mirror; the captured frame is not.
          createElement("video", {
            ref: video, muted: true, playsInline: true, autoPlay: true, "data-testid": "selfie-video",
            style: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }
          })
        )}
      </YStack>
      <PrimaryButton testID="selfie-capture" loading={busy} disabled={!ready || Boolean(error)} onPress={capture}>
        Take my selfie
      </PrimaryButton>
    </YStack>
  );
}
