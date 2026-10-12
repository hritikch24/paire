import { useEffect, useRef } from "react";
import { Animated, Platform } from "react-native";
import { YStack } from "tamagui";
import { useReducedMotion } from "../hooks/useReducedMotion";

/** A calm, card-shaped placeholder while people load: the deck feels instant, not stuck. */
export function CardSkeleton({ label = "Finding people for you" }: { label?: string }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== "web" })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <Animated.View style={{ flex: 1, opacity: pulse }} accessibilityRole="progressbar" accessibilityLabel={label} testID="card-skeleton">
      <YStack flex={1} borderRadius={24} backgroundColor="$backgroundSoft" overflow="hidden" justifyContent="flex-end" padding="$5" gap="$3">
        <YStack width="62%" height={26} borderRadius={8} backgroundColor="$border" />
        <YStack width="40%" height={16} borderRadius={8} backgroundColor="$border" />
        <YStack flexDirection="row" gap="$2">
          {[64, 84, 56].map((width) => (
            <YStack key={width} width={width} height={28} borderRadius={999} backgroundColor="$border" />
          ))}
        </YStack>
      </YStack>
    </Animated.View>
  );
}
