import { useState } from "react";
import { Text, YStack } from "tamagui";
import { PrimaryButton } from "./MuseButton";
import { showToast } from "./Toast";
import { friendlyError } from "../services/errors";
import { updateSettings } from "../services/profileService";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";
import { MIN_AGE, MAX_AGE } from "../utils/age";
import { withSettingsDefaults } from "../utils/profile";

export function DiscoverEmpty({ onReload }: { onReload: () => Promise<void> }) {
  const uid = useAuthStore((state) => state.user?.uid);
  const settings = withSettingsDefaults(useAuthStore((state) => state.settings));
  const [busy, setBusy] = useState(false);
  const ageMin = Math.max(MIN_AGE, settings.ageMin - 5);
  const ageMax = Math.min(MAX_AGE, settings.ageMax + 5);
  const maxDistanceKm = !settings.locationEnabled ? settings.maxDistanceKm
    : settings.maxDistanceKm === null || settings.maxDistanceKm >= 200
      ? null : Math.min(200, settings.maxDistanceKm * 2);
  const wider = ageMin !== settings.ageMin || ageMax !== settings.ageMax || maxDistanceKm !== settings.maxDistanceKm;

  const expand = async () => {
    if (!uid || busy || isSupportView) return;
    setBusy(true);
    try {
      if (wider) {
        // Keep gender and all other choices intact.
        await updateSettings(uid, { ageMin, ageMax, maxDistanceKm });
      }
      // Refresh after the write is acknowledged, even if an optimistic settings
      // snapshot already started a request against the previous server values.
      await onReload();
    } catch (error) {
      showToast(friendlyError(error, "Couldn't update your search. Try again."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <YStack testID="discover-empty" flex={1} alignItems="center" justifyContent="center" paddingVertical="$5" paddingHorizontal="$3" gap="$3">
      <Text fontSize="$5" fontWeight="700" textAlign="center">You're all caught up</Text>
      <Text testID="discover-expand-description" fontSize="$2" color="$textMuted" textAlign="center" maxWidth={280}>
        {wider ? `Try ages ${ageMin}–${ageMax}${settings.locationEnabled && maxDistanceKm !== null ? ` within ${maxDistanceKm} km` : settings.locationEnabled ? " at any distance" : ""}.` : "New people will appear here when they join."}
      </Text>
      <YStack width="100%" maxWidth={280}>
        <PrimaryButton testID="discover-expand" height={48} minHeight={48} loading={busy} disabled={!uid || isSupportView} onPress={() => void expand()}>
          {wider ? "Expand search" : "Check again"}
        </PrimaryButton>
      </YStack>
    </YStack>
  );
}
