import { useEffect, useRef, useState } from "react";
import { Slider, Text, XStack, YStack } from "tamagui";

type RangeSliderProps = {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number[];
  format: (value: number[]) => string;
  /** Called when the user lets go, so settings aren't written on every frame. */
  onCommit: (value: number[]) => void;
  disabled?: boolean;
  testID?: string;
};

/** One- or two-thumb slider with a live label. */
export function RangeSlider({ label, min, max, step = 1, value, format, onCommit, disabled, testID }: RangeSliderProps) {
  const [local, setLocal] = useState(value);
  const latest = useRef(value);

  useEffect(() => {
    setLocal(value);
    latest.current = value;
    // Resync only when the stored value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  return (
    <YStack gap="$3" paddingHorizontal="$4" paddingVertical="$3" opacity={disabled ? 0.5 : 1}>
      <XStack justifyContent="space-between">
        <Text fontSize="$4">{label}</Text>
        <Text fontSize="$4" color="$textMuted">
          {format(local)}
        </Text>
      </XStack>
      <Slider
        testID={testID}
        value={local}
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={1}
        disabled={disabled}
        onValueChange={(next) => {
          latest.current = next;
          setLocal(next);
        }}
        onSlideEnd={() => onCommit(latest.current)}
        accessibilityLabel={label}
      >
        <Slider.Track backgroundColor="$border" height={4}>
          <Slider.TrackActive backgroundColor="$primary" />
        </Slider.Track>
        {local.map((_, index) => (
          <Slider.Thumb
            key={index}
            index={index}
            circular
            size="$1"
            backgroundColor="white"
            borderWidth={2}
            borderColor="$primary"
            elevate
          />
        ))}
      </Slider>
    </YStack>
  );
}
