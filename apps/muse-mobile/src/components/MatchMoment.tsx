import { useEffect, useRef } from "react";
import { Animated, Image } from "react-native";
import { Card, Text, XStack, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { UserProfile } from "../types/models";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MatchMomentProps = {
  profile: UserProfile;
  isGuest: boolean;
  onClose: () => void;
  onChat: () => void;
  onCreateAccount: () => void;
};

export function MatchMoment({
  profile,
  isGuest,
  onClose,
  onChat,
  onCreateAccount
}: MatchMomentProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 16, bounciness: 8, useNativeDriver: true })
    ]).start();
  }, [fade, scale]);

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="rgba(15, 29, 38, 0.6)"
      padding="$4"
      paddingTop={Math.max(insets.top, 16)}
      paddingBottom={Math.max(insets.bottom, 16)}
      alignItems="center"
      justifyContent="center"
      zIndex={20}
    >
      <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
        <Card
          padding="$4"
          borderRadius="$5"
          backgroundColor="$backgroundStrong"
          borderWidth={1}
          borderColor="$border"
          width={320}
          maxWidth="100%"
        >
          <YStack gap="$3" alignItems="center">
            <Text fontSize="$7" fontWeight="700">
              It’s a Muse ✨
            </Text>
            <Text color="$textMuted" textAlign="center">
              You and {profile.displayName} are on the same wavelength.
            </Text>
            <XStack gap="$3" alignItems="center">
              {profile.photoUrls?.[0] ? (
                <Image
                  source={{ uri: profile.photoUrls[0] }}
                  style={{ width: 72, height: 72, borderRadius: 22 }}
                />
              ) : (
                <YStack
                  width={72}
                  height={72}
                  borderRadius={22}
                  backgroundColor="$backgroundSoft"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="$6" fontWeight="700">
                    {profile.displayName?.slice(0, 1) ?? "M"}
                  </Text>
                </YStack>
              )}
            </XStack>
            {isGuest ? (
              <PrimaryButton onPress={onCreateAccount}>Create account to chat</PrimaryButton>
            ) : (
              <PrimaryButton onPress={onChat}>Say hi</PrimaryButton>
            )}
            <SecondaryButton onPress={onClose}>Keep swiping</SecondaryButton>
          </YStack>
        </Card>
      </Animated.View>
    </YStack>
  );
}
