import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { LogBox, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { TamaguiProvider } from "tamagui";
import config from "../../tamagui.config";
import { useAuthListener } from "../hooks/useAuthListener";
import { useLastActive } from "../hooks/useLastActive";
import { useLocationHeartbeat } from "../hooks/useLocationHeartbeat";
import { useAuthStore } from "../store/authStore";
import { useProfileQuery } from "../hooks/useProfile";
import { RootNavigator } from "../navigation/RootNavigator";
import { SplashScreen } from "../screens/SplashScreen";
import { isAppReady } from "../utils/appReady";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";

if (process.env.EXPO_PUBLIC_E2E === "true") {
  LogBox.ignoreAllLogs();
}

const queryClient = new QueryClient();

function AppContent() {
  const scheme = useColorScheme();
  const { user, loading, isGuest, isDemo, profile } = useAuthStore();
  const { isLoading: profileLoading, isFetched: profileFetched } = useProfileQuery(user?.uid);
  const [splashTimeout, setSplashTimeout] = useState(false);

  useAuthListener();
  useLastActive();
  useLocationHeartbeat();

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold
  });

  const themeName = scheme === "dark" ? "dark" : "light";
  const ready = isAppReady({
    fontsLoaded,
    splashTimeout,
    loading,
    user,
    profileLoading,
    profileFetched,
    isGuest,
    isDemo,
    profileLoaded: Boolean(profile)
  });

  useEffect(() => {
    const timer = setTimeout(() => setSplashTimeout(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TamaguiProvider config={config} defaultTheme={themeName}>
        <ErrorBoundary>
          {ready ? (
            <SafeAreaProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </SafeAreaProvider>
          ) : (
            <SplashScreen />
          )}
        </ErrorBoundary>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </TamaguiProvider>
    </GestureHandlerRootView>
  );
}

export default function MainApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
