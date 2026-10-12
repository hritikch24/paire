import { Image } from "expo-image";
import { Text, YStack } from "tamagui";
import { resolveServerUrl } from "../services/testServer";

type AvatarProps = {
  uri?: string | null;
  name?: string;
  size?: number;
  ring?: boolean;
};

export function Avatar({ uri, name, size = 48, ring }: AvatarProps) {
  const initial = name?.trim().charAt(0).toUpperCase() || "M";
  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size / 2}
      overflow="hidden"
      backgroundColor="$primarySoft"
      alignItems="center"
      justifyContent="center"
      borderWidth={ring ? 2 : 0}
      borderColor="$primary"
    >
      {uri ? (
        <Image
          source={{ uri: resolveServerUrl(uri) }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text fontWeight="700" fontSize={Math.round(size * 0.4)} color="$primary">
          {initial}
        </Text>
      )}
    </YStack>
  );
}

/** Two overlapping avatars, for a pair of friends (Duos). */
export function AvatarPair({
  people,
  size = 48,
  ring
}: {
  people: Array<{ uri?: string | null; name?: string }>;
  size?: number;
  ring?: boolean;
}) {
  const [first, second] = people;
  if (!second) return <Avatar uri={first?.uri} name={first?.name} size={size} ring={ring} />;
  const small = Math.round(size * 0.72);
  return (
    <YStack width={size} height={size}>
      <YStack position="absolute" left={0} top={0}>
        <Avatar uri={first?.uri} name={first?.name} size={small} ring={ring} />
      </YStack>
      <YStack position="absolute" right={0} bottom={0} borderRadius={small} borderWidth={2} borderColor="$background">
        <Avatar uri={second.uri} name={second.name} size={small - 4} ring={ring} />
      </YStack>
    </YStack>
  );
}
