import { forwardRef, useCallback, useImperativeHandle, useMemo } from "react";
import { Image, useWindowDimensions } from "react-native";
import { Card, Text, XStack, YStack } from "tamagui";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { UserProfile, SwipeType } from "../types/models";
import { museCards } from "../data/museCards";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { datingIntentionMap } from "../data/datingIntentions";
import { useAuthStore } from "../store/authStore";
import { distanceKm, formatDistanceKm } from "../utils/distance";
import { vibeMap } from "../data/vibes";

const NEARBY_NOW_DISTANCE_KM = 5;
const NEARBY_NOW_WINDOW_MS = 15 * 60 * 1000;

const AnimatedCard = Animated.createAnimatedComponent(Card);

type SwipeDeckProps = {
  profile?: UserProfile;
  onSwipe: (profile: UserProfile, type: SwipeType) => void;
  isBlindMode?: boolean;
};

export type SwipeDeckHandle = {
  swipe: (type: SwipeType) => void;
  reset: () => void;
};

export const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(function SwipeDeck(
  { profile, onSwipe, isBlindMode = false },
  ref
) {
  const { height, width, fontScale } = useWindowDimensions();
  const compact = height < 700 || width <= 360 || fontScale >= 1.2;
  const currentProfile = useAuthStore((state) => state.profile);
  const interestMap = new Map(museCards.map((card) => [card.id, card]));
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const swipeDurationMs = 240;
  const swipeXThreshold = 120;
  const swipeYThreshold = -120;

  const reset = useCallback(() => {
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
  }, [translateX, translateY]);

  const handleSwipe = useCallback(
    (type: SwipeType) => {
      if (!profile) return;
      onSwipe(profile, type);
      reset();
    },
    [onSwipe, profile]
  );

  const animateSwipe = useCallback(
    (type: SwipeType) => {
      if (!profile) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const offscreenX =
        type === "like" ? width * 1.2 : type === "nope" ? -width * 1.2 : 0;
      const offscreenY = type === "super" ? -height * 0.6 : 0;

      if (type === "super") {
        translateY.value = withTiming(offscreenY, { duration: swipeDurationMs }, (finished) => {
          if (finished) {
            runOnJS(handleSwipe)(type);
          }
        });
        translateX.value = withTiming(0, { duration: swipeDurationMs });
      } else {
        translateX.value = withTiming(offscreenX, { duration: swipeDurationMs }, (finished) => {
          if (finished) {
            runOnJS(handleSwipe)(type);
          }
        });
        translateY.value = withTiming(0, { duration: swipeDurationMs });
      }
    },
    [handleSwipe, height, profile, translateX, translateY, width]
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .activeOffsetY([-20, 20])
        .onUpdate((event) => {
          translateX.value = event.translationX;
          translateY.value = event.translationY;
        })
        .onEnd(() => {
          if (translateX.value > swipeXThreshold) {
            runOnJS(animateSwipe)("like");
          } else if (translateX.value < -swipeXThreshold) {
            runOnJS(animateSwipe)("nope");
          } else if (translateY.value < swipeYThreshold) {
            runOnJS(animateSwipe)("super");
          } else {
            reset();
          }
        }),
    [animateSwipe, reset, swipeXThreshold, swipeYThreshold, translateX, translateY]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${translateX.value / 20}deg` }
    ]
  }));

  useImperativeHandle(
    ref,
    () => ({
      swipe: animateSwipe,
      reset
    }),
    [animateSwipe, reset]
  );

  if (!profile) {
    return (
      <YStack alignItems="center" padding="$4">
        <Text color="$textMuted">No more profiles right now.</Text>
      </YStack>
    );
  }

  const cardWidth = Math.min(width - 32, 420);
  const imageHeight = Math.min(
    compact ? 260 : 360,
    Math.max(compact ? 160 : 200, Math.round(height * (compact ? 0.28 : 0.34)))
  );
  const quickAnswers = profile.quickAnswers ?? [];
  const quickAnswerItems = quickAnswers
    .map((entry) => ({
      question: rapidQuestionMap.get(entry.questionId)?.question ?? "Quick take",
      answer: entry.answer
    }))
    .slice(0, compact ? 2 : 3);
  const intentionItems = (profile.intentions ?? [])
    .map((id) => datingIntentionMap.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 2);
  const vibeItems = (profile.vibes ?? [])
    .map((id) => vibeMap.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3);
  const vibeMatch = currentProfile?.vibes
    ? vibeItems.filter((item) => currentProfile.vibes?.includes(item.id))
    : [];
  const canShowDistance =
    Boolean(currentProfile?.shareLocation && currentProfile?.location) &&
    Boolean(profile.shareLocation && profile.location);
  const distanceValue = canShowDistance
    ? distanceKm(
        { lat: currentProfile!.location!.lat, lng: currentProfile!.location!.lng },
        { lat: profile.location!.lat, lng: profile.location!.lng }
      )
    : null;
  const distanceLabel = distanceValue !== null ? formatDistanceKm(distanceValue) : "";
  const nearbyNow =
    distanceValue !== null &&
    distanceValue <= NEARBY_NOW_DISTANCE_KM &&
    Boolean(profile.lastActiveAt) &&
    Date.now() - profile.lastActiveAt <= NEARBY_NOW_WINDOW_MS;

  return (
    <GestureDetector gesture={gesture}>
      <AnimatedCard
        style={animatedStyle}
        backgroundColor="$card"
        borderRadius="$5"
        padding="$3"
        bordered
        width={cardWidth}
        alignSelf="center"
        shadowColor="#000000"
        shadowOpacity={0.12}
        shadowRadius={18}
        shadowOffset={{ width: 0, height: 10 }}
        elevation={5}
      >
        {isBlindMode ? (
          <YStack
            height={imageHeight}
            borderRadius="$5"
            backgroundColor="$backgroundSoft"
            alignItems="center"
            justifyContent="center"
            gap="$2"
          >
            <Text fontSize="$8">🎭</Text>
            <Text fontSize="$6" fontWeight="700">
              Blind Muse
            </Text>
            <Text color="$textMuted" fontSize="$2" textAlign="center">
              Reveal after your first chat.
            </Text>
            <Text fontSize="$2">🌶️🌶️</Text>
          </YStack>
        ) : profile.photoUrls?.[0] ? (
          <Image
            source={{ uri: profile.photoUrls[0] }}
            style={{ width: "100%", height: imageHeight, borderRadius: 20 }}
          />
        ) : (
          <YStack height={imageHeight} borderRadius="$5" backgroundColor="$backgroundSoft" />
        )}
        <YStack paddingTop="$3" gap="$2">
          {isBlindMode ? (
            <>
              <Text fontSize="$6" fontWeight="700">
                Blind Muse
              </Text>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                {profile.pronouns ? <Text color="$textMuted">{profile.pronouns}</Text> : null}
                {profile.city ? <Text color="$textMuted">• {profile.city}</Text> : null}
                {distanceLabel ? <Text color="$textMuted">• {distanceLabel}</Text> : null}
                {nearbyNow ? (
                  <Text
                    backgroundColor="$primarySoft"
                    color="$primary"
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius="$4"
                    fontSize="$1"
                  >
                    Nearby now
                  </Text>
                ) : null}
              </XStack>
              {quickAnswerItems.length ? (
                <YStack gap="$2">
                  {quickAnswerItems.map((item, index) => (
                    <YStack
                      key={`${item.question}-${index}`}
                      backgroundColor="$backgroundStrong"
                      padding="$2"
                      borderRadius="$4"
                      borderWidth={1}
                      borderColor="$border"
                    >
                      <Text fontSize="$2" fontWeight="600">
                        {item.question}
                      </Text>
                      <Text fontSize="$2" color="$textMuted">
                        {item.answer}
                      </Text>
                    </YStack>
                  ))}
                </YStack>
              ) : (
                <Text color="$textMuted" fontSize="$2">
                  No quick answers yet.
                </Text>
              )}
            </>
          ) : (
            <>
              <Text fontSize="$6" fontWeight="700">
                {profile.displayName}, {profile.age}
              </Text>
              <XStack gap="$2" alignItems="center">
                {profile.pronouns ? <Text color="$textMuted">{profile.pronouns}</Text> : null}
                {profile.city ? <Text color="$textMuted">• {profile.city}</Text> : null}
                {distanceLabel ? <Text color="$textMuted">• {distanceLabel}</Text> : null}
              </XStack>
              {intentionItems.length ? (
                <XStack gap="$2" flexWrap="wrap">
                  {intentionItems.map((item) => (
                    <Text
                      key={item.id}
                      paddingHorizontal="$3"
                      paddingVertical="$1"
                      borderRadius="$5"
                      backgroundColor="$backgroundSoft"
                      fontSize="$2"
                    >
                      {item.emoji} {item.label}
                    </Text>
                  ))}
                </XStack>
              ) : null}
              {vibeItems.length ? (
                <XStack gap="$2" flexWrap="wrap">
                  {vibeItems.map((item) => (
                    <Text
                      key={item.id}
                      paddingHorizontal="$3"
                      paddingVertical="$1"
                      borderRadius="$5"
                      backgroundColor="$backgroundStrong"
                      fontSize="$2"
                    >
                      {item.emoji} {item.label}
                    </Text>
                  ))}
                </XStack>
              ) : null}
              {vibeMatch.length ? (
                <Text fontSize="$2" color="$textMuted">
                  Vibe match: {vibeMatch.map((item) => item.label).join(", ")}
                </Text>
              ) : null}
              <Text numberOfLines={2}>{profile.bio}</Text>
              {profile.interests?.length ? (
                <XStack gap="$2" flexWrap="wrap">
                  {profile.interests.slice(0, 3).map((interest) => {
                    const card = interestMap.get(interest);
                    const label = card ? `${card.emoji} ${card.title}` : interest;
                    return (
                      <Text
                        key={interest}
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                        borderRadius="$5"
                        backgroundColor="$backgroundSoft"
                        fontSize="$2"
                      >
                        {label}
                      </Text>
                    );
                  })}
                </XStack>
              ) : null}
            </>
          )}
        </YStack>
      </AnimatedCard>
    </GestureDetector>
  );
});
