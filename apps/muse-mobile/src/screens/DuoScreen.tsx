import { Alert } from "../services/dialog";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { AvatarPair } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState, LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { useDuo } from "../hooks/useDuo";
import { leaveDuo, subscribeToDuoSwipes, undoDuoSwipe } from "../services/duoService";
import { friendlyError } from "../services/errors";
import { useAuthStore } from "../store/authStore";
import { useThemeColors } from "../theme/useThemeColors";
import { DuoSwipeRecord } from "../types/models";
import { formatShortTime } from "../utils/time";
import type { AppStackParamList } from "../navigation/types";

const UNDO_MS = 10 * 60 * 1000;
const firstName = (name?: string) => name?.trim().split(/\s+/)[0] ?? "";

/** Your Duo: who you're with, what your pair liked, and leaving. */
export function DuoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const uid = useAuthStore((state) => state.user?.uid) ?? "";
  const me = useAuthStore((state) => state.profile);
  const { loading, duo, partnerUid } = useDuo();
  const { gradient, glow } = useThemeColors();
  const [swipes, setSwipes] = useState<DuoSwipeRecord[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const duoId = duo?.id;
  useEffect(() => (duoId ? subscribeToDuoSwipes(duoId, setSwipes) : undefined), [duoId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (!duo || !partnerUid) {
    return (
      <Screen>
        <ScreenHeader title="Your Duo" />
        <EmptyState
          icon="people-outline"
          title="You're not in a Duo"
          message="Team up with a friend from Discover → Duos."
        />
      </Screen>
    );
  }

  const partner = duo.profiles[partnerUid];
  const partnerName = firstName(partner?.displayName) || "your friend";
  const likes = swipes.filter((swipe) => swipe.type === "like");

  const confirmLeave = () =>
    Alert.alert(
      "Leave your Duo?",
      `You and ${partnerName} will stop matching as a pair, and you'll leave your Duo chats. You can team up again anytime.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave Duo",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveDuo();
              showToast("You left your Duo.");
              navigation.goBack();
            } catch (error) {
              showToast(friendlyError(error, "Couldn't leave. Please try again."), "error");
            }
          }
        }
      ]
    );

  const undo = async (swipe: DuoSwipeRecord) => {
    try {
      await undoDuoSwipe(swipe.targetDuoId);
      void queryClient.invalidateQueries({ queryKey: ["duo-feed", duo.id] });
      showToast("Taken back. They'll show up in your deck again.");
    } catch (error) {
      showToast(friendlyError(error, "Couldn't undo that."), "error");
    }
  };

  return (
    <Screen scroll>
      <ScreenHeader title="Your Duo" />
      <YStack gap="$6">
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 28, padding: 20, gap: 14 }}
        >
          <XStack alignItems="center" gap="$3">
            <AvatarPair
              people={[
                { uri: me?.photoUrls?.[0], name: me?.displayName },
                { uri: partner?.photoUrl, name: partner?.displayName }
              ]}
              size={72}
              ring
            />
            <YStack flex={1}>
              <Text color={glow} fontSize="$1" fontWeight="700" textTransform="uppercase" letterSpacing={1}>
                Dating together
              </Text>
              <Text color="white" fontSize="$7" lineHeight={30} fontWeight="700" numberOfLines={2}>
                You & {partnerName}
              </Text>
            </YStack>
          </XStack>
          <Text color="rgba(255,255,255,0.88)" fontSize="$2">
            Either of you can like a pair. When they like you back, all four of you get a group chat.
          </Text>
        </LinearGradient>

        <YStack gap="$3">
          <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase">
            Recent pairs you've liked
          </Text>
          {likes.length ? (
            <YStack
              borderRadius="$5"
              borderWidth={1}
              borderColor="$border"
              backgroundColor="$backgroundStrong"
              overflow="hidden"
            >
              {likes.map((swipe, index) => {
                const names = swipe.target.map((person) => firstName(person.displayName)).join(" & ");
                const byMe = swipe.byUid === uid;
                const canUndo = now - swipe.createdAt < UNDO_MS;
                return (
                  <XStack
                    key={swipe.targetDuoId}
                    gap="$3"
                    padding="$3"
                    alignItems="center"
                    borderTopWidth={index ? 1 : 0}
                    borderColor="$border"
                  >
                    <AvatarPair
                      people={swipe.target.map((person) => ({ uri: person.photoUrl, name: person.displayName }))}
                      size={48}
                    />
                    <YStack flex={1}>
                      <Text fontSize="$4" fontWeight="700" numberOfLines={1}>
                        {names}
                      </Text>
                      <Text fontSize="$1" color="$textMuted">
                        Liked by {byMe ? "you" : partnerName} · {formatShortTime(swipe.createdAt)}
                      </Text>
                    </YStack>
                    {canUndo ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Undo like for ${names}`}
                        onPress={() => void undo(swipe)}
                        hitSlop={8}
                      >
                        <XStack
                          gap={4}
                          alignItems="center"
                          paddingHorizontal="$3"
                          height={32}
                          borderRadius={999}
                          backgroundColor="$primarySoft"
                        >
                          <Icon name="arrow-undo" size={14} color="primary" />
                          <Text fontSize="$2" fontWeight="700" color="$primary">
                            Undo
                          </Text>
                        </XStack>
                      </Pressable>
                    ) : null}
                  </XStack>
                );
              })}
            </YStack>
          ) : (
            <Text color="$textMuted">No likes yet. Head to Discover → Duos and start swiping together.</Text>
          )}
          <Text fontSize="$1" color="$textMuted">
            You can take back a like for 10 minutes, unless it's already a match.
          </Text>
        </YStack>

        <SecondaryButton testID="duo-leave" onPress={confirmLeave}>
          Leave Duo
        </SecondaryButton>
      </YStack>
    </Screen>
  );
}
