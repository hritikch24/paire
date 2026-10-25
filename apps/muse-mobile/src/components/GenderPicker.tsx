import { Text, YStack } from "tamagui";
import { GENDERS, Gender } from "../types/models";
import { GENDER_LABELS } from "../utils/profile";
import { ChipGroup } from "./Chip";

export const GENDER_LOCKED_NOTE = "Contact support to change this.";

/** The gender choice. While free sending for women is on it is read-only: the rules refuse a change, and it decides who sends free. */
export function GenderPicker({ value, onChange, locked }: { value: Gender; onChange: (next: Gender) => void; locked: boolean }) {
  return (
    <YStack gap="$2">
      <ChipGroup options={GENDERS.map((id) => ({ id, label: GENDER_LABELS[id] }))} selected={[value]} onToggle={onChange} disabled={locked} />
      {locked ? (
        <Text color="$textMuted" fontSize="$2" testID="gender-locked-note">
          {GENDER_LOCKED_NOTE}
        </Text>
      ) : null}
    </YStack>
  );
}
