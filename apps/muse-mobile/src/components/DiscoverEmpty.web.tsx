import { useState } from "react";
import { Text, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { showToast } from "./Toast";
import { friendlyError } from "../services/errors";
import { updateSettings } from "../services/profileService";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";
import { MIN_AGE, MAX_AGE } from "../utils/age";
import { PREMIUM_PLANS } from "../config/premium";
import { withSettingsDefaults } from "../utils/profile";

type Props = {
  onReload: () => Promise<void>;
  /** A Paire Plus pass is running. */
  plus: boolean;
  /** The feed has already gone back through people passed on before (Plus). */
  revisited: boolean;
  onGetPlus: () => void;
};

/**
 * Everyone who fits has been seen. Without Plus: a simple Paire Plus offer
 * (from ₹20 a day), with Expand search as the second choice. With Plus: all caught up.
 */
export function DiscoverEmpty({ onReload, plus, onGetPlus }: Props) {
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

  const hint = wider
    ? `Try ages ${ageMin}–${ageMax}${settings.locationEnabled && maxDistanceKm !== null ? ` within ${maxDistanceKm} km` : settings.locationEnabled ? " at any distance" : ""}.`
    : "New people will appear here when they join.";
  const dayPrice = PREMIUM_PLANS.find((plan) => plan.id === "day")?.priceInr ?? 20;

  if (!plus && !isSupportView) {
    // Free members: a simple Paire Plus offer; widening the search stays one tap away.
    return (
      <YStack testID="discover-empty-plus" flex={1} alignItems="center" justifyContent="center" paddingVertical="$5" paddingHorizontal="$3" gap="$3">
        <Text fontSize="$5" fontWeight="700" textAlign="center">Want to meet more people?</Text>
        <Text fontSize="$2" color="$textMuted" textAlign="center" maxWidth={300} lineHeight={20}>
          {`Get Paire Plus for just ₹${dayPrice} a day: 100 likes and 5 Super Likes a day, and your likes are shown first. No auto-renewal.`}
        </Text>
        <YStack width="100%" maxWidth={280} gap="$2">
          <PrimaryButton testID="discover-get-plus" height={48} minHeight={48} onPress={onGetPlus}>{`Get Paire Plus · ₹${dayPrice}/day`}</PrimaryButton>
          <Text testID="discover-expand-description" fontSize="$1" color="$textMuted" textAlign="center">{wider ? `Or widen your search. ${hint}` : hint}</Text>
          <SecondaryButton testID="discover-expand" loading={busy} disabled={!uid} onPress={() => void expand()}>
            {wider ? "Expand search" : "Check again"}
          </SecondaryButton>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack testID="discover-empty" flex={1} alignItems="center" justifyContent="center" paddingVertical="$5" paddingHorizontal="$3" gap="$3">
      <Text fontSize="$5" fontWeight="700" textAlign="center">You're all caught up</Text>
      <Text testID="discover-expand-description" fontSize="$2" color="$textMuted" textAlign="center" maxWidth={280}>
        {hint}
      </Text>
      <YStack width="100%" maxWidth={280}>
        <PrimaryButton testID="discover-expand" height={48} minHeight={48} loading={busy} disabled={!uid || isSupportView} onPress={() => void expand()}>
          {wider ? "Expand search" : "Check again"}
        </PrimaryButton>
      </YStack>
    </YStack>
  );
}
