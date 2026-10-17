import { useState } from "react";
import { Text, YStack } from "tamagui";
import { SecondaryButton } from "./MuseButton";
import { showToast } from "./Toast";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";

export function ProfileSharing() {
  const profile = useAuthStore((state) => state.profile);
  const [busy, setBusy] = useState(false);
  if (!profile || isSupportView) return null;
  const share = async () => {
    const url = new URL("/app/", window.location.origin);
    url.searchParams.set("profile", profile.uid);
    setBusy(true);
    try {
      if (navigator.share) await navigator.share({ title: `${profile.displayName} on Paire`, text: "Find me on Paire", url: url.href });
      else { await navigator.clipboard.writeText(url.href); showToast("Profile link copied.", "success"); }
    } catch (error) { if ((error as { name?: string }).name !== "AbortError") showToast("Couldn't share the link. Try again.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <YStack width="100%" gap="$1">
      <SecondaryButton testID="profile-share" loading={busy} disabled={profile.isDiscoverable === false} onPress={() => void share()}>Share my profile</SecondaryButton>
      <Text fontSize="$1" color="$textMuted" textAlign="center">{profile.isDiscoverable === false ? "Turn on Show me on Paire to share your profile." : "Opens after sign-in. Your privacy choices still apply."}</Text>
    </YStack>
  );
}
