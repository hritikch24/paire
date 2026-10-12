import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { resolveServerUrl } from "../../services/testServer";
import { useThemeColors } from "../../theme/useThemeColors";
import { DiscoverProfile, DuoCard } from "../../types/models";
import { compatibilityLabel, reasonLines } from "../../utils/insights";
import { Icon } from "../Icon";

const SHADE = ["transparent", "rgba(10,6,12,0.35)", "rgba(10,6,12,0.85)"] as const;

function Half({ person, onOpen }: { person: DiscoverProfile; onOpen: () => void }) {
  const { gradient } = useThemeColors();
  const photo = person.photoUrls[0];
  const place = [person.distanceKm !== null ? `${person.distanceKm} km` : null, person.city?.split(",")[0]]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      style={styles.half}
      accessibilityRole="button"
      accessibilityLabel={`${person.displayName}, ${person.age}. View profile`}
      onPress={onOpen}
    >
      {photo ? (
        <Image
          source={{ uri: resolveServerUrl(photo) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <LinearGradient colors={gradient} style={[StyleSheet.absoluteFill, styles.initial]}>
          <Text color="white" fontSize={56} fontWeight="700">
            {person.displayName.charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
      )}
      <LinearGradient colors={SHADE} locations={[0.45, 0.7, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <YStack position="absolute" left={12} right={10} bottom={78} gap={2} pointerEvents="none">
        <Text color="white" fontSize="$6" fontWeight="700" numberOfLines={1}>
          {person.displayName.split(" ")[0]}, {person.age}
        </Text>
        {place ? (
          <Text color="rgba(255,255,255,0.8)" fontSize="$1" numberOfLines={1}>
            {place}
          </Text>
        ) : null}
      </YStack>
    </Pressable>
  );
}

/** A pair in the Duo deck: both friends side by side, and what the four of you share. */
export function DuoCardView({
  card,
  onOpenMember
}: {
  card: DuoCard;
  onOpenMember: (person: DiscoverProfile) => void;
}) {
  const { glow } = useThemeColors();
  const reason = reasonLines(card.reasons)[0]?.replace(/^You both/, "You all");
  const match = compatibilityLabel(card.compatibility);
  return (
    <YStack flex={1} borderRadius={28} overflow="hidden" backgroundColor="#1E1720" testID={`duo-card-${card.duoId}`}>
      <XStack flex={1} gap={3}>
        {card.members.map((person) => (
          <Half key={person.uid} person={person} onOpen={() => onOpenMember(person)} />
        ))}
      </XStack>

      <XStack position="absolute" top={12} left={12} right={12} justifyContent="space-between" pointerEvents="none">
        {card.likedYou ? (
          <XStack
            gap={5}
            alignItems="center"
            backgroundColor="$primary"
            paddingHorizontal="$2"
            paddingVertical={5}
            borderRadius={999}
          >
            <Icon name="heart" size={13} color="primaryForeground" />
            <Text color="$primaryForeground" fontSize="$2" fontWeight="700">
              They like you two
            </Text>
          </XStack>
        ) : (
          <YStack />
        )}
        {match ? (
          <XStack
            gap={4}
            alignItems="center"
            backgroundColor="rgba(20,12,22,0.62)"
            paddingHorizontal="$2"
            paddingVertical={5}
            borderRadius={999}
          >
            <Icon name="sparkles" size={13} color={glow} />
            <Text color="white" fontSize="$2" fontWeight="700">
              {match}
            </Text>
          </XStack>
        ) : null}
      </XStack>

      <YStack position="absolute" left={12} right={12} bottom={12} pointerEvents="none">
        <XStack
          gap={6}
          alignItems="center"
          backgroundColor="rgba(20,12,22,0.62)"
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius={16}
        >
          <Icon name="people" size={15} color={glow} />
          <Text color="white" fontSize="$2" fontWeight="600" flex={1} numberOfLines={2}>
            {reason ?? "Paire AI thinks your four could have a great night out"}
          </Text>
        </XStack>
      </YStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  half: { flex: 1, overflow: "hidden" },
  initial: { alignItems: "center", justifyContent: "center" }
});
