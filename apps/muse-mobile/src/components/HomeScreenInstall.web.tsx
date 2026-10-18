import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import { SecondaryButton } from "./MuseButton";
import { SettingsSection } from "./SettingsRow";
import { isSupportView } from "../services/supportMode";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let pending: InstallPrompt | null = null;
// Capture early, before the member opens Settings. Never show an install prompt automatically.
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); pending = event as InstallPrompt; window.dispatchEvent(new Event("paire-install-ready")); });

export function HomeScreenInstall() {
  const [available, setAvailable] = useState(Boolean(pending));
  const [steps, setSteps] = useState(false);
  const [installed, setInstalled] = useState(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  useEffect(() => {
    const ready = () => setAvailable(Boolean(pending));
    const done = () => { pending = null; setInstalled(true); };
    window.addEventListener("paire-install-ready", ready);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("paire-install-ready", ready); window.removeEventListener("appinstalled", done); };
  }, []);
  if (installed || isSupportView) return null;
  const install = async () => {
    if (!pending) { setSteps((value) => !value); return; }
    const prompt = pending; pending = null; setAvailable(false);
    try { await prompt.prompt(); if ((await prompt.userChoice).outcome === "accepted") setInstalled(true); }
    catch { setSteps(true); }
  };
  return (
    <SettingsSection title="Keep Paire close">
      <YStack testID="home-screen-install" padding="$4" gap="$3">
        <Text fontWeight="700">One tap away from your next connection</Text>
        <Text fontSize="$2" color="$textMuted">Add Paire to your Home Screen for a direct way back. On iPhone and iPad, this also lets you enable browser notifications.</Text>
        <SecondaryButton testID="home-screen-install-button" onPress={() => void install()}>{available ? "Add Paire to Home Screen" : steps ? "Hide steps" : "How to add Paire"}</SecondaryButton>
        {steps ? <YStack testID="home-screen-install-steps" gap="$2">
          <Text fontSize="$2">iPhone / iPad: open Paire in Safari → Share → Add to Home Screen. Open the new Paire icon, then enable notifications here.</Text>
          <Text fontSize="$2">Android: open your browser menu → Add to Home Screen or Install app.</Text>
          <Text fontSize="$2">Desktop: use the install icon in the address bar or your browser menu, if available.</Text>
        </YStack> : null}
      </YStack>
    </SettingsSection>
  );
}
