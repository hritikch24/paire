import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import { Text, YStack } from "tamagui";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Icon } from "./Icon";

const native = Platform.OS !== "web";

/**
 * The signature moment: when a like goes out with a note, the note folds into a
 * paper aeroplane and flies off to them. Shown over the screen, never blocking
 * taps. `flightKey` changes for each new note; null hides it.
 */
export function NoteFlight({ flightKey, name, onDone }: { flightKey: number | null; name: string; onDone: () => void }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const caption = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (flightKey === null) return;
    progress.setValue(0);
    caption.setValue(0);
    const flight = reduced
      ? Animated.timing(caption, { toValue: 1, duration: 200, useNativeDriver: native })
      : Animated.parallel([
          Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.bezier(0.3, 0.1, 0.25, 1), useNativeDriver: native }),
          Animated.sequence([
            Animated.timing(caption, { toValue: 1, duration: 220, useNativeDriver: native }),
            Animated.delay(900),
            Animated.timing(caption, { toValue: 0, duration: 260, useNativeDriver: native })
          ])
        ]);
    flight.start(() => {
      if (reduced) setTimeout(onDone, 1200);
      else onDone();
    });
  }, [caption, flightKey, onDone, progress, reduced]);

  if (flightKey === null) return null;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-120, 260] });
  const translateY = progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [120, 40, -420] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["-12deg", "-34deg"] });
  const scale = progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.1, 0.5] });
  const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });

  return (
    <YStack style={StyleSheet.absoluteFill} pointerEvents="none" alignItems="center" justifyContent="center" testID="note-flight">
      {reduced ? null : (
        <Animated.View style={{ opacity, transform: [{ translateX }, { translateY }, { rotate }, { scale }] }}>
          <YStack
            width={76}
            height={76}
            borderRadius={38}
            backgroundColor="$primary"
            alignItems="center"
            justifyContent="center"
            shadowColor="#000"
            shadowOpacity={0.2}
            shadowRadius={14}
            shadowOffset={{ width: 0, height: 6 }}
          >
            <Icon name="paper-plane" size={36} color="primaryForeground" />
          </YStack>
        </Animated.View>
      )}
      <Animated.View style={{ position: "absolute", bottom: 150, opacity: caption }}>
        <YStack backgroundColor="$backgroundStrong" borderRadius={999} paddingHorizontal="$4" paddingVertical="$2" borderWidth={1} borderColor="$border">
          <Text fontWeight="700" fontSize="$3" accessibilityLiveRegion="polite">
            Your note is on its way to {name.split(" ")[0]} ✉️
          </Text>
        </YStack>
      </Animated.View>
    </YStack>
  );
}
