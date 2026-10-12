import { useAppDimensions } from "../utils/useAppDimensions";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Icon, IconName } from "../components/Icon";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { AppearanceMode, useAppearanceStore, useScheme } from "../store/appearanceStore";
import { Palette, PALETTE_IDS, PALETTES } from "../theme/palettes";

const MODES: Array<{ id: AppearanceMode; label: string; icon: IconName }> = [
  { id: "system", label: "System", icon: "phone-portrait-outline" },
  { id: "light", label: "Light", icon: "sunny-outline" },
  { id: "dark", label: "Dark", icon: "moon-outline" }
];

const GAP = 12;
const GUTTER = 16;

const tap = () => void Haptics.selectionAsync().catch(() => undefined);

/** A miniature of the app in one palette: hero, a card, a chat bubble and a button. */
function ThemePreview({
  palette,
  dark,
  selected,
  width,
  onPress
}: {
  palette: Palette;
  dark: boolean;
  selected: boolean;
  width: number;
  onPress: () => void;
}) {
  const colors = dark ? palette.dark : palette.light;
  return (
    <Pressable
      testID={`theme-${palette.id}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${palette.name} theme. ${palette.description}`}
      onPress={onPress}
      style={({ pressed }) => ({ width, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <YStack
        borderRadius={22}
        borderWidth={selected ? 2.5 : 1}
        borderColor={selected ? colors.primary : colors.border}
        backgroundColor={colors.background}
        overflow="hidden"
      >
        <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 78, padding: 12 }}>
          <XStack justifyContent="space-between" alignItems="flex-start">
            <Image
              source={require("../../assets/wordmark.png")}
              style={{ width: 54, height: 12 }}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
            <Icon name="sparkles" size={14} color={palette.glow} />
          </XStack>
          <XStack marginTop="auto" gap={4}>
            {[0.95, 0.55, 0.35].map((opacity) => (
              <YStack key={opacity} width={18} height={4} borderRadius={2} backgroundColor={`rgba(255,255,255,${opacity})`} />
            ))}
          </XStack>
        </LinearGradient>

        <YStack padding={10} gap={8}>
          <XStack justifyContent="flex-start">
            <YStack
              backgroundColor={colors.backgroundStrong}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius={12}
              borderBottomLeftRadius={4}
              paddingHorizontal={8}
              paddingVertical={5}
            >
              <Text fontSize={11} lineHeight={14} color={colors.text}>
                Chai or coffee?
              </Text>
            </YStack>
          </XStack>
          <XStack justifyContent="flex-end">
            <YStack backgroundColor={colors.primary} borderRadius={12} borderBottomRightRadius={4} paddingHorizontal={8} paddingVertical={5}>
              <Text fontSize={11} lineHeight={14} color={colors.primaryForeground}>
                Chai, always ☕
              </Text>
            </YStack>
          </XStack>
          <XStack gap={6} alignItems="center">
            <YStack flex={1} height={22} borderRadius={11} backgroundColor={colors.primarySoft} />
            <YStack width={22} height={22} borderRadius={11} backgroundColor={colors.primary} alignItems="center" justifyContent="center">
              <Icon name="heart" size={12} color={colors.primaryForeground} />
            </YStack>
          </XStack>
        </YStack>

        <XStack paddingHorizontal={12} paddingBottom={12} gap="$2" alignItems="center">
          <YStack flex={1} minWidth={0}>
            <Text fontSize="$3" fontWeight="700" color={colors.text} numberOfLines={1}>
              {palette.name}
            </Text>
            <Text fontSize={12} lineHeight={16} color={colors.textMuted} numberOfLines={2}>
              {palette.description}
            </Text>
          </YStack>
          <YStack
            width={22}
            height={22}
            borderRadius={11}
            borderWidth={selected ? 0 : 1.5}
            borderColor={colors.border}
            backgroundColor={selected ? colors.primary : "transparent"}
            alignItems="center"
            justifyContent="center"
          >
            {selected ? <Icon name="checkmark" size={14} color={colors.primaryForeground} /> : null}
          </YStack>
        </XStack>
      </YStack>
    </Pressable>
  );
}

export function AppearanceScreen() {
  const { width } = useAppDimensions();
  const scheme = useScheme();
  const palette = useAppearanceStore((state) => state.palette);
  const mode = useAppearanceStore((state) => state.mode);
  const setPalette = useAppearanceStore((state) => state.setPalette);
  const setMode = useAppearanceStore((state) => state.setMode);
  const cardWidth = Math.floor((Math.min(width, 520) - GUTTER * 2 - GAP) / 2);

  return (
    <Screen scroll>
      <ScreenHeader title="Appearance" subtitle="Make Paire feel like yours" />
      <YStack gap="$6">
        <YStack gap="$2">
          <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase" paddingHorizontal="$1">
            Mode
          </Text>
          <XStack
            accessibilityRole="radiogroup"
            backgroundColor="$backgroundSoft"
            borderRadius={999}
            padding={4}
            gap={4}
          >
            {MODES.map((item) => {
              const active = mode === item.id;
              return (
                <Pressable
                  key={item.id}
                  testID={`appearance-mode-${item.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{ flex: 1 }}
                  onPress={() => {
                    tap();
                    setMode(item.id);
                  }}
                >
                  <XStack
                    height={42}
                    borderRadius={999}
                    alignItems="center"
                    justifyContent="center"
                    gap="$2"
                    backgroundColor={active ? "$backgroundStrong" : "transparent"}
                    borderWidth={active ? 1 : 0}
                    borderColor="$border"
                  >
                    <Icon name={item.icon} size={16} color={active ? "primary" : "textMuted"} />
                    <Text fontSize="$2" fontWeight={active ? "700" : "500"} color={active ? "$text" : "$textMuted"}>
                      {item.label}
                    </Text>
                  </XStack>
                </Pressable>
              );
            })}
          </XStack>
          <Text fontSize="$1" color="$textMuted" paddingHorizontal="$1">
            {mode === "system" ? "Follows your phone's light or dark setting." : `Always ${mode}, whatever your phone uses.`}
          </Text>
        </YStack>

        <YStack gap="$3">
          <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase" paddingHorizontal="$1">
            Theme
          </Text>
          <XStack accessibilityRole="radiogroup" flexWrap="wrap" gap={GAP}>
            {PALETTE_IDS.map((id) => (
              <ThemePreview
                key={id}
                palette={PALETTES[id]}
                dark={scheme === "dark"}
                selected={palette === id}
                width={cardWidth}
                onPress={() => {
                  tap();
                  setPalette(id);
                }}
              />
            ))}
          </XStack>
          <Text fontSize="$1" color="$textMuted" paddingHorizontal="$1">
            Themes change colours across the whole app, in light and dark. Saved on this phone.
          </Text>
        </YStack>
      </YStack>
    </Screen>
  );
}
