import { useEffect, useState } from "react";
import { Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, YStack } from "tamagui";
import { MAX_GARBA_NIGHTS, myUpcomingNights, upcomingNights } from "../data/garba";
import { updateSettings } from "../services/profileService";
import { friendlyError } from "../services/errors";
import { useAuthStore } from "../store/authStore";
import { ChipGroup } from "./Chip";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { showToast } from "./Toast";

export const GARBA_PRIVACY_NOTE =
  `Free this Navratri. Pick up to ${MAX_GARBA_NIGHTS} nights. People near you going on the same nights see only how many nights you share, never which ones. Meet in the crowd, and share your pass or group only once you're comfortable.`;

/** Chips for the Garba nights still to come; `selected` holds dates. */
export function GarbaNightPicker({ selected, onToggle }: { selected: string[]; onToggle: (date: string) => void }) {
  return (
    <ChipGroup
      testIDPrefix="garba-night"
      options={upcomingNights().map((night) => ({ id: night.date, label: `${night.title} · ${night.day}` }))}
      selected={selected}
      onToggle={(date) => {
        if (!selected.includes(date) && selected.length >= MAX_GARBA_NIGHTS) {
          showToast(`Pick up to ${MAX_GARBA_NIGHTS} nights. Tap one to swap it.`);
          return;
        }
        onToggle(date);
      }}
    />
  );
}

export const toggleNight = (list: string[], date: string) => (list.includes(date) ? list.filter((item) => item !== date) : [...list, date].sort());

/** Pick your Garba nights, then see who's going on them. */
export function GarbaSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: (nights: string[]) => void }) {
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((state) => state.user?.uid);
  const saved = useAuthStore((state) => state.settings?.garbaNights);
  const [nights, setNights] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setNights(myUpcomingNights(saved));
  }, [visible, saved]);

  const save = async () => {
    if (!uid || !nights.length || saving) return;
    setSaving(true);
    try {
      await updateSettings(uid, { garbaNights: nights });
      onSaved(nights);
    } catch (error) {
      showToast(friendlyError(error, "Couldn't save your nights."), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end">
        <YStack
          testID="garba-sheet"
          backgroundColor="$background"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          padding="$5"
          paddingBottom={Math.max(insets.bottom, 16) + 8}
          gap="$4"
        >
          <YStack gap="$1">
            <Text fontSize="$7" fontWeight="700" accessibilityRole="header">
              🪔 Garba Nights
            </Text>
            <Text color="$textMuted">Which nights are you going? We'll show you people dancing on the same nights.</Text>
          </YStack>
          <GarbaNightPicker selected={nights} onToggle={(date) => setNights((current) => toggleNight(current, date))} />
          <Text color="$textMuted" fontSize="$1">
            {GARBA_PRIVACY_NOTE}
          </Text>
          <PrimaryButton testID="garba-save" onPress={() => void save()} disabled={!nights.length} loading={saving}>
            {nights.length ? `Find my Garba Paire (${nights.length} night${nights.length > 1 ? "s" : ""})` : "Pick at least one night"}
          </PrimaryButton>
          <SecondaryButton onPress={onClose} disabled={saving}>
            Not now
          </SecondaryButton>
        </YStack>
      </YStack>
    </Modal>
  );
}
