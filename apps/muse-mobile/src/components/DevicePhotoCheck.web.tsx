import { useCallback, useEffect, useRef, useState } from "react";
import { Text, YStack } from "tamagui";
import { createDeviceFaceCheck } from "../services/deviceFaceCheck";
import type { DeviceFaceCheck, DeviceFaceResult } from "../services/deviceFaceCheckTypes";
import { useAuthStore } from "../store/authStore";
import { useWebScreenActive } from "../hooks/useWebScreenActive";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { ToggleRow } from "./SettingsRow";
import { SelfieCamera } from "./SelfieCamera";

const NO_PHOTOS: string[] = [];
export function DevicePhotoCheck() {
  const uid = useAuthStore(state => state.user?.uid);
  const photos = useAuthStore(state => state.profile?.photoUrls ?? NO_PHOTOS);
  const key = JSON.stringify(photos);
  const active = useWebScreenActive();
  const session = useRef<DeviceFaceCheck | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"idle" | "loading" | "camera" | "checking" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<DeviceFaceResult | null>(null);
  const supported = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";
  const cancel = useCallback(() => { const current = session.current; session.current = null; current?.dispose(); setPhase("idle"); setMessage(""); setResult(null); }, []);
  useEffect(() => { cancel(); setConsent(false); return cancel; }, [uid, key, cancel]);
  useEffect(() => { if (!active) cancel(); }, [active, cancel]);
  const start = async () => {
    if (!active || !uid || !consent || !supported || !photos.length) return;
    cancel(); setPhase("loading"); setMessage("Preparing the private checker. The first download is about 50 MB; later checks can use your browser’s cache.");
    let current: DeviceFaceCheck | null = null;
    try {
      current = createDeviceFaceCheck(text => { if (session.current === current) setMessage(text); });
      session.current = current;
      await current.prepare();
      if (session.current === current) { setPhase("camera"); setMessage("Face the camera in good light. Only you should be in the shot."); }
    } catch (error) {
      if (!current || session.current === current) { session.current = null; current?.dispose(); setPhase("error"); setMessage(error instanceof Error ? error.message : "The checker could not start. Please retry."); }
    }
  };
  const compare = async (selfie: string) => {
    const current = session.current;
    if (!current || phase !== "camera") return;
    setPhase("checking"); setMessage("Comparing your selfie on this device…");
    try {
      const comparison = await current.compare(selfie, photos);
      if (session.current === current) { setResult(comparison); setPhase("done"); setMessage(comparison.reason); }
    } catch (error) {
      if (session.current === current) { setPhase("error"); setMessage(error instanceof Error ? error.message : "The comparison could not finish. Please retry."); }
    } finally {
      if (session.current === current) { session.current = null; current.dispose(); }
    }
  };
  const busy = phase === "loading" || phase === "checking";
  return <YStack testID="device-photo-check" gap="$3" padding="$4" borderRadius={24} backgroundColor="$primarySoft">
    <Text fontSize="$5" fontWeight="700" accessibilityRole="header">Compare your photos on this device</Text>
    <Text color="$textMuted" lineHeight={23}>Take a camera selfie and compare it with your profile photos. Your selfie and face measurements stay on this device and are not saved or uploaded.</Text>
    <Text color="$textMuted" fontSize="$2" lineHeight={21}>This checks face similarity. It cannot prove liveness or approve a verified badge.</Text>
    {!supported ? <Text color="$textMuted">This browser does not support the device checker. Try a current browser or contact support.</Text> : !photos.length ? <Text>Add a profile photo first, then return here.</Text> : null}
    {phase === "idle" || phase === "done" || phase === "error" ? <>
      <ToggleRow testID="device-photo-consent" icon="shield-outline" label="Process my photos on this device" description="The checker downloads to your device after you start. Camera access is requested next. Nothing is sent for approval." value={consent} onValueChange={setConsent} />
      <PrimaryButton testID="device-photo-start" disabled={!uid || !active || !supported || !photos.length || !consent} onPress={() => void start()}>{phase === "idle" ? "Start device photo check" : "Try another selfie"}</PrimaryButton>
    </> : null}
    {phase === "camera" || phase === "checking" ? <SelfieCamera busy={busy} onCapture={image => void compare(image)} /> : null}
    {message ? <YStack gap="$2" accessibilityLiveRegion="polite" testID="device-photo-result">
      {phase === "done" ? <Text fontWeight="700">{result?.matched ? "Photos match on this device" : "No clear match on this device"}</Text> : null}
      <Text color={phase === "error" ? "$error" : "$textMuted"} lineHeight={23}>{message}</Text>
      {phase === "done" ? <Text color="$textMuted" fontSize="$2">Your verified badge status has not changed. This result is cleared when you leave this screen or change photos.</Text> : null}
    </YStack> : null}
    {phase !== "idle" ? <SecondaryButton testID="device-photo-cancel" onPress={cancel}>{busy || phase === "camera" ? "Cancel device check" : "Clear result"}</SecondaryButton> : null}
  </YStack>;
}
