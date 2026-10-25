import { useAppDimensions } from "../utils/useAppDimensions";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { AcceptButtons } from "../components/AcceptButtons";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { PrimaryButton } from "../components/MuseButton";
import { LockedLikes } from "../components/LockedLikes";
import { EmptyState, LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { useAcceptActions } from "../hooks/useAcceptActions";
import { LIKES_YOU_KEY, useLikesYou } from "../hooks/useLikesYou";
import { useSendPolicy } from "../hooks/useSendPolicy";
import { sendSwipe } from "../services/discoveryService";
import { friendlyError } from "../services/errors";
import { offerPlusForLikeLimit } from "../services/likeLimitOffer";
import { suppressMatchAlert } from "../services/notificationService";
import { queryClient } from "../services/queryClient";
import { resolveServerUrl } from "../services/testServer";
import { useThemeColors } from "../theme/useThemeColors";
import { DiscoverProfile } from "../types/models";
import { reasonLines } from "../utils/insights";
import type { AppStackParamList } from "../navigation/types";

const GAP = 12;
const SHADE = ["transparent", "rgba(10,6,12,0.25)", "rgba(10,6,12,0.88)"] as const;

function LikeCard({
  profile,
  width,
  height,
  onOpen,
  onLikeBack,
  busy,
  acceptable
}: {
  profile: DiscoverProfile;
  width: number;
  height: number;
  onOpen: () => void;
  onLikeBack: () => void;
  busy: boolean;
  /** She answers by accepting (buttons sit under the card), not by liking back. */
  acceptable: boolean;
}) {
  const { gradient, glow } = useThemeColors();
  // A note they wrote beats any reason we could compute.
  const reason = profile.note ? `“${profile.note}”` : reasonLines(profile.reasons)[0];
  const photo = profile.photoUrls[0];
  return (
    <Pressable
      testID={`likes-gallery-${profile.uid}`}
      accessibilityRole="button"
      accessibilityLabel={`${profile.displayName}, ${profile.age}, liked you. View profile`}
      onPress={onOpen}
      style={({ pressed }) => ({ width, height, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <YStack flex={1} borderRadius={24} overflow="hidden" backgroundColor="#1E1720">
        {photo ? (
          <Image
            source={{ uri: resolveServerUrl(photo) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient colors={gradient} style={[StyleSheet.absoluteFill, styles.center]}>
            <Text color="white" fontSize={52} fontWeight="700">
              {profile.displayName.charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
        )}
        <LinearGradient
          colors={SHADE}
          locations={[0.4, 0.62, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <XStack position="absolute" top={10} left={10} right={10} justifyContent="space-between" pointerEvents="none">
          {profile.superLikedYou ? (
            <XStack
              gap={4}
              alignItems="center"
              backgroundColor="$superLike"
              paddingHorizontal={8}
              paddingVertical={4}
              borderRadius={999}
            >
              <Icon name="star" size={11} color="#FFFFFF" />
              <Text color="white" fontSize={11} lineHeight={14} fontWeight="700">
                Super
              </Text>
            </XStack>
          ) : profile.note ? (
            <XStack
              gap={4}
              alignItems="center"
              backgroundColor="$primary"
              paddingHorizontal={8}
              paddingVertical={4}
              borderRadius={999}
            >
              <Icon name="chatbubble-ellipses" size={11} color="primaryForeground" />
              <Text color="$primaryForeground" fontSize={11} lineHeight={14} fontWeight="700">
                Note
              </Text>
            </XStack>
          ) : (
            <YStack />
          )}
          <XStack
            gap={3}
            alignItems="center"
            backgroundColor="rgba(20,12,22,0.6)"
            paddingHorizontal={8}
            paddingVertical={4}
            borderRadius={999}
          >
            <Icon name="sparkles" size={11} color={glow} />
            <Text color="white" fontSize={11} lineHeight={14} fontWeight="700">
              {Math.round(profile.compatibility ?? 0)}%
            </Text>
          </XStack>
        </XStack>

        <YStack position="absolute" left={12} right={56} bottom={12} gap={2} pointerEvents="none">
          <Text color="white" fontSize="$5" lineHeight={24} fontWeight="700" numberOfLines={1}>
            {profile.displayName.split(" ")[0]}, {profile.age}
          </Text>
          {reason ? (
            <Text color={profile.note ? "white" : glow} fontSize={profile.note ? 12 : 11} lineHeight={profile.note ? 16 : 15} fontWeight="600" numberOfLines={profile.note ? 4 : 2}>
              {reason}
            </Text>
          ) : profile.city ? (
            <Text color="rgba(255,255,255,0.8)" fontSize={11} lineHeight={15} numberOfLines={1}>
              {profile.city.split(",")[0]}
            </Text>
          ) : null}
        </YStack>

        {acceptable ? null : <YStack position="absolute" right={10} bottom={10}>
          <IconButton
            testID={`likes-gallery-like-${profile.uid}`}
            icon="heart"
            accessibilityLabel={`Like ${profile.displayName} back`}
            variant="solid"
            color="primary"
            size={40}
            iconSize={20}
            disabled={busy}
            onPress={onLikeBack}
          />
        </YStack>}
      </YStack>
    </Pressable>
  );
}

/** Plus reveals pending likes; free members see only the anonymous preview. */
export function LikesGalleryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width } = useAppDimensions();
  const { gradient, glow } = useThemeColors();
  const likes = useLikesYou();
  const [busy, setBusy] = useState<string | null>(null);
  const answers = useAcceptActions();
  // Warms the send policy, so the chat she opens by accepting already knows she sends free.
  useSendPolicy();
  const acceptable = likes.data?.acceptable === true;
  const profiles = likes.data?.locked === false ? likes.data.profiles : [];
  const count = likes.data?.count ?? 0;
  const cardWidth = Math.floor((Math.min(width, 640) - 16 * 2 - GAP) / 2);
  const cardHeight = Math.round(cardWidth * 1.42);

  const likeBack = async (profile: DiscoverProfile) => {
    if (busy) return;
    setBusy(profile.uid);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      const result = await sendSwipe(profile.uid, "like");
      void queryClient.invalidateQueries({ queryKey: LIKES_YOU_KEY });
      if (result.matched && result.matchId) {
        suppressMatchAlert(result.matchId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        showToast(`It's a match! You and ${profile.displayName} liked each other.`, "success");
        navigation.navigate("Chat", {
          matchId: result.matchId,
          otherUid: profile.uid,
          name: profile.displayName,
          photoUrl: profile.photoUrls[0] ?? null
        });
      }
    } catch (error) {
      if (offerPlusForLikeLimit(error, () => navigation.navigate("Premium"))) return;
      showToast(friendlyError(error, "Couldn't send that like. Please try again."), "error");
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: insets.top + 8 }]}
    >
      <XStack alignItems="center" justifyContent="space-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Icon name="chevron-back" size={26} color="#FFFFFF" />
        </Pressable>
        <XStack
          gap={6}
          alignItems="center"
          backgroundColor="rgba(255,255,255,0.16)"
          paddingHorizontal="$3"
          paddingVertical={6}
          borderRadius={999}
        >
          <Icon name="heart" size={14} color={glow} />
          <Text color="white" fontSize="$2" fontWeight="700">
            {count}{likes.data?.hasMore ? "+" : ""}
          </Text>
        </XStack>
      </XStack>
      <YStack gap="$1" paddingHorizontal="$2" paddingBottom="$2">
        <Text color="white" fontSize="$9" lineHeight={40} fontWeight="700" accessibilityRole="header">
          They like you
        </Text>
        <Text color="rgba(255,255,255,0.88)" fontSize="$3">
          {likes.data?.locked !== false ? "Someone made the first move. Get Plus to reveal your likes." : acceptable ? "Notes and Super Likes first. Accept to match and start chatting, whenever you're ready." : "Notes and Super Likes first. Like someone back to match, even outside your search range."}
        </Text>
      </YStack>
    </LinearGradient>
  );

  return (
    <YStack flex={1} backgroundColor="$background">
      {likes.isLoading ? (
        <>
          {header}
          <LoadingView />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {header}
          {likes.isError && !profiles.length ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load your likes"
              message="Check your connection and try again."
            >
              <PrimaryButton onPress={() => void likes.refetch()}>Try again</PrimaryButton>
            </EmptyState>
          ) : count > 0 && likes.data?.locked !== false ? (
            <YStack marginTop="$4"><LockedLikes count={count} hasMore={likes.data?.hasMore} onUpgrade={() => navigation.navigate("Premium")} /></YStack>
          ) : profiles.length ? (
            // Two staggered columns, like a mood board.
            <XStack paddingHorizontal={16} gap={GAP} marginTop={16}>
              {[0, 1].map((column) => (
                <YStack key={column} gap={GAP} paddingTop={column ? 36 : 0}>
                  {profiles
                    .filter((_, index) => index % 2 === column)
                    .map((profile) => (
                      <YStack key={profile.uid} width={cardWidth} gap={8}>
                        <LikeCard
                          profile={profile}
                          width={cardWidth}
                          height={cardHeight}
                          busy={busy === profile.uid}
                          acceptable={acceptable}
                          onOpen={() => navigation.navigate("ProfileView", { source: "likes", profile })}
                          onLikeBack={() => void likeBack(profile)}
                        />
                        {acceptable ? (
                          <AcceptButtons
                            profile={profile}
                            idPrefix="likes-gallery"
                            pending={answers.pendingUid !== null}
                            onAccept={(target) => void answers.accept(target)}
                            onNotNow={(target) => void answers.notNow(target)}
                          />
                        ) : null}
                      </YStack>
                    ))}
                </YStack>
              ))}
            </XStack>
          ) : (
            <EmptyState
              icon="heart-outline"
              title="No likes waiting"
              message="When someone likes you, they'll show up here so you can like them back."
            />
          )}
        </ScrollView>
      )}
    </YStack>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  hero: { paddingHorizontal: 8, paddingBottom: 20, gap: 12, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }
});
