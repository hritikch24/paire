import { LinearGradient } from "expo-linear-gradient";
import { Text, YStack } from "tamagui";

export function SplashScreen() {
  return (
    <LinearGradient
      colors={["#0B1018", "#0F3D52", "#F5F2EF"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text fontSize="$8" fontWeight="700" color="$text">
          Muse
        </Text>
        <Text fontSize="$4" color="$textMuted">
          Spark through creativity
        </Text>
      </YStack>
    </LinearGradient>
  );
}
