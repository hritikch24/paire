import { ageGapLabel } from "../data/ageGap";
import { garbaBadge } from "../data/garba";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Text, XStack, YStack } from "tamagui";
import { cardBasics } from "../data/basics";
import { museCardMap } from "../data/museCards";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { vibeMap } from "../data/vibes";
import { resolveServerUrl } from "../services/testServer";
import { useThemeColors } from "../theme/useThemeColors";
import { DiscoverProfile, SwipeType } from "../types/models";
import { compatibilityLabel, reasonLines } from "../utils/insights";
import { Icon } from "./Icon";

export type SwipeDeckHandle = { swipe: (type: SwipeType) => void };

type SwipeDeckProps = {
  profiles: DiscoverProfile[];
  onSwipe: (profile: DiscoverProfile, type: SwipeType) => void;
  onOpenProfile: (profile: DiscoverProfile) => void;
  blindMode: boolean;
};

type Size = { width: number; height: number };

/**
 * Card stack for Discover. The top card follows the finger; releasing past the
 * threshold (or flicking) commits a like (right), pass (left) or Super Like (up).
 */
export const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(function SwipeDeck(
  { profiles, onSwipe, onOpenProfile, blindMode },
  ref
) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const dragProgress = useSharedValue(0);
  const topCard = useRef<SwipeDeckHandle>(null);
  const [top, next] = profiles;

  useEffect(() => {
    // The card behind settles back as a new card takes the top spot.
    dragProgress.value = withTiming(0, { duration: 200 });
  }, [dragProgress, top?.uid]);

  useEffect(() => {
    const upcoming = profiles
      .slice(0, 4)
      .flatMap((profile) => profile.photoUrls.slice(0, 2))
      .filter(Boolean);
    if (upcoming.length) void Image.prefetch(upcoming, "memory-disk").catch(() => undefined);
  }, [profiles]);

  useImperativeHandle(ref, () => ({ swipe: (type) => topCard.current?.swipe(type) }), []);

  return (
    <View
      testID="discover-deck"
      style={styles.deck}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}
    >
      {size.width > 0 && next ? (
        <SwipeCard key={next.uid} profile={next} size={size} isTop={false} dragProgress={dragProgress} blindMode={blindMode} />
      ) : null}
      {size.width > 0 && top ? (
        <SwipeCard
          key={top.uid}
          ref={topCard}
          profile={top}
          size={size}
          isTop
          dragProgress={dragProgress}
          blindMode={blindMode}
          onSwipe={onSwipe}
          onOpenProfile={onOpenProfile}
        />
      ) : null}
    </View>
  );
});

type SwipeCardProps = {
  profile: DiscoverProfile;
  size: Size;
  isTop: boolean;
  dragProgress: SharedValue<number>;
  blindMode: boolean;
  onSwipe?: (profile: DiscoverProfile, type: SwipeType) => void;
  onOpenProfile?: (profile: DiscoverProfile) => void;
};

const SwipeCard = forwardRef<SwipeDeckHandle, SwipeCardProps>(function SwipeCard(
  { profile, size, isTop, dragProgress, blindMode, onSwipe, onOpenProfile },
  ref
) {
  const colors = useThemeColors();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const committed = useSharedValue(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const threshold = size.width * 0.28;
  const outX = size.width * 1.6;
  const outY = size.height * 1.3;
  const photos = profile.photoUrls;

  const commit = useCallback(
    (type: SwipeType) => {
      void Haptics.impactAsync(
        type === "super" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
      ).catch(() => undefined);
      onSwipe?.(profile, type);
    },
    [onSwipe, profile]
  );

  const handleTap = useCallback(
    (tapX: number, tapY: number) => {
      if (tapY > size.height * 0.7 || blindMode || photos.length < 2) {
        if (tapY > size.height * 0.55) onOpenProfile?.(profile);
        return;
      }
      if (tapX < size.width * 0.4) {
        setPhotoIndex((index) => Math.max(0, index - 1));
      } else if (tapX > size.width * 0.6) {
        setPhotoIndex((index) => Math.min(photos.length - 1, index + 1));
      }
    },
    [blindMode, onOpenProfile, photos.length, profile, size.height, size.width]
  );

  const flyOut = useCallback(
    (type: SwipeType) => {
      if (committed.value) return;
      committed.value = true;
      dragProgress.value = withTiming(1, { duration: 240 });
      x.value = withTiming(type === "like" ? outX : type === "nope" ? -outX : 0, { duration: 240 });
      y.value = withTiming(type === "super" ? -outY : 0, { duration: 240 }, (finished) => {
        if (finished) scheduleOnRN(commit, type);
      });
    },
    [commit, committed, dragProgress, outX, outY, x, y]
  );

  useImperativeHandle(ref, () => ({ swipe: flyOut }), [flyOut]);

  const pan = Gesture.Pan()
    .enabled(isTop)
    .activeOffsetX([-12, 12]);
  // Let a vertical browser gesture scroll short viewports. Super Like stays
  // available through its button; native keeps its existing upward gesture.
  if (Platform.OS === "web") pan.failOffsetY([-16, 16]);
  else pan.activeOffsetY([-12, 12]);
  pan
    .onChange((event) => {
      if (committed.value) return;
      x.value = event.translationX;
      y.value = event.translationY;
      dragProgress.value = Math.min(
        1,
        Math.max(Math.abs(event.translationX), Math.max(0, -event.translationY)) / threshold
      );
    })
    .onEnd((event) => {
      if (committed.value) return;
      let type: SwipeType | null = null;
      if (x.value > threshold || event.velocityX > 900) type = "like";
      else if (x.value < -threshold || event.velocityX < -900) type = "nope";
      else if (y.value < -threshold * 1.1 || event.velocityY < -1100) type = "super";

      if (!type) {
        x.value = withSpring(0, { damping: 18, stiffness: 180 });
        y.value = withSpring(0, { damping: 18, stiffness: 180 });
        dragProgress.value = withTiming(0, { duration: 180 });
        return;
      }
      committed.value = true;
      dragProgress.value = withTiming(1, { duration: 200 });
      x.value = withTiming(type === "like" ? outX : type === "nope" ? -outX : x.value, { duration: 200 });
      y.value = withTiming(type === "super" ? -outY : y.value + event.velocityY * 0.08, { duration: 200 }, (finished) => {
        if (finished) scheduleOnRN(commit, type);
      });
    });

  const tap = Gesture.Tap()
    .enabled(isTop)
    .maxDuration(300)
    .onEnd((event, success) => {
      if (success) scheduleOnRN(handleTap, event.x, event.y);
    });

  const gesture = Gesture.Race(pan, tap);

  const cardStyle = useAnimatedStyle(() => {
    if (!isTop) {
      return {
        transform: [{ scale: interpolate(dragProgress.value, [0, 1], [0.94, 1], Extrapolation.CLAMP) }],
        opacity: interpolate(dragProgress.value, [0, 1], [0.75, 1], Extrapolation.CLAMP)
      };
    }
    const rotate = interpolate(x.value, [-size.width, 0, size.width], [-10, 0, 10], Extrapolation.CLAMP);
    return {
      transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rotate}deg` }],
      opacity: 1
    };
  });

  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [threshold * 0.2, threshold], [0, 1], Extrapolation.CLAMP)
  }));
  const nopeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-threshold, -threshold * 0.2], [1, 0], Extrapolation.CLAMP)
  }));
  const superStamp = useAnimatedStyle(() => ({
    opacity:
      interpolate(y.value, [-threshold * 1.1, -threshold * 0.3], [1, 0], Extrapolation.CLAMP) *
      interpolate(Math.abs(x.value), [0, threshold * 0.6], [1, 0], Extrapolation.CLAMP)
  }));

  const interests = profile.interests
    .map((id) => museCardMap.get(id))
    .filter(Boolean)
    .slice(0, Platform.OS === "web" ? 2 : 3);
  const vibes = profile.vibes
    .map((id) => vibeMap.get(id))
    .filter(Boolean)
    .slice(0, 3);
  const answers = profile.quickAnswers.filter((entry) => rapidQuestionMap.has(entry.questionId)).slice(0, 2);
  const location = [
    typeof profile.distanceKm === "number" ? `${profile.distanceKm} km away` : null,
    profile.city || null
  ]
    .filter(Boolean)
    .join(" · ");
  const match = compatibilityLabel(profile.compatibility);
  const topReason = reasonLines(profile.reasons)[0];
  const basicsLine = cardBasics(profile.basics, profile.languages);

  return (
    <GestureDetector gesture={gesture} touchAction={Platform.OS === "web" ? "pan-y" : undefined}>
      <Animated.View
        testID={isTop ? "discover-card" : "discover-card-next"}
        style={[styles.card, { width: size.width, height: size.height }, cardStyle]}
        accessible={isTop}
        accessibilityRole="adjustable"
        accessibilityLabel={
          blindMode
            ? `Blind date profile, age ${profile.age}`
            : `${profile.displayName}, ${profile.age}${location ? `, ${location}` : ""}`
        }
        accessibilityHint={Platform.OS === "web" ? "Swipe right to like, left to pass. Use the star button for a Super Like. Tap the profile details to explore." : "Swipe right to like, left to pass, up to Super Like. Double tap to open the profile."}
        accessibilityActions={[
          { name: "activate", label: "Open profile" },
          { name: "like", label: "Like" },
          { name: "nope", label: "Pass" },
          { name: "super", label: "Super Like" }
        ]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === "activate") onOpenProfile?.(profile);
          else if (action === "like" || action === "nope" || action === "super") flyOut(action);
        }}
      >
        {blindMode ? (
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <YStack flex={1} alignItems="center" justifyContent="center" gap="$2" paddingBottom={120}>
              <Text fontSize={64}>🎭</Text>
              <Text color="white" fontSize="$7" fontWeight="700">
                Blind date
              </Text>
              <Text color="rgba(255,255,255,0.85)" textAlign="center" paddingHorizontal="$6">
                Photos and names are hidden on this card. Open the full profile whenever you’re ready.
              </Text>
            </YStack>
          </LinearGradient>
        ) : photos.length ? (
          <Image
            source={{ uri: resolveServerUrl(photos[photoIndex]) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
            recyclingKey={profile.uid}
          />
        ) : (
          <LinearGradient colors={colors.gradient} style={StyleSheet.absoluteFill}>
            <YStack flex={1} alignItems="center" justifyContent="center" gap="$2" paddingBottom={140}>
              <YStack
                width={112}
                height={112}
                borderRadius={56}
                backgroundColor="rgba(255,255,255,0.16)"
                alignItems="center"
                justifyContent="center"
              >
                <Text color="white" fontSize={52} lineHeight={60} fontWeight="700">
                  {profile.displayName.trim().charAt(0).toUpperCase()}
                </Text>
              </YStack>
              {profile.photosPrivate ? (
                <XStack gap={6} alignItems="center" paddingHorizontal="$6">
                  <Icon name="lock-closed" size={14} color="#FFFFFF" />
                  <Text color="rgba(255,255,255,0.9)" fontSize="$2" textAlign="center">
                    Photos unlock when you match
                  </Text>
                </XStack>
              ) : (
                <Text color="rgba(255,255,255,0.8)" fontSize="$2">
                  No photo yet
                </Text>
              )}
            </YStack>
          </LinearGradient>
        )}

        {match && !blindMode ? (
          <XStack
            position="absolute"
            top={photos.length > 1 ? 24 : 14}
            right={14}
            gap={4}
            alignItems="center"
            backgroundColor="rgba(20,12,22,0.62)"
            paddingHorizontal="$2"
            paddingVertical={5}
            borderRadius={999}
            pointerEvents="none"
          >
            <Icon name="sparkles" size={14} color={colors.glow} />
            <Text color="white" fontSize="$2" fontWeight="700">
              {match}
            </Text>
          </XStack>
        ) : null}

        {!blindMode && photos.length > 1 ? (
          <XStack position="absolute" top={10} left={10} right={10} gap={4} pointerEvents="none">
            {photos.map((uri, index) => (
              <YStack
                key={`${uri}-${index}`}
                flex={1}
                height={4}
                borderRadius={2}
                backgroundColor={index === photoIndex ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)"}
              />
            ))}
          </XStack>
        ) : null}

        <Animated.View style={[styles.stamp, styles.likeStamp, likeStamp]} pointerEvents="none">
          <Text color="#2E9E6B" fontSize={34} fontWeight="700">
            LIKE
          </Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStamp]} pointerEvents="none">
          <Text color="#E0564F" fontSize={34} fontWeight="700">
            NOPE
          </Text>
        </Animated.View>
        <Animated.View style={[styles.superWrap, superStamp]} pointerEvents="none">
          <View style={[styles.stamp, styles.superStamp]}>
            <Text color="#4F6BED" fontSize={30} fontWeight="700">
              SUPER
            </Text>
          </View>
        </Animated.View>

        <LinearGradient
          colors={["transparent", "rgba(10,6,12,0.55)", "rgba(10,6,12,0.88)"]}
          testID="discover-card-info"
          style={styles.info}
          pointerEvents="none"
        >
          <YStack gap="$2">
            {!blindMode && (profile.isNew || profile.requiresNote || profile.ageGap || profile.garbaShared) ? (
              <XStack gap="$2" flexWrap="wrap">
                {profile.garbaShared ? (
                  <XStack testID="card-garba" backgroundColor="rgba(255,255,255,0.22)" paddingHorizontal="$2" paddingVertical={4} borderRadius={999}>
                    <Text color="white" fontSize="$1" fontWeight="700">
                      {garbaBadge(profile.garbaShared)}
                    </Text>
                  </XStack>
                ) : null}
                {profile.ageGap ? (
                  <XStack testID="card-agegap" backgroundColor="rgba(255,255,255,0.22)" paddingHorizontal="$2" paddingVertical={4} borderRadius={999}>
                    <Text color="white" fontSize="$1" fontWeight="700">
                      {ageGapLabel(profile.ageGap, profile.gender)}
                    </Text>
                  </XStack>
                ) : null}
                {profile.isNew ? (
                  <XStack backgroundColor="rgba(255,255,255,0.22)" paddingHorizontal="$2" paddingVertical={4} borderRadius={999}>
                    <Text color="white" fontSize="$1" fontWeight="700">
                      ✨ New here
                    </Text>
                  </XStack>
                ) : null}
                {profile.requiresNote ? (
                  <XStack backgroundColor="rgba(255,255,255,0.22)" paddingHorizontal="$2" paddingVertical={4} borderRadius={999} gap={4} alignItems="center">
                    <Icon name="chatbubble-ellipses" size={12} color="#FFFFFF" />
                    <Text color="white" fontSize="$1" fontWeight="700">
                      Likes with a note only
                    </Text>
                  </XStack>
                ) : null}
              </XStack>
            ) : null}
            {profile.superLikedYou ? (
              <XStack
                alignSelf="flex-start"
                gap="$1"
                alignItems="center"
                backgroundColor="#4F6BED"
                paddingHorizontal="$2"
                paddingVertical={4}
                borderRadius={999}
              >
                <Icon name="star" size={14} color="#FFFFFF" />
                <Text color="white" fontSize="$1" fontWeight="700">
                  Super liked you
                </Text>
              </XStack>
            ) : null}
            {topReason && !blindMode ? (
              <XStack testID="discover-card-reason" alignItems="center" gap={6}>
                <Icon name="sparkles" size={14} color={colors.glow} />
                <Text color={colors.glow} fontSize="$2" fontWeight="600" numberOfLines={1} flex={1}>
                  {topReason}
                </Text>
              </XStack>
            ) : null}
            <XStack alignItems="flex-end" justifyContent="space-between" gap="$3">
              <YStack flex={1} gap={2}>
                <Text color="white" fontSize={28} lineHeight={34} fontWeight="700" numberOfLines={1}>
                  {blindMode ? `Mystery match, ${profile.age}` : `${profile.displayName}, ${profile.age}`}
                </Text>
                {location ? (
                  <Text color="rgba(255,255,255,0.85)" fontSize="$3" numberOfLines={1}>
                    {location}
                  </Text>
                ) : null}
                {basicsLine && !blindMode ? (
                  <Text color="rgba(255,255,255,0.85)" fontSize="$2" numberOfLines={1}>
                    {basicsLine}
                  </Text>
                ) : null}
              </YStack>
              <YStack
                width={36}
                height={36}
                borderRadius={18}
                backgroundColor="rgba(255,255,255,0.22)"
                alignItems="center"
                justifyContent="center"
              >
                <Icon name="chevron-up" size={22} color="#FFFFFF" />
              </YStack>
            </XStack>
            {blindMode && answers.length ? (
              <YStack gap="$1">
                {answers.map((entry) => (
                  <Text key={entry.questionId} color="white" fontSize="$3" numberOfLines={1}>
                    <Text color="rgba(255,255,255,0.7)">{rapidQuestionMap.get(entry.questionId)!.question} </Text>
                    {entry.answer}
                  </Text>
                ))}
              </YStack>
            ) : null}
            <XStack gap="$2" flexWrap="wrap">
              {(blindMode ? vibes : interests).map((item) => (
                <XStack
                  key={item!.id}
                  paddingHorizontal="$2"
                  paddingVertical={4}
                  borderRadius={999}
                  backgroundColor="rgba(255,255,255,0.2)"
                  gap={4}
                >
                  <Text fontSize="$2">{item!.emoji}</Text>
                  <Text color="white" fontSize="$2" fontWeight="600">
                    {"title" in item! ? item!.title : item!.label}
                  </Text>
                </XStack>
              ))}
            </XStack>
          </YStack>
        </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  deck: { flex: 1 },
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#2A222C",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
  info: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 72, paddingBottom: 18 },
  stamp: { borderWidth: 4, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 2 },
  likeStamp: { position: "absolute", top: 48, left: 24, borderColor: "#2E9E6B", transform: [{ rotate: "-14deg" }] },
  nopeStamp: { position: "absolute", top: 48, right: 24, borderColor: "#E0564F", transform: [{ rotate: "14deg" }] },
  superWrap: { position: "absolute", left: 0, right: 0, bottom: 170, alignItems: "center" },
  superStamp: { borderColor: "#4F6BED", transform: [{ rotate: "-6deg" }] }
});
