import { Pressable, ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { DiscoverProfile } from "../types/models";
import { compatibilityLabel } from "../utils/insights";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

/** "Liked you": people waiting for your answer. Free to see, unlike most apps. */
export function LikesYouRow({
  profiles,
  onOpen,
  onSeeAll
}: {
  profiles: DiscoverProfile[];
  onOpen: (profile: DiscoverProfile) => void;
  /** Opens the full gallery. */
  onSeeAll?: () => void;
}) {
  if (!profiles.length) return null;
  return (
    <YStack gap="$2" testID="likes-you">
      <YStack paddingHorizontal="$4" gap={2}>
        <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase">
          Liked you · {profiles.length}
        </Text>
        <Text fontSize="$2" color="$textMuted">
          They're waiting for your answer. Notes come first.
        </Text>
      </YStack>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
      >
        {profiles.map((profile) => {
          const match = compatibilityLabel(profile.compatibility);
          return (
            <Pressable
              key={profile.uid}
              testID={`liked-you-${profile.uid}`}
              accessibilityRole="button"
              accessibilityLabel={`${profile.displayName} liked you${profile.note ? " with a note" : ""}${match ? `, ${match}` : ""}. View profile`}
              onPress={() => onOpen(profile)}
            >
              <YStack alignItems="center" gap={2} width={78}>
                <YStack>
                  <Avatar uri={profile.photoUrls[0]} name={profile.displayName} size={72} ring />
                  <YStack
                    position="absolute"
                    right={-2}
                    bottom={-2}
                    width={24}
                    height={24}
                    borderRadius={12}
                    backgroundColor={profile.superLikedYou ? "$superLike" : "$primary"}
                    alignItems="center"
                    justifyContent="center"
                    borderWidth={2}
                    borderColor="$background"
                  >
                    <Icon
                      name={profile.superLikedYou ? "star" : profile.note ? "chatbubble-ellipses" : "heart"}
                      size={12}
                      color={profile.superLikedYou ? "#FFFFFF" : "primaryForeground"}
                    />
                  </YStack>
                </YStack>
                <Text fontSize="$2" fontWeight="600" numberOfLines={1}>
                  {profile.displayName}
                </Text>
                {match ? (
                  <XStack alignItems="center" gap={2}>
                    <Icon name="sparkles" size={11} color="primary" />
                    <Text fontSize="$1" color="$primary" fontWeight="600">
                      {Math.round(profile.compatibility ?? 0)}%
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            </Pressable>
          );
        })}
      </ScrollView>
      {onSeeAll ? (
        <Pressable
          testID="likes-see-all"
          accessibilityRole="button"
          onPress={onSeeAll}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <XStack
            marginHorizontal="$4"
            marginTop="$1"
            height={46}
            borderRadius={999}
            alignItems="center"
            justifyContent="center"
            gap="$2"
            backgroundColor="$primarySoft"
          >
            <XStack>
              {profiles.slice(0, 3).map((profile, index) => (
                <YStack
                  key={profile.uid}
                  marginLeft={index ? -10 : 0}
                  borderRadius={999}
                  borderWidth={2}
                  borderColor="$primarySoft"
                >
                  <Avatar uri={profile.photoUrls[0]} name={profile.displayName} size={26} />
                </YStack>
              ))}
            </XStack>
            <Text fontSize="$3" fontWeight="700" color="$primary">
              See everyone who likes you
            </Text>
            <Icon name="chevron-forward" size={16} color="primary" />
          </XStack>
        </Pressable>
      ) : null}
    </YStack>
  );
}
