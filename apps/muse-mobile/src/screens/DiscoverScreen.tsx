import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, RefreshControl, Switch } from "react-native";
import { Card, Text, XStack, YStack } from "tamagui";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../components/Screen";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { SwipeDeck, type SwipeDeckHandle } from "../components/SwipeDeck";
import { fetchDiscoverProfiles } from "../services/discoveryService";
import { recordSwipe } from "../services/swipeService";
import { useAuthStore } from "../store/authStore";
import { useSwipeStore } from "../store/swipeStore";
import { SwipeType, UserProfile } from "../types/models";
import { getDailyPrompt, musePromptTitle } from "../data/musePrompts";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { AppStackParamList } from "../navigation/stacks/AppStack";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MatchMoment } from "../components/MatchMoment";
import { useResponsiveFlags } from "../hooks/useResponsiveFlags";

export function DiscoverScreen() {
  const { user, profile, isGuest } = useAuthStore();
  const setProfile = useAuthStore((state) => state.setProfile);
  const resetAuth = useAuthStore((state) => state.resetAuth);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const registerSwipe = useSwipeStore((state) => state.registerSwipe);
  const undoSwipe = useSwipeStore((state) => state.undoSwipe);
  const likes = useSwipeStore((state) => state.likes);
  const nopes = useSwipeStore((state) => state.nopes);
  const supers = useSwipeStore((state) => state.supers);
  const [blindMode, setBlindMode] = useState(false);
  const [matchProfile, setMatchProfile] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<Array<{ profile: UserProfile; type: SwipeType }>>([]);
  const [vibePreference, setVibePreference] = useState<"any" | "shared">(
    profile?.vibePreference ?? "any"
  );
  const prompt = useMemo(() => getDailyPrompt(), []);
  const { height, isCompact } = useResponsiveFlags();
  const compact = isCompact;
  const switchTrackColor = { false: "#DED7D4", true: "#0F3D52" };
  const enableRefresh = compact && process.env.NODE_ENV !== "test";
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const extraBottomPadding = Math.max(0, tabBarHeight - insets.bottom);
  const deckMinHeight = Math.max(200, Math.round(height * (compact ? 0.3 : 0.34)));
  const deckSkeletonHeight = Math.max(deckMinHeight, compact ? 260 : 320);

  const interests = profile?.interests ?? [];
  const vibes = profile?.vibes ?? [];
  const uid = user?.uid ?? "";
  const maxDistanceKm = profile?.maxDistanceKm ?? 50;

  useEffect(() => {
    setVibePreference(profile?.vibePreference ?? "any");
  }, [profile?.vibePreference]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      "discover",
      uid,
      interests,
      vibes,
      vibePreference,
      maxDistanceKm,
      profile?.shareLocation,
      profile?.location?.lat,
      profile?.location?.lng
    ],
    enabled: Boolean(uid),
    queryFn: () =>
      fetchDiscoverProfiles(uid, interests, vibes, {
        vibePreference,
        maxDistanceKm,
        location: profile?.location ?? null,
        shareLocation: profile?.shareLocation ?? false
      })
  });

  useFocusEffect(
    useCallback(() => {
      if (uid) {
        refetch();
      }
    }, [uid, refetch])
  );

  const profiles = useMemo(() => data ?? [], [data]);
  const [index, setIndex] = useState(0);
  const isExhausted = !isLoading && profiles.length > 0 && index >= profiles.length;
  const isEmpty = !isLoading && profiles.length === 0;
  const hasError = Boolean(error);
  const showEmptyState = isEmpty || isExhausted;
  const shouldScroll = compact || isLoading || showEmptyState || height < 820;
  const current = showEmptyState ? undefined : profiles[index];
  const progressLabel =
    !isLoading && !showEmptyState && profiles.length
      ? `${Math.min(index + 1, profiles.length)} of ${profiles.length} nearby`
      : null;
  const swipeCount = likes + nopes + supers;
  const swipeSummary =
    swipeCount > 0
      ? `${likes} likes • ${supers} supers • ${nopes} passes`
      : null;
  const deckRef = useRef<SwipeDeckHandle>(null);
  useEffect(() => {
    setIndex(0);
    setHistory([]);
  }, [profiles.length]);

  useEffect(() => {
    const nextProfile = profiles[index + 1] ?? profiles[index];
    const nextUrl = nextProfile?.photoUrls?.[0];
    if (!nextUrl || typeof Image.prefetch !== "function") return;
    const result = Image.prefetch(nextUrl);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  }, [index, profiles]);

  const handleVibePreference = async (value: boolean) => {
    const nextPreference = value ? "shared" : "any";
    setVibePreference(nextPreference);
    if (!profile) return;
    const updatedAt = Date.now();
    setProfile({ ...profile, vibePreference: nextPreference, updatedAt });
    if (isGuest || !user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { vibePreference: nextPreference, updatedAt },
        { merge: true }
      );
    } catch {
      // Best-effort preference save.
    }
  };

  const maybeShowMatch = (target: UserProfile, type: SwipeType) => {
    if (type === "nope") return;
    const hitChance = type === "super" ? 1 : isGuest ? 0.35 : 0.25;
    if (Math.random() <= hitChance) {
      setMatchProfile(target);
    }
  };

  const handleSwipe = async (target: UserProfile, type: SwipeType) => {
    if (!uid) return;
    registerSwipe(type);
    setHistory((prev) => [...prev, { profile: target, type }]);
    if (!isGuest) {
      await recordSwipe({ fromUid: uid, toUid: target.uid, type });
    }
    maybeShowMatch(target, type);
    if (index + 1 >= profiles.length) {
      setIndex((prev) => prev + 1);
      return;
    }
    setIndex((prev) => prev + 1);
  };

  const handleButtonSwipe = (type: SwipeType) => {
    if (!current) return;
    deckRef.current?.swipe(type);
  };

  const handleRefresh = () => {
    setIndex(0);
    setHistory([]);
    refetch();
  };

  const handleUndo = () => {
    setMatchProfile(null);
    setHistory((prev) => {
      const last = prev.at(-1);
      if (!last) return prev;
      undoSwipe(last.type);
      setIndex((value) => Math.max(0, value - 1));
      return prev.slice(0, -1);
    });
  };

  const handleChat = () => {
    if (!matchProfile || !uid) return;
    const matchId = [uid, matchProfile.uid].sort().join("_");
    setMatchProfile(null);
    navigation.navigate("Chat", { matchId, targetUid: matchProfile.uid });
  };

  const handleCloseMatch = () => {
    setMatchProfile(null);
  };

  return (
    <Screen
      scrollable={shouldScroll}
      scrollEnabled={shouldScroll}
      contentContainerStyle={{ flexGrow: 1 }}
      extraBottomPadding={extraBottomPadding}
      scrollViewProps={
        enableRefresh
          ? {
              refreshControl: (
                <RefreshControl
                  refreshing={isFetching}
                  onRefresh={handleRefresh}
                  tintColor="#0F3D52"
                />
              )
            }
          : undefined
      }
    >
      <YStack flex={compact ? 0 : 1} gap={compact ? "$3" : "$4"} position="relative">
        <YStack>
          <Text fontSize="$7" fontWeight="700">
            Discover
          </Text>
          <Text color="$textMuted">Curated by your Muse Cards.</Text>
          {progressLabel ? (
            <Text fontSize="$2" color="$textMuted">
              {progressLabel}
            </Text>
          ) : null}
          {swipeSummary ? (
            <Text fontSize="$2" color="$textMuted">
              {swipeSummary}
            </Text>
          ) : null}
        </YStack>

        <Card
          padding={compact ? "$3" : "$4"}
          borderRadius="$5"
          backgroundColor="$backgroundStrong"
          borderWidth={1}
          borderColor="$border"
        >
          <Text fontWeight="700">{musePromptTitle}</Text>
          <Text color="$textMuted">{prompt}</Text>
        </Card>

        <Card
          padding={compact ? "$3" : "$4"}
          borderRadius="$5"
          backgroundColor="$backgroundStrong"
          borderWidth={1}
          borderColor="$border"
          onPress={() => handleVibePreference(vibePreference !== "shared")}
          pressStyle={{ opacity: 0.95 }}
        >
          <XStack gap="$3" alignItems="center" justifyContent="space-between">
            <YStack flex={1} gap="$1">
              <Text fontWeight="700">Vibe filter</Text>
              <Text color="$textMuted" fontSize="$2">
                Prefer profiles that share your vibes.
              </Text>
            </YStack>
            <Switch
              value={vibePreference === "shared"}
              onValueChange={handleVibePreference}
              trackColor={switchTrackColor}
              thumbColor="#FFFFFF"
              ios_backgroundColor={switchTrackColor.false}
            />
          </XStack>
        </Card>

        {!profile?.shareLocation ? (
          <Card
            padding={compact ? "$3" : "$4"}
            borderRadius="$5"
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$border"
            gap="$2"
          >
            <Text fontWeight="700">Share your location</Text>
            <Text color="$textMuted" fontSize="$2">
              Unlock nearby distance and “Nearby now” status.
            </Text>
            <SecondaryButton onPress={() => navigation.navigate("Settings")}>
              Enable location
            </SecondaryButton>
          </Card>
        ) : null}

        <Card
          padding={compact ? "$3" : "$4"}
          borderRadius="$5"
          backgroundColor="$backgroundStrong"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontWeight="700">Muse Now</Text>
          <Text color="$textMuted" fontSize="$2">
            Want a spontaneous conversation? Jump into a random chat or call.
          </Text>
          <PrimaryButton onPress={() => navigation.navigate("RandomConnect")}>
            Start random chat
          </PrimaryButton>
          <SecondaryButton onPress={() => navigation.navigate("RandomConnect")}>
            Explore Muse Now
          </SecondaryButton>
        </Card>

        <YStack
          alignItems="center"
          flex={1}
          justifyContent="center"
          minHeight={deckMinHeight}
        >
          {isLoading ? (
            <YStack
              backgroundColor="$backgroundSoft"
              borderRadius="$5"
              height={deckSkeletonHeight}
              width="100%"
              maxWidth={420}
            />
          ) : hasError ? (
            <Card
              padding="$4"
              borderRadius="$5"
              backgroundColor="$backgroundStrong"
              borderWidth={1}
              borderColor="$border"
              width="100%"
              maxWidth={420}
              alignItems="center"
              gap="$3"
            >
              <Text fontSize="$6" fontWeight="700">
                We hit a snag
              </Text>
              <Text color="$textMuted" textAlign="center">
                We couldn’t load matches right now. Check your connection and try again.
              </Text>
              <PrimaryButton onPress={handleRefresh}>Try again</PrimaryButton>
            </Card>
          ) : showEmptyState ? (
            <Card
              padding="$4"
              borderRadius="$5"
              backgroundColor="$backgroundStrong"
              borderWidth={1}
              borderColor="$border"
              width="100%"
              maxWidth={420}
              alignItems="center"
              gap="$3"
            >
              <Text fontSize="$6" fontWeight="700">
                That’s everyone nearby for now
              </Text>
              <Text color="$textMuted" textAlign="center">
                We’ll keep finding new people who match your vibe. Try refreshing in a bit.
              </Text>
              <PrimaryButton onPress={handleRefresh}>Refresh</PrimaryButton>
              <SecondaryButton
                accessibilityLabel="Tune preferences"
                onPress={() => navigation.navigate("EditProfile")}
              >
                Tune preferences
              </SecondaryButton>
            </Card>
          ) : (
            <YStack gap="$2" alignItems="center">
              {blindMode ? (
                <Text fontSize="$2" color="$textMuted">
                  Blind mode on — reveal after your first chat.
                </Text>
              ) : null}
              {swipeCount === 0 ? (
                <Text fontSize="$2" color="$textMuted">
                  Tip: swipe right to like, left to pass.
                </Text>
              ) : null}
              <SwipeDeck
                ref={deckRef}
                profile={current}
                onSwipe={handleSwipe}
                isBlindMode={blindMode}
              />
            </YStack>
          )}
        </YStack>

        <YStack gap={compact ? "$2" : "$3"}>
          {compact ? (
            <YStack gap="$2">
              <SecondaryButton
                testID="discover-nope"
                accessibilityLabel="Nope"
                onPress={() => handleButtonSwipe("nope")}
                disabled={!current}
              >
                Nope
              </SecondaryButton>
              <PrimaryButton
                testID="discover-like"
                accessibilityLabel="Like"
                onPress={() => handleButtonSwipe("like")}
                disabled={!current}
              >
                Like
              </PrimaryButton>
              <SecondaryButton
                testID="discover-super"
                accessibilityLabel="Super Muse"
                onPress={() => handleButtonSwipe("super")}
                disabled={!current}
              >
                Super Muse
              </SecondaryButton>
              <SecondaryButton
                accessibilityLabel="Undo last swipe"
                onPress={handleUndo}
                disabled={!history.length}
              >
                Undo
              </SecondaryButton>
              <SecondaryButton
                accessibilityLabel="Toggle blind date"
                onPress={() => setBlindMode((prev) => !prev)}
              >
                {blindMode ? "Reveal" : "Blind Date"}
              </SecondaryButton>
            </YStack>
          ) : (
            <>
              <XStack gap="$3" justifyContent="center" flexWrap="wrap">
                <SecondaryButton
                  testID="discover-nope"
                  accessibilityLabel="Nope"
                  onPress={() => handleButtonSwipe("nope")}
                  disabled={!current}
                  flex={1}
                >
                  Nope
                </SecondaryButton>
                <PrimaryButton
                  testID="discover-like"
                  accessibilityLabel="Like"
                  onPress={() => handleButtonSwipe("like")}
                  disabled={!current}
                  flex={1}
                >
                  Like
                </PrimaryButton>
              </XStack>
              <XStack gap="$3" justifyContent="center" flexWrap="wrap">
                <SecondaryButton
                  testID="discover-super"
                  accessibilityLabel="Super Muse"
                  onPress={() => handleButtonSwipe("super")}
                  disabled={!current}
                  flex={1}
                >
                  Super Muse
                </SecondaryButton>
                <SecondaryButton
                  accessibilityLabel="Undo last swipe"
                  onPress={handleUndo}
                  disabled={!history.length}
                  flex={1}
                >
                  Undo
                </SecondaryButton>
                <SecondaryButton
                  accessibilityLabel="Toggle blind date"
                  onPress={() => setBlindMode((prev) => !prev)}
                  flex={1}
                >
                  {blindMode ? "Reveal" : "Blind Date"}
                </SecondaryButton>
              </XStack>
            </>
          )}
        </YStack>

        {matchProfile ? (
          <MatchMoment
            profile={matchProfile}
            isGuest={isGuest}
            onClose={handleCloseMatch}
            onChat={handleChat}
            onCreateAccount={() => {
              handleCloseMatch();
              resetAuth();
            }}
          />
        ) : null}
      </YStack>
    </Screen>
  );
}
