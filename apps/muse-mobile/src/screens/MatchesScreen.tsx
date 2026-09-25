import { useQuery } from "@tanstack/react-query";
import { FlatList, Image, Pressable, Share } from "react-native";
import { Text, YStack, XStack } from "tamagui";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../components/Screen";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { fetchMatches } from "../services/matchService";
import { useAuthStore } from "../store/authStore";
import { AppStackParamList } from "../navigation/stacks/AppStack";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { datingIntentionMap } from "../data/datingIntentions";
import { formatLastActive } from "../utils/formatLastActive";
import { distanceKm, formatDistanceKm } from "../utils/distance";
import { createRoomId } from "../utils/call";
import { CALL_DOMAIN } from "../config/call";

const NEARBY_NOW_DISTANCE_KM = 5;
const NEARBY_NOW_WINDOW_MS = 15 * 60 * 1000;

export function MatchesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isGuest = useAuthStore((state) => state.isGuest);
  const resetAuth = useAuthStore((state) => state.resetAuth);
  const uid = user?.uid ?? "";
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const extraBottomPadding = Math.max(0, tabBarHeight - insets.bottom);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["matches", uid],
    enabled: Boolean(uid) && !isGuest,
    queryFn: () => fetchMatches(uid)
  });

  useFocusEffect(
    useCallback(() => {
      if (uid) {
        void refetch();
      }
    }, [uid, refetch])
  );

  if (isGuest) {
    return (
      <Screen scrollable extraBottomPadding={extraBottomPadding}>
        <YStack gap="$3" flex={1}>
          <Text testID="matches-title" fontSize="$7" fontWeight="700">
            Matches
          </Text>
          <Text color="$textMuted">
            Guest mode doesn’t sync matches. Create an account to start chatting.
          </Text>
          <PrimaryButton onPress={resetAuth}>Create account</PrimaryButton>
          <YStack
            backgroundColor="$backgroundStrong"
            padding="$4"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$border"
            gap="$2"
          >
            <Text fontWeight="700">Muse Now</Text>
            <Text fontSize="$2" color="$textMuted">
              Jump into a spontaneous chat or call with someone new.
            </Text>
            <PrimaryButton onPress={() => navigation.navigate("RandomConnect")}>
              Try random chat
            </PrimaryButton>
          </YStack>
          {__DEV__ ? (
            <YStack
              backgroundColor="$backgroundStrong"
              padding="$4"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$border"
              gap="$2"
            >
              <Text fontWeight="700">Demo match (QA)</Text>
              <Text fontSize="$2" color="$textMuted">
                Preview chat + calls without signing up.
              </Text>
              <PrimaryButton
                onPress={() =>
                  navigation.navigate("Chat", { matchId: "demo-match", targetUid: "demo_anya" })
                }
              >
                Open demo chat
              </PrimaryButton>
              <SecondaryButton
                onPress={() =>
                  navigation.navigate("Call", { roomId: "demo-call", video: true })
                }
              >
                Start demo video call
              </SecondaryButton>
            </YStack>
          ) : null}
          <SecondaryButton onPress={() => navigation.navigate("SafetyCenter")}>
            Safety center
          </SecondaryButton>
        </YStack>
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen extraBottomPadding={extraBottomPadding}>
        <YStack height={120} backgroundColor="$backgroundSoft" borderRadius="$4" />
      </Screen>
    );
  }

  const handleGroupCall = async () => {
    const roomId = createRoomId();
    const shareUrl = `https://${CALL_DOMAIN}/${roomId}`;
    await Share.share({ message: `Join my Muse group call: ${shareUrl}` });
    navigation.navigate("Call", { roomId, video: true });
  };

  return (
    <Screen extraBottomPadding={extraBottomPadding}>
      <YStack gap="$3" flex={1}>
        <Text testID="matches-title" fontSize="$7" fontWeight="700">
          Matches
        </Text>
        <YStack
          backgroundColor="$backgroundStrong"
          padding="$3"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontWeight="700">Muse Now</Text>
          <Text fontSize="$2" color="$textMuted">
            Start a random chat or call with someone new.
          </Text>
          <PrimaryButton onPress={() => navigation.navigate("RandomConnect")}>
            Try random chat
          </PrimaryButton>
        </YStack>
        <YStack
          backgroundColor="$backgroundStrong"
          padding="$3"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontWeight="700">Group call</Text>
          <Text fontSize="$2" color="$textMuted">
            Start a room and share the link with multiple matches.
          </Text>
          <PrimaryButton onPress={handleGroupCall}>Start group call</PrimaryButton>
        </YStack>
        {!data?.length ? (
          <YStack
            backgroundColor="$backgroundStrong"
            padding="$4"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$border"
            gap="$3"
          >
            <Text fontWeight="700">No matches yet</Text>
            <Text color="$textMuted">Start swiping to spark your first match.</Text>
            <PrimaryButton onPress={() => navigation.getParent()?.navigate("Discover" as never)}>
              Go to Discover
            </PrimaryButton>
          </YStack>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshing={isFetching}
            onRefresh={() => refetch()}
            renderItem={({ item }) => {
              const targetUid =
                item.otherUserId ??
                item.participants.find((participantId: string) => participantId !== uid) ??
                "";
              const unreadCount = item.unreadCounts?.[uid] ?? 0;
              const openChat = () =>
                navigation.navigate("Chat", {
                  matchId: item.id,
                  targetUid
                });

              return (
                <Pressable onPress={openChat} style={{ marginBottom: 12 }}>
                  <XStack
                    backgroundColor="$backgroundStrong"
                    borderRadius="$4"
                    padding="$3"
                    borderWidth={1}
                    borderColor="$border"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <XStack gap="$3" alignItems="center" flex={1} marginRight="$3">
                      {item.otherUser?.photoUrls?.[0] ? (
                        <Image
                          source={{ uri: item.otherUser.photoUrls[0] }}
                          style={{ width: 56, height: 56, borderRadius: 18 }}
                        />
                      ) : (
                        <YStack
                          width={56}
                          height={56}
                          borderRadius={18}
                          backgroundColor="$backgroundSoft"
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Text fontWeight="700">
                            {item.otherUser?.displayName?.slice(0, 1) ?? "M"}
                          </Text>
                        </YStack>
                      )}
                      <YStack flex={1} gap="$1">
                        <XStack alignItems="center" gap="$2">
                          <Text fontWeight="700" numberOfLines={1} flex={1}>
                            {item.otherUser?.displayName ?? "Match"}
                          </Text>
                          {unreadCount > 0 ? (
                            <YStack
                              backgroundColor="$primary"
                              paddingHorizontal="$2"
                              paddingVertical={2}
                              borderRadius={999}
                            >
                              <Text color="$primaryForeground" fontSize="$1" fontWeight="700">
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </Text>
                            </YStack>
                          ) : null}
                        </XStack>
                        <Text color="$textMuted" numberOfLines={1}>
                          {item.lastMessage ?? "Say hello"}
                        </Text>
                        {item.otherUser ? (() => {
                          const canShowDistance =
                            Boolean(profile?.shareLocation && profile?.location) &&
                            Boolean(item.otherUser.shareLocation && item.otherUser.location);
                          const distanceValue = canShowDistance
                            ? distanceKm(
                                { lat: profile!.location!.lat, lng: profile!.location!.lng },
                                { lat: item.otherUser.location!.lat, lng: item.otherUser.location!.lng }
                              )
                            : null;
                          const distanceLabel =
                            distanceValue !== null ? formatDistanceKm(distanceValue) : "";
                          const nearbyNow =
                            distanceValue !== null &&
                            distanceValue <= NEARBY_NOW_DISTANCE_KM &&
                            Boolean(item.otherUser.lastActiveAt) &&
                            Date.now() - item.otherUser.lastActiveAt <= NEARBY_NOW_WINDOW_MS;
                          const metaLine = [
                            nearbyNow ? "Nearby now" : null,
                            formatLastActive(item.otherUser.lastActiveAt),
                            item.otherUser.intentions
                              ?.map((id) => datingIntentionMap.get(id)?.label)
                              .filter((label): label is string => Boolean(label))
                              .slice(0, 1)
                              .join(", "),
                            distanceLabel
                          ]
                            .filter(Boolean)
                            .join(" • ");
                          return metaLine ? (
                            <Text color="$textMuted" fontSize="$2" numberOfLines={1}>
                              {metaLine}
                            </Text>
                          ) : null;
                        })() : null}
                      </YStack>
                    </XStack>
                    <PrimaryButton testID={`match-chat-${item.id}`} onPress={openChat} minWidth={96}>
                      Chat
                    </PrimaryButton>
                  </XStack>
                </Pressable>
              );
            }}
          />
        )}
      </YStack>
    </Screen>
  );
}
