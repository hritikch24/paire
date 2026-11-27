import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { Icon, IconName } from './Icon';

export type DiscoveryRoute = 'vibes' | 'metro' | 'events' | 'wedding';
const paths: {
  id: DiscoveryRoute;
  label: string;
  icon: IconName;
  color: 'primary' | 'like' | 'superLike' | 'warning';
}[] = [
  { id: 'vibes', label: 'Vibe match', icon: 'sparkles-outline', color: 'primary' },
  { id: 'metro', label: 'Metro', icon: 'train-outline', color: 'superLike' },
  { id: 'events', label: 'Events', icon: 'ticket-outline', color: 'like' },
  { id: 'wedding', label: 'Weddings', icon: 'flower-outline', color: 'warning' }
];
export function DiscoveryRoutes({
  onOpen,
  selected
}: {
  selected?: DiscoveryRoute | null;
  onOpen: (id: DiscoveryRoute) => void;
}) {
  return (
    <XStack
      width="100%"
      borderWidth={1}
      borderColor="$border"
      borderRadius={20}
      backgroundColor="$backgroundStrong"
      paddingVertical="$1"
    >
      {paths.map((path) => (
        <Pressable
          key={path.id}
          accessibilityRole="button"
          accessibilityLabel={path.label}
          aria-pressed={selected === undefined ? undefined : selected === path.id}
          testID={'route-' + path.id}
          style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}
          onPress={() => onOpen(path.id)}
        >
          <YStack
            gap={3}
            alignItems="center"
            borderRadius={14}
            paddingVertical={4}
            backgroundColor={selected === path.id ? '$primarySoft' : 'transparent'}
          >
            <Icon name={path.icon} size={19} color={path.color} />
            <Text textAlign="center" fontSize={12} fontWeight="600">
              {path.label}
            </Text>
          </YStack>
        </Pressable>
      ))}
    </XStack>
  );
}
