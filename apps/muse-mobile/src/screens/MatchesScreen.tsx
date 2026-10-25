import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { FlatList, Platform, Pressable, ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { AvatarPair } from "../components/Avatar";
import { GiftBanner } from "../components/GiftBanner";
import { Icon } from "../components/Icon";
import { LikesYouRow } from "../components/LikesYouRow";
import { MatchPresenceDot, matchPresence } from "../components/MatchPresence";
import { PrimaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { WomanPlusOffer } from "../components/WomanPlusOffer";
import { EmptyState, LoadingView } from "../components/States";
import { useAcceptActions } from "../hooks/useAcceptActions";
import { useLikesYou } from "../hooks/useLikesYou";
import { useSendPolicy } from "../hooks/useSendPolicy";
import { usePresence } from "../hooks/usePresence";
import { chatTitle, otherParticipant, otherSide } from "../services/matchService";
import { useAuthStore } from "../store/authStore";
import { useMatchesStore } from "../store/matchesStore";
import { DiscoverProfile, Match } from "../types/models";
import { formatShortTime } from "../utils/time";
import type { AppStackParamList } from "../navigation/types";

/** A small dot on the avatar while someone is online (recently active in Paire). */
function OnlineDot({ size }: { size: number }) {
  return (
    <YStack
      testID="online-dot"
      position="absolute"
      left={size - 15}
      bottom={1}
      width={14}
      height={14}
      borderRadius={7}
      backgroundColor="$success"
      borderWidth={2}
      borderColor="$background"
      accessible={false}
    />
  );
}

export function MatchesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid) ?? "";
  const { matches, loaded, failed, retry } = useMatchesStore();
  const likes = useLikesYou().data;
  const answers = useAcceptActions();
  // Warms the send policy, so a chat opened from here already knows whether she sends free.
  useSendPolicy();
  const accepting = { acceptable: likes?.acceptable === true, pendingUid: answers.pendingUid, onAccept: (profile: DiscoverProfile) => void answers.accept(profile), onNotNow: (profile: DiscoverProfile) => void answers.notNow(profile) };
  const openLiker = (profile: DiscoverProfile) => navigation.navigate("ProfileView", { source: "likes", profile });
  const seeAllLikes = () => navigation.navigate("LikesGallery");
  /** One face for a match, two overlapping for a Duo chat. */
  const facesOf = (match: Match) =>
    (match.kind === "duo" ? otherSide(match, uid) : [otherParticipant(match, uid)]).map((member) => ({
      uri: match.profiles[member]?.photoUrl,
      name: match.profiles[member]?.displayName
    }));

  // One-to-one matches only, newest activity first; the server answers only for people who share it.
  const pairUids = useMemo(
    () => matches.filter((match) => match.kind !== "duo").slice(0, 50).map((match) => otherParticipant(match, uid)),
    [matches, uid]
  );
  const presence = usePresence(pairUids, Platform.OS === "web" ? 30_000 : 60_000);
  const isOnline = (match: Match) => match.kind !== "duo" && presence.statusOf(otherParticipant(match, uid))?.online === true;
  const statusOf = (match: Match) => presence.statusOf(otherParticipant(match, uid));
  const statusLabel = (match: Match) => match.kind === "duo" ? "" : Platform.OS === "web" ? `, ${matchPresence(statusOf(match)).label.toLowerCase()}` : isOnline(match) ? ", online" : "";

  const { fresh, conversations } = useMemo(
    () => ({
      fresh: matches.filter((match) => !match.lastMessage),
      conversations: matches.filter((match) => match.lastMessage)
    }),
    [matches]
  );

  const openChat = (match: Match) => {
    const otherUid = otherParticipant(match, uid);
    const other = match.profiles[otherUid];
    navigation.navigate("Chat", {
      matchId: match.id,
      // Duo chats have several people; the chat works them out itself.
      otherUid: match.kind === "duo" ? undefined : otherUid,
      name: chatTitle(match, uid),
      photoUrl: other?.photoUrl ?? null
    });
  };

  if (!loaded) {
    return (
      <Screen edges={["top"]}>
        <LoadingView />
      </Screen>
    );
  }

  if (failed) {
    return (
      <Screen edges={["top"]}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load your matches"
          message="Check your connection and try again."
        >
          <PrimaryButton onPress={retry}>Try again</PrimaryButton>
        </EmptyState>
      </Screen>
    );
  }

  if (!matches.length) {
    return (
      <Screen edges={["top"]} padded={false}>
        <Text fontSize="$8" fontWeight="700" testID="matches-title" accessibilityRole="header" paddingHorizontal="$4">
          Matches
        </Text>
        {Platform.OS === "web" ? <YStack paddingTop="$4"><GiftBanner /></YStack> : null}
        {(likes?.count ?? 0) ? (
          <YStack paddingTop="$4">
            <LikesYouRow profiles={likes?.profiles ?? []} count={likes?.count ?? 0} locked={likes?.locked !== false} hasMore={likes?.hasMore} onUpgrade={() => navigation.navigate("Premium")} onOpen={openLiker} onSeeAll={seeAllLikes} {...accepting} />
          </YStack>
        ) : null}
        <EmptyState
          testID="matches-empty"
          icon="heart-outline"
          title="No matches yet"
          message="When you and someone else both like each other, you'll find them here and can start chatting."
        >
          <PrimaryButton onPress={() => navigation.navigate("Tabs", { screen: "Discover" })}>
            Start discovering
          </PrimaryButton>
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]} padded={false}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <YStack gap="$4" paddingBottom="$2">
            <Text
              fontSize="$8"
              fontWeight="700"
              paddingHorizontal="$4"
              testID="matches-title"
              accessibilityRole="header"
            >
              Matches
            </Text>
            {Platform.OS === "web" ? <GiftBanner /> : null}
            <LikesYouRow profiles={likes?.profiles ?? []} count={likes?.count ?? 0} locked={likes?.locked !== false} hasMore={likes?.hasMore} onUpgrade={() => navigation.navigate("Premium")} onOpen={openLiker} onSeeAll={seeAllLikes} {...accepting} />
            {fresh.length ? (
              <YStack gap="$2">
                <Text
                  fontSize="$2"
                  fontWeight="700"
                  color="$textMuted"
                  textTransform="uppercase"
                  paddingHorizontal="$4"
                >
                  New matches
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
                >
                  {fresh.map((match) => {
                    const otherUid = otherParticipant(match, uid);
                    const superLiked = match.superLikedBy.includes(otherUid);
                    return (
                      <Pressable
                        key={match.id}
                        testID={`new-match-${match.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`New match with ${chatTitle(match, uid)}${statusLabel(match)}. Open chat`}
                        onPress={() => openChat(match)}
                      >
                        <YStack alignItems="center" gap="$1" width={78}>
                          <YStack>
                            <AvatarPair people={facesOf(match)} size={72} ring />
                            {Platform.OS === "web" ? match.kind !== "duo" ? <MatchPresenceDot status={statusOf(match)} size={72} /> : null : isOnline(match) && !superLiked ? <OnlineDot size={72} /> : null}
                            {superLiked ? (
                              <YStack
                                position="absolute"
                                {...(Platform.OS === "web" ? { left: -2 } : { right: -2 })}
                                bottom={-2}
                                width={24}
                                height={24}
                                borderRadius={12}
                                backgroundColor="$superLike"
                                alignItems="center"
                                justifyContent="center"
                                borderWidth={2}
                                borderColor="$background"
                              >
                                <Icon name="star" size={12} color="#FFFFFF" />
                              </YStack>
                            ) : null}
                          </YStack>
                          <Text fontSize="$2" fontWeight="600" numberOfLines={1}>
                            {chatTitle(match, uid)}
                          </Text>
                          {Platform.OS === "web" && match.kind !== "duo" ? <Text fontSize={11} lineHeight={14} color="$textMuted" numberOfLines={1}>{statusOf(match) ? matchPresence(statusOf(match)).label : "Not shown"}</Text> : null}
                          {match.kind === "duo" ? (
                            <Text fontSize={11} lineHeight={14} fontWeight="700" color="$primary">
                              Duo
                            </Text>
                          ) : match.firstMoveBy && match.firstMoveBy !== uid ? (
                            <Text fontSize={11} lineHeight={14} color="$textMuted">
                              Their move
                            </Text>
                          ) : match.firstMoveBy === uid ? (
                            <Text fontSize={11} lineHeight={14} fontWeight="700" color="$primary">
                              Your move
                            </Text>
                          ) : match.sparks?.[otherUid] ? (
                            <Text fontSize={11} lineHeight={14} fontWeight="700" color="$primary">
                              Sent a note
                            </Text>
                          ) : null}
                        </YStack>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {/* A woman who sends free and has no Plus: one quiet offer, for the newest match. */}
                {Platform.OS === "web" && fresh[0] ? <WomanPlusOffer key={fresh[0].id} matchId={fresh[0].id} /> : null}
              </YStack>
            ) : null}
            {conversations.length ? (
              <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase" paddingHorizontal="$4">
                Messages
              </Text>
            ) : (
              <Text color="$textMuted" paddingHorizontal="$4">
                Say hi to your new matches. Conversations will show up here.
              </Text>
            )}
          </YStack>
        }
        renderItem={({ item }) => {
          const title = chatTitle(item, uid);
          const group = item.kind === "duo";
          const unread = item.unread[uid] ?? 0;
          const mine = item.lastMessage?.senderId === uid;
          const sender = item.lastMessage && !mine ? item.profiles[item.lastMessage.senderId]?.displayName : undefined;
          return (
            <Pressable
              testID={`match-row-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${group ? "Duo chat" : "Chat"} with ${title}${statusLabel(item)}${unread ? `, ${unread} unread` : ""}`}
              onPress={() => openChat(item)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <XStack paddingHorizontal="$4" paddingVertical="$3" gap="$3" alignItems="center">
                <YStack>
                  <AvatarPair people={facesOf(item)} size={58} />
                  {Platform.OS === "web" ? !group ? <MatchPresenceDot status={statusOf(item)} size={58} /> : null : isOnline(item) ? <OnlineDot size={58} /> : null}
                </YStack>
                <YStack flex={1} gap={2} minWidth={0}>
                  <XStack justifyContent="space-between" gap="$2">
                    <XStack flex={1} gap="$2" alignItems="center" minWidth={0}>
                      <Text fontSize="$4" fontWeight={unread ? "700" : "600"} numberOfLines={1} flexShrink={1}>
                        {title}
                      </Text>
                      {Platform.OS === "web" && !group ? <Text fontSize={11} color="$textMuted" numberOfLines={1}>{matchPresence(statusOf(item)).label}</Text> : null}
                      {group ? (
                        <YStack
                          paddingHorizontal={7}
                          paddingVertical={2}
                          borderRadius={999}
                          backgroundColor="$primarySoft"
                        >
                          <Text fontSize={10} lineHeight={13} fontWeight="700" color="$primary">
                            DUO
                          </Text>
                        </YStack>
                      ) : null}
                    </XStack>
                    {item.lastMessage ? (
                      <Text fontSize="$1" color={unread ? "$primary" : "$textMuted"}>
                        {formatShortTime(item.lastMessage.createdAt)}
                      </Text>
                    ) : null}
                  </XStack>
                  <XStack gap="$2" alignItems="center">
                    <Text
                      flex={1}
                      numberOfLines={1}
                      {...(Platform.OS === "web" ? { textAlign: "left" as const } : {})}
                      color={unread ? "$text" : "$textMuted"}
                      fontWeight={unread ? "600" : "400"}
                    >
                      {mine ? "You: " : group && sender ? `${sender.split(" ")[0]}: ` : ""}
                      {item.lastMessage?.text}
                    </Text>
                    {unread ? (
                      <YStack
                        minWidth={22}
                        height={22}
                        paddingHorizontal={6}
                        borderRadius={11}
                        backgroundColor="$primary"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color="$primaryForeground" fontSize="$1" fontWeight="700">
                          {unread > 99 ? "99+" : unread}
                        </Text>
                      </YStack>
                    ) : !mine ? (
                      // Conversations stall when nobody knows whose turn it is.
                      <YStack
                        paddingHorizontal={8}
                        height={22}
                        borderRadius={11}
                        backgroundColor="$primarySoft"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color="$primary" fontSize="$1" fontWeight="700">
                          Your turn
                        </Text>
                      </YStack>
                    ) : null}
                  </XStack>
                </YStack>
              </XStack>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
