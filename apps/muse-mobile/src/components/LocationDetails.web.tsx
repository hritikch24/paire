import { useState } from "react";
import { Text, YStack } from "tamagui";
import { GhostButton } from "./MuseButton";
import { showToast } from "./Toast";
import { requestApproximateLocation } from "../services/locationService.web";
import { updateSettings } from "../services/profileService";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";

export function LocationDetails() {
  const uid = useAuthStore((state) => state.user?.uid);
  const settings = useAuthStore((state) => state.settings);
  const [busy, setBusy] = useState(false);
  if (isSupportView) return null;
  const updatedAt = settings?.location?.updatedAt;
  const refresh = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const result = await requestApproximateLocation();
      if (result.status === "granted") {
        if (useAuthStore.getState().user?.uid !== uid) return;
        await updateSettings(uid, { locationEnabled: true, location: result.location });
        showToast("Approximate location refreshed.", "success");
      } else showToast(result.status === "denied" ? "Allow location using the site controls beside your browser's address bar, then try again." : "Location isn't available right now. You can still browse without it.");
    } catch { showToast("Couldn't refresh your location. Please try again.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <YStack testID="web-location-details" paddingHorizontal="$4" paddingBottom="$3" gap="$1">
      <Text fontSize="$1" color="$textMuted">{settings?.locationEnabled
        ? `Used for distance and local events. ${updatedAt ? `Last refreshed ${new Date(updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. ` : ""}Your profile city is edited separately.`
        : "Location is optional. Without it, distance limits can't reliably narrow your search."}</Text>
      <Text fontSize="$1" color="$textMuted">Stored on an approximate 1 km grid. Only rounded distances are shown to other members.</Text>
      {settings?.locationEnabled ? <GhostButton testID="web-location-refresh" loading={busy} alignSelf="flex-start" onPress={() => void refresh()}>Refresh location</GhostButton> : null}
    </YStack>
  );
}
