import { Pressable, ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { useAppearanceStore } from "../store/appearanceStore";
import { PALETTE_IDS, PALETTES } from "../theme/palettes";
import { Icon } from "./Icon";

/** One-tap themes on the Profile screen; "All themes" opens Appearance (light/dark and previews). */
export function ThemeQuickPicker({ onMore }: { onMore: () => void }) {
  const palette = useAppearanceStore((state) => state.palette);
  const setPalette = useAppearanceStore((state) => state.setPalette);
  return (
    <YStack gap="$2" padding="$4" borderRadius={24} backgroundColor="$backgroundStrong" borderWidth={1} borderColor="$border">
      <XStack alignItems="center" justifyContent="space-between">
        <Text fontWeight="700" fontSize="$4">Your theme</Text>
        <Pressable testID="profile-themes-more" accessibilityRole="button" onPress={onMore} style={{ minHeight: 36, justifyContent: "center" }}>
          <XStack alignItems="center" gap={4}>
            <Text color="$primary" fontWeight="700" fontSize="$2">All themes · dark mode</Text>
            <Icon name="chevron-forward" size={14} color="primary" />
          </XStack>
        </Pressable>
      </XStack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
        {PALETTE_IDS.map((id) => {
          const item = PALETTES[id];
          const active = id === palette;
          return (
            <Pressable
              key={id}
              testID={`theme-quick-${id}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${item.name} theme`}
              onPress={() => setPalette(id)}
            >
              <YStack alignItems="center" gap={6} width={64}>
                <YStack
                  width={48}
                  height={48}
                  borderRadius={24}
                  borderWidth={active ? 3 : 1}
                  borderColor={active ? "$primary" : "$border"}
                  padding={3}
                >
                  <XStack flex={1} borderRadius={20} overflow="hidden">
                    <YStack flex={1} backgroundColor={item.gradient[0]} />
                    <YStack flex={1} backgroundColor={item.light.primary} />
                    <YStack flex={1} backgroundColor={item.glow} />
                  </XStack>
                </YStack>
                <Text fontSize={11} numberOfLines={1} color={active ? "$primary" : "$textMuted"} fontWeight={active ? "700" : "500"}>
                  {item.name.split(" ")[0]}
                </Text>
              </YStack>
            </Pressable>
          );
        })}
      </ScrollView>
    </YStack>
  );
}
