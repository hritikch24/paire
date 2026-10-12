import { useAppDimensions } from "../utils/useAppDimensions";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import {
  BasicOption,
  DIET,
  EDUCATION,
  formatHeight,
  HABIT,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  LANGUAGES,
  MAX_LANGUAGES,
  RELIGION
} from "../data/basics";
import { museCards } from "../data/museCards";
import { getRapidQuestionSet } from "../data/rapidQuestions";
import { ProfileBasics, QuickAnswer } from "../types/models";
import { Chip, ChipGroup } from "./Chip";
import { Icon } from "./Icon";
import { TextField } from "./MuseInput";
import { RangeSlider } from "./RangeSlider";

/** Pickers shared by sign-up and profile editing. */

export const BIO_MAX = 300;
export const MAX_INTERESTS = 10;
export const MAX_INTENTIONS = 2;
export const MAX_VIBES = 3;

export function toggleLimited(list: string[], id: string, max: number): string[] {
  if (list.includes(id)) return list.filter((item) => item !== id);
  if (list.length >= max) return max === 1 ? [id] : list;
  return [...list, id];
}

export function MuseCardPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const { width } = useAppDimensions();
  const cardWidth = Math.floor((Math.min(width, 520) - 32 - 12) / 2);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((item) => item !== id));
    else if (selected.length < MAX_INTERESTS) onChange([...selected, id]);
  };

  return (
    <XStack flexWrap="wrap" gap="$3">
      {museCards.map((card) => {
        const active = selected.includes(card.id);
        return (
          <Pressable
            key={card.id}
            testID={`interest-${card.id}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${card.title}: ${card.description}`}
            onPress={() => toggle(card.id)}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <YStack
              width={cardWidth}
              minHeight={104}
              padding="$3"
              gap="$1"
              borderRadius="$5"
              borderWidth={active ? 2 : 1}
              borderColor={active ? "$primary" : "$border"}
              backgroundColor={active ? "$primarySoft" : "$backgroundStrong"}
            >
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize="$6">{card.emoji}</Text>
                {active ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
              </XStack>
              <Text fontWeight="700" fontSize="$4">
                {card.title}
              </Text>
              <Text fontSize="$2" color="$textMuted" numberOfLines={2}>
                {card.description}
              </Text>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

export function answersToRecord(answers: QuickAnswer[] | undefined): Record<string, string> {
  return Object.fromEntries((answers ?? []).map((entry) => [entry.questionId, entry.answer]));
}

export function recordToAnswers(record: Record<string, string>): QuickAnswer[] {
  return getRapidQuestionSet()
    .filter((question) => record[question.id])
    .map((question) => ({ questionId: question.id, answer: record[question.id] }));
}

export function RapidQuestionPicker({
  answers,
  onChange
}: {
  answers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <YStack gap="$5">
      {getRapidQuestionSet().map((question) => (
        <YStack key={question.id} gap="$2">
          <Text fontWeight="700" fontSize="$4">
            {question.question}
          </Text>
          <XStack flexWrap="wrap" gap="$2">
            {question.options.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={answers[question.id] === option}
                onPress={() => {
                  const next = { ...answers };
                  if (next[question.id] === option) delete next[question.id];
                  else next[question.id] = option;
                  onChange(next);
                }}
              />
            ))}
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}

/** Single choice that can be cleared by tapping it again. */
function OptionalChoice({
  title,
  options,
  value,
  onChange,
  testIDPrefix
}: {
  title: string;
  options: BasicOption[];
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  testIDPrefix: string;
}) {
  return (
    <YStack gap="$2">
      <Text fontWeight="600" fontSize="$2">
        {title}
      </Text>
      <ChipGroup
        testIDPrefix={testIDPrefix}
        options={options}
        selected={value ? [value] : []}
        onToggle={(id) => onChange(id === value ? undefined : id)}
      />
    </YStack>
  );
}

/**
 * Height, work, education, religion, diet, drinking and smoking. Every field is
 * optional; tap a selected chip again to clear it. There is no caste field.
 */
export function BasicsEditor({ value, onChange }: { value: ProfileBasics; onChange: (next: ProfileBasics) => void }) {
  const set = <K extends keyof ProfileBasics>(key: K, next: ProfileBasics[K] | undefined) => {
    const copy = { ...value };
    if (next === undefined || next === "") delete copy[key];
    else copy[key] = next;
    onChange(copy);
  };
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <RangeSlider
          testID="basics-height"
          label="Height"
          min={HEIGHT_MIN_CM}
          max={HEIGHT_MAX_CM}
          value={[value.heightCm ?? 165]}
          format={([cm]) => (value.heightCm === undefined && cm === 165 ? "Slide to add" : `${formatHeight(cm)} (${cm} cm)`)}
          onCommit={([cm]) => set("heightCm", cm)}
        />
        {value.heightCm ? (
          <Text color="$primary" fontSize="$2" onPress={() => set("heightCm", undefined)} accessibilityRole="button">
            Hide my height
          </Text>
        ) : null}
      </YStack>
      <TextField
        testID="basics-work"
        label="Work"
        placeholder="e.g. Product designer at a startup"
        maxLength={60}
        value={value.work ?? ""}
        onChangeText={(text) => set("work", text.trimStart() || undefined)}
      />
      <OptionalChoice testIDPrefix="basics-education" title="Education" options={EDUCATION} value={value.education} onChange={(next) => set("education", next)} />
      <OptionalChoice testIDPrefix="basics-diet" title="Food" options={DIET} value={value.diet} onChange={(next) => set("diet", next)} />
      <OptionalChoice testIDPrefix="basics-drinking" title="Drinking" options={HABIT} value={value.drinking} onChange={(next) => set("drinking", next)} />
      <OptionalChoice testIDPrefix="basics-smoking" title="Smoking" options={HABIT} value={value.smoking} onChange={(next) => set("smoking", next)} />
      <OptionalChoice
        testIDPrefix="basics-religion"
        title="Religion (optional)"
        options={RELIGION}
        value={value.religion}
        onChange={(next) => set("religion", next)}
      />
    </YStack>
  );
}

export function LanguagePicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <ChipGroup
      testIDPrefix="language"
      options={LANGUAGES}
      selected={selected}
      onToggle={(id) => onChange(toggleLimited(selected, id, MAX_LANGUAGES))}
    />
  );
}
