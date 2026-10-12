import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useThemeColors } from '../theme/useThemeColors';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { GhostButton, SecondaryButton } from './MuseButton';

type MatchMomentProps = {
  visible: boolean;
  me: { name: string; photoUrl?: string | null };
  them: { name: string; photoUrl?: string | null };
  onMessage: () => void;
  onClose: () => void;
  /** Defaults to a one-to-one match ("It's a match!"). */
  title?: string;
  subtitle?: string;
};

/** Celebration shown only when a like is mutual (the server confirmed the match). */
const native = Platform.OS !== 'web';
/** Little hearts that drift up behind the pair: x offset, delay, size. */
const FLOATERS: Array<[number, number, number]> = [[-120, 0, 18], [-60, 260, 14], [10, 120, 22], [80, 380, 16], [130, 180, 12], [-150, 520, 14]];

/** Celebration shown only when a like is mutual (the server confirmed the match). */
export function MatchMoment({ visible, me, them, onMessage, onClose, title, subtitle }: MatchMomentProps) {
  const insets = useSafeAreaInsets();
  const { gradient } = useThemeColors();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // 0 → 1: the two photos slide in from the sides and meet; then the heart pops.
  const meet = useRef(new Animated.Value(0)).current;
  const heart = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.85);
    opacity.setValue(0);
    meet.setValue(reduced ? 1 : 0);
    heart.setValue(reduced ? 1 : 0);
    drift.setValue(0);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: native }),
      Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: native })
    ]).start();
    if (reduced) return;
    Animated.sequence([
      Animated.timing(meet, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }),
      Animated.spring(heart, { toValue: 1, speed: 10, bounciness: 16, useNativeDriver: native })
    ]).start(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined));
    const loop = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [drift, heart, meet, opacity, reduced, scale, visible]);

  const leftX = meet.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] });
  const rightX = meet.interpolate({ inputRange: [0, 1], outputRange: [160, 0] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <LinearGradient
        colors={[gradient[0], gradient[1], gradient[2]]}
        style={{ flex: 1 }}
      >
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          paddingHorizontal="$6"
          paddingTop={insets.top}
          paddingBottom={insets.bottom}
        >
          <Animated.View style={{ opacity, transform: [{ scale }], width: '100%', maxWidth: 380 }}>
            <YStack alignItems="center" gap="$5">
              <YStack alignItems="center" gap="$2">
                <Text
                  color="white"
                  fontSize="$9"
                  fontWeight="700"
                  textAlign="center"
                  accessibilityRole="header"
                >
                  {title ?? "It's a match!"}
                </Text>
                <Text color="rgba(255,255,255,0.85)" textAlign="center" fontSize="$4">
                  {subtitle ?? `You and ${them.name} liked each other.`}
                </Text>
              </YStack>
              <XStack alignItems="center" justifyContent="center" height={150}>
                {reduced
                  ? null
                  : FLOATERS.map(([x, delay, size]) => {
                      const shifted = Animated.modulo(Animated.add(drift, delay / 3200), 1);
                      return (
                        <Animated.View
                          key={`${x}-${delay}`}
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            transform: [
                              { translateX: x },
                              { translateY: shifted.interpolate({ inputRange: [0, 1], outputRange: [60, -170] }) }
                            ],
                            opacity: shifted.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 0.75, 0.5, 0] })
                          }}
                        >
                          <Icon name="heart" size={size} color="rgba(255,255,255,0.85)" />
                        </Animated.View>
                      );
                    })}
                <Animated.View style={{ transform: [{ translateX: leftX }, { rotate: '-8deg' }] }}>
                  <Avatar uri={me.photoUrl} name={me.name} size={112} ring />
                </Animated.View>
                <Animated.View style={{ transform: [{ translateX: rightX }, { rotate: '8deg' }], marginLeft: -18 }}>
                  <Avatar uri={them.photoUrl} name={them.name} size={112} ring />
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={{ position: 'absolute', bottom: 2, transform: [{ scale: heart }] }}
                >
                  <YStack width={48} height={48} borderRadius={24} backgroundColor="white" alignItems="center" justifyContent="center">
                    <Icon name="heart" size={26} color="primary" />
                  </YStack>
                </Animated.View>
              </XStack>
              <YStack gap="$3" width="100%">
                {/* White on the gradient: the one obvious next step. */}
                <SecondaryButton
                  testID="match-message"
                  onPress={onMessage}
                  backgroundColor="white"
                  borderColor="white"
                  color="$primary"
                  fontWeight="700"
                  pressStyle={{ backgroundColor: 'rgba(255,255,255,0.88)' }}
                >
                  Send a message
                </SecondaryButton>
                <GhostButton testID="match-keep-swiping" onPress={onClose} color="white">
                  Keep swiping
                </GhostButton>
              </YStack>
            </YStack>
          </Animated.View>
        </YStack>
      </LinearGradient>
    </Modal>
  );
}
