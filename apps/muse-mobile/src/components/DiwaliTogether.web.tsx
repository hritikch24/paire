import { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView } from "react-native";
import { Text, YStack } from "tamagui";
import { DIWALI_LABELS, DIWALI_VIBES, DiwaliPlan, DiwaliVibe, MAX_DIWALI_CHOICES, diwaliDates, diwaliDayLabel, diwaliOpen, normalizeDiwaliPlan } from "../data/diwali";
import { friendlyError } from "../services/errors";
import { updateSettings } from "../services/profileService";
import { useAuthStore } from "../store/authStore";
import { ChipGroup } from "./Chip";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { SettingsRow, SettingsSection } from "./SettingsRow";
import { showToast } from "./Toast";

export const DIWALI_PAGE = "https://www.paire.in/diwali-together/";
const EMOJI: Record<DiwaliVibe, string> = { chai: "☕", mela: "🎡", lights: "✨", meal: "🍽️", bash: "🎉" };
const HINT: Partial<Record<DiwaliVibe, string>> = {
  bash: "A Diwali bash is for anyone heading to a Diwali party or get-together. Paire doesn't host these. Chat first, and tell a friend where you're going."
};
export const DIWALI_PRIVACY_NOTE =
  "Free and optional, for adults 18+. Paire doesn't organise or host anything: you only meet people who choose a matching plan and say yes back. They see how many days and which plans you share, never your exact days, address or anything about your home. Meet in public places. Withdraw whenever you like.";

const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);

export function DiwaliSheet({ visible, onClose, onSaved, onWithdrawn, initialVibe }: { visible: boolean; onClose: () => void; onSaved: (plan: DiwaliPlan) => void; onWithdrawn?: () => void; initialVibe?: string | null }) {
  const uid = useAuthStore((state) => state.user?.uid);
  const rawPlan = useAuthStore((state) => state.settings?.diwaliPlan);
  const saved = useMemo(() => normalizeDiwaliPlan(rawPlan), [rawPlan]);
  const hasArea = useAuthStore((state) => Boolean(state.profile?.city?.trim() || state.settings?.locationEnabled));
  const [dates, setDates] = useState<string[]>([]);
  const [vibes, setVibes] = useState<DiwaliVibe[]>([]);
  const [busy, setBusy] = useState<"save" | "withdraw" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDates(saved?.dates ?? []);
    const start = DIWALI_VIBES.find((vibe) => vibe === initialVibe);
    setVibes(saved?.vibes ?? (start ? [start] : []));
    // Only when the sheet opens: a background settings sync must not undo someone's taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pick = <T extends string>(setter: (update: (list: T[]) => T[]) => void, current: T[], item: T, noun: string) => {
    if (!current.includes(item) && current.length >= MAX_DIWALI_CHOICES) {
      showToast(`Pick up to ${MAX_DIWALI_CHOICES} ${noun}. Tap one to swap it.`);
      return;
    }
    setter((list) => toggle(list, item));
  };
  const save = async () => {
    if (!uid || busy || !dates.length || !vibes.length) return;
    const plan = { dates: [...dates].sort(), vibes };
    setBusy("save");
    try {
      await updateSettings(uid, { diwaliPlan: plan });
      onSaved(plan);
    } catch (error) {
      showToast(friendlyError(error, "Couldn't save your plans. Try again."), "error");
    } finally { setBusy(null); }
  };
  const withdraw = async () => {
    if (!uid || busy) return;
    setBusy("withdraw");
    try {
      await updateSettings(uid, { diwaliPlan: null });
      showToast("You've left Diwali Together. Nothing else about your profile changed.", "success");
      onWithdrawn?.();
      onClose();
    } catch (error) {
      showToast(friendlyError(error, "Couldn't update that. Try again."), "error");
    } finally { setBusy(null); }
  };
  const hint = vibes.map((vibe) => HINT[vibe]).find(Boolean);
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }} statusBarTranslucent>
      <YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end" alignItems="center">
        <YStack testID="diwali-sheet" backgroundColor="$background" borderTopLeftRadius="$6" borderTopRightRadius="$6" width="100%" maxWidth={560} maxHeight="92%" overflow="hidden">
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 28, gap: 18 }}>
            <YStack gap="$1">
              <Text fontSize="$7" fontWeight="700" accessibilityRole="header">🪔 Diwali Together</Text>
              <Text color="$textMuted" lineHeight={22}>Celebrating away from home? Pick what you'd enjoy and when, and see others who picked the same. Nobody is organising anything: you decide together.</Text>
            </YStack>
            <YStack gap="$2">
              <Text fontSize="$3" fontWeight="700">What would you enjoy? <Text fontWeight="400" color="$textMuted">Up to {MAX_DIWALI_CHOICES}</Text></Text>
              <ChipGroup
                testIDPrefix="diwali-vibe"
                options={DIWALI_VIBES.map((id) => ({ id, label: DIWALI_LABELS[id], emoji: EMOJI[id] }))}
                selected={vibes}
                onToggle={(id) => pick<DiwaliVibe>(setVibes, vibes, id, "plans")}
              />
              {hint ? <Text testID="diwali-hint" fontSize="$2" color="$textMuted" lineHeight={20}>{hint}</Text> : null}
            </YStack>
            <YStack gap="$2">
              <Text fontSize="$3" fontWeight="700">Which days? <Text fontWeight="400" color="$textMuted">Up to {MAX_DIWALI_CHOICES} · Diwali is Sun 8 Nov</Text></Text>
              <ChipGroup
                testIDPrefix="diwali-date"
                options={diwaliDates().map((date) => ({ id: date, label: diwaliDayLabel(date) }))}
                selected={dates}
                onToggle={(date) => pick<string>(setDates, dates, date, "days")}
              />
            </YStack>
            {!hasArea ? (
              <Text testID="diwali-area-note" fontSize="$2" color="$text" lineHeight={20} backgroundColor="$primarySoft" padding="$3" borderRadius="$4">
                Add your city in your profile, or turn on approximate location, so we can find people in your area.
              </Text>
            ) : null}
            <Text fontSize="$1" color="$textMuted" lineHeight={18}>{DIWALI_PRIVACY_NOTE}</Text>
            <YStack gap="$2">
              <PrimaryButton testID="diwali-save" onPress={() => void save()} disabled={!dates.length || !vibes.length || busy === "withdraw"} loading={busy === "save"}>
                {!vibes.length ? "Pick a plan" : !dates.length ? "Pick a day" : saved ? `Update my plans (${count(dates.length, "day")})` : `Join Diwali Together (${count(dates.length, "day")})`}
              </PrimaryButton>
              {saved ? <SecondaryButton testID="diwali-withdraw" onPress={() => void withdraw()} loading={busy === "withdraw"} disabled={busy === "save"}>Leave Diwali Together</SecondaryButton> : null}
              <SecondaryButton testID="diwali-close" onPress={onClose} disabled={Boolean(busy)}>{saved ? "Close" : "Not now"}</SecondaryButton>
            </YStack>
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  );
}

/** Settings: shown while the season is open (an expired plan is simply never used). */
export function DiwaliSettingsSection({ onEdit }: { onEdit: () => void }) {
  const rawPlan = useAuthStore((state) => state.settings?.diwaliPlan);
  const plan = useMemo(() => normalizeDiwaliPlan(rawPlan), [rawPlan]);
  if (!diwaliOpen()) return null;
  return (
    <SettingsSection title="🪔 Diwali Together" footer={DIWALI_PRIVACY_NOTE}>
      <SettingsRow
        testID="settings-diwali"
        icon="sparkles-outline"
        label={plan ? "My Diwali plans" : "Find company for Diwali"}
        description={plan ? `${plan.vibes.map((vibe) => DIWALI_LABELS[vibe]).join(" · ")} · ${plan.dates.length} day${plan.dates.length === 1 ? "" : "s"}` : "Optional. Pick plans and days, and meet others who chose the same."}
        onPress={onEdit}
        showDivider={false}
      />
    </SettingsSection>
  );
}

/** Web Share where the browser has it, otherwise copy the page link. Cancelling is not an error. */
export async function shareDiwaliInvite(): Promise<void> {
  const data = { title: "Diwali Together on Paire", text: "Spending Diwali away from home? Make an invitation card, or join Diwali Together on Paire.", url: DIWALI_PAGE };
  try {
    if (navigator.share) { await navigator.share(data); return; }
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(DIWALI_PAGE);
    showToast("Link copied. Send it to someone who might like company.", "success");
  } catch { showToast(`Copy this link: ${DIWALI_PAGE}`); }
}
