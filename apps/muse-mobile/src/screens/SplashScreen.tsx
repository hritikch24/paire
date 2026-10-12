import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator } from "react-native";
import { YStack } from "tamagui";
import { useThemeColors } from "../theme/useThemeColors";

/** Shown while fonts load and the session is restored. */
export function SplashScreen() {
  const { gradient } = useThemeColors();
  return (
    <LinearGradient colors={gradient} style={{ flex: 1 }}>
      <YStack flex={1} justifyContent="center" alignItems="center" gap="$5">
        <Image
          source={require("../../assets/icon.png")}
          style={{ width: 96, height: 96, borderRadius: 28 }}
          accessibilityIgnoresInvertColors
        />
        {/* An image, not text: it's shown before the app's font has loaded. */}
        <Image
          source={require("../../assets/wordmark.png")}
          style={{ width: 136, height: 30 }}
          contentFit="contain"
          accessibilityLabel="Paire"
        />
        <ActivityIndicator color="#FFFFFF" />
      </YStack>
    </LinearGradient>
  );
}
