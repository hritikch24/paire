import { Alert } from "../services/dialog";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Avatar } from "../components/Avatar";
import { Icon, IconName } from "../components/Icon";
import { PrimaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState, LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { fetchChatProfiles } from "../services/duoService";
import { friendlyError } from "../services/errors";
import { errorCode } from "../services/errors";
import { partnerIn, subscribeToMatch } from "../services/matchService";
import { blockUser } from "../services/safetyService";
import { resolveServerUrl } from "../services/testServer";
import { useAuthStore } from "../store/authStore";
import { DiscoverProfile, Match } from "../types/models";
import type { AppStackParamList } from "../navigation/types";

function Action({
  icon,
  label,
  onPress,
  danger
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}>
      <XStack
        gap={6}
        alignItems="center"
        paddingHorizontal="$3"
        height={34}
        borderRadius={999}
        backgroundColor={danger ? "transparent" : "$primarySoft"}
        borderWidth={danger ? 1 : 0}
        borderColor="$border"
      >
        <Icon name={icon} size={15} color={danger ? "error" : "primary"} />
        <Text fontSize="$2" fontWeight="700" color={danger ? "$error" : "$primary"}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

/** Everyone in a Duo chat, with a way to view, report or block each person. */
export function ChatMembersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { matchId } = useRoute<RouteProp<AppStackParamList, "ChatMembers">>().params;
  const uid = useAuthStore((state) => state.user?.uid) ?? "";
  const [match, setMatch] = useState<Match | null>(null);
  useEffect(() => subscribeToMatch(matchId, setMatch, () => setMatch(null)), [matchId]);
  const partner = match ? partnerIn(match, uid) : null;
  const people = useQuery({
    queryKey: ["chat-profiles", matchId],
    queryFn: () => fetchChatProfiles(matchId)
  });
  // A closed chat has no profiles to show, but you can still report or block from it.
  const closed = people.isError && errorCode(people.error) === "functions/permission-denied";

  const confirmBlock = (person: DiscoverProfile) =>
    Alert.alert(
      `Block ${person.displayName}?`,
      "You won't see each other again, any chat you share closes for everyone, and if they're your Duo partner, your Duo ends.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser(person.uid);
              showToast(`${person.displayName} is blocked.`);
              navigation.navigate("Tabs", { screen: "Matches" });
            } catch (error) {
              showToast(friendlyError(error, "Couldn't block. Please try again."), "error");
            }
          }
        }
      ]
    );

  const profiles = [...(people.data ?? [])].sort((a, b) => Number(b.uid === partner) - Number(a.uid === partner));

  return (
    <Screen scroll>
      <ScreenHeader title="People in this chat" subtitle="Tap a photo to see their profile" />
      {people.isLoading ? (
        <LoadingView />
      ) : closed && match ? (
        <YStack gap="$3">
          <Text color="$textMuted">This chat has ended. You can still report or block anyone who was in it.</Text>
          {match.participants
            .filter((member) => member !== uid)
            .map((member) => {
              const person = match.profiles[member];
              const name = person?.displayName ?? "Paire member";
              return (
                <XStack
                  key={member}
                  gap="$3"
                  padding="$3"
                  alignItems="center"
                  borderRadius="$5"
                  backgroundColor="$backgroundStrong"
                  borderWidth={1}
                  borderColor="$border"
                >
                  <Avatar uri={person?.photoUrl} name={name} size={52} />
                  <YStack flex={1} gap="$2">
                    <Text fontSize="$4" fontWeight="700">
                      {name}
                    </Text>
                    <XStack gap="$2" flexWrap="wrap">
                      <Action
                        icon="flag-outline"
                        label="Report"
                        danger
                        onPress={() => navigation.navigate("Report", { targetUid: member, name, matchId })}
                      />
                      <Action
                        icon="ban-outline"
                        label="Block"
                        danger
                        onPress={() => confirmBlock({ uid: member, displayName: name } as DiscoverProfile)}
                      />
                    </XStack>
                  </YStack>
                </XStack>
              );
            })}
        </YStack>
      ) : people.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load this chat"
          message="Check your connection and try again."
        >
          <PrimaryButton onPress={() => void people.refetch()}>Try again</PrimaryButton>
        </EmptyState>
      ) : (
        <YStack gap="$3">
          {profiles.map((person) => {
            const mine = person.uid === partner;
            const open = () =>
              navigation.navigate("ProfileView", {
                source: "match",
                profile: person
              });
            return (
              <XStack
                key={person.uid}
                testID={`chat-member-${person.uid}`}
                gap="$3"
                padding="$3"
                borderRadius="$5"
                backgroundColor="$backgroundStrong"
                borderWidth={1}
                borderColor="$border"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View ${person.displayName}'s profile`}
                  onPress={open}
                >
                  {person.photoUrls[0] ? (
                    <Image
                      source={{ uri: resolveServerUrl(person.photoUrls[0]) }}
                      style={{ width: 84, height: 108, borderRadius: 16 }}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <Avatar name={person.displayName} size={84} />
                  )}
                </Pressable>
                <YStack flex={1} gap="$2" justifyContent="center">
                  <YStack gap={2}>
                    <XStack gap="$2" alignItems="center" flexWrap="wrap">
                      <Text fontSize="$5" fontWeight="700">
                        {person.displayName}, {person.age}
                      </Text>
                      <YStack
                        paddingHorizontal={8}
                        paddingVertical={3}
                        borderRadius={999}
                        backgroundColor={mine ? "$primarySoft" : "$backgroundSoft"}
                      >
                        <Text fontSize={11} lineHeight={14} fontWeight="700" color={mine ? "$primary" : "$textMuted"}>
                          {mine ? "Your Duo" : "Their Duo"}
                        </Text>
                      </YStack>
                    </XStack>
                    {person.city ? (
                      <Text fontSize="$2" color="$textMuted" numberOfLines={1}>
                        {person.city}
                      </Text>
                    ) : null}
                  </YStack>
                  <XStack gap="$2" flexWrap="wrap">
                    <Action icon="person-outline" label="Profile" onPress={open} />
                    <Action
                      icon="flag-outline"
                      label="Report"
                      danger
                      onPress={() =>
                        navigation.navigate("Report", {
                          targetUid: person.uid,
                          name: person.displayName,
                          matchId
                        })
                      }
                    />
                    <Action icon="ban-outline" label="Block" danger onPress={() => confirmBlock(person)} />
                  </XStack>
                </YStack>
              </XStack>
            );
          })}
          <Text fontSize="$1" color="$textMuted" paddingHorizontal="$1">
            Reports are confidential. Blocking someone closes any chat you share with them, for everyone in it.
          </Text>
        </YStack>
      )}
    </Screen>
  );
}
