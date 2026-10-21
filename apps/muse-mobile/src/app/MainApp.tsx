import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts
} from "@expo-google-fonts/space-grotesk";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { LogBox, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider, Theme, useTheme } from "tamagui";
import config from "../../tamagui.config";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { BrowserLayout } from "../components/BrowserLayout";
import { ToastHost } from "../components/Toast";
import { SupportSessionBoundary } from "../components/SupportSessionBoundary";
import { env } from "../config/env";
import { useAuthSession } from "../hooks/useAuthSession";
import { useNotificationRouting } from "../hooks/useNotificationRouting";
import { useTestServerLinks } from "../hooks/useTestServerLinks";
import { flushPendingNavigation, navigationRef } from "../navigation/navigationRef";
import { browserLinking } from "../navigation/browserLinking";
import { RootNavigator } from "../navigation/RootNavigator";
import { SplashScreen } from "../screens/SplashScreen";
import { TestServerScreen } from "../screens/TestServerScreen";
import { revalidateSession } from "../services/accountService";
import { noteActivity } from "../services/activity";
import { configureNotifications } from "../services/notificationService";
import { queryClient } from "../services/queryClient";
import { useAppearanceStore, useScheme } from "../store/appearanceStore";
import { useAuthStore } from "../store/authStore";
import { useTestServerStore } from "../store/testServerStore";

if (env.isE2E) {
  LogBox.ignoreAllLogs();
}

configureNotifications();

const FONT_TIMEOUT_MS = 3000;
/** Matches `splash.backgroundColor` in app.config.js. */
const SPLASH_BACKGROUND = "#FBF8F6";

function useSessionReady(): boolean {
  return useAuthStore((state) => {
    if (state.status === "initializing") return false;
    if (state.status === "signedOut") return true;
    return state.profileLoaded && state.settingsLoaded && state.infoLoaded;
  });
}

function AppNavigation() {
  const scheme = useScheme();
  const theme = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.primary?.val ?? base.colors.primary,
      background: theme.background?.val ?? base.colors.background,
      card: theme.backgroundStrong?.val ?? base.colors.card,
      text: theme.text?.val ?? base.colors.text,
      border: theme.border?.val ?? base.colors.border
    }
  };

  return (
    <NavigationContainer ref={navigationRef} linking={browserLinking} theme={navigationTheme} onReady={flushPendingNavigation}>
      <RootNavigator />
    </NavigationContainer>
  );
}

/** The signed-in or signed-out app, once the backend is reachable. */
function Session({ fontsReady }: { fontsReady: boolean }) {
  const scheme = useScheme();
  const sessionReady = useSessionReady();

  useAuthSession();
  useNotificationRouting();

  useEffect(() => {
    // Mounted once the test server answers: make sure the saved session still exists there.
    if (env.testServer) void revalidateSession();
  }, []);

  const ready = fontsReady && sessionReady;

  return (
    <>
      {ready ? <AppNavigation /> : <SplashScreen />}
      <StatusBar style={ready ? (scheme === "dark" ? "light" : "dark") : "light"} />
    </>
  );
}

function AppContent() {
  const scheme = useScheme();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold
  });
  const [fontTimeout, setFontTimeout] = useState(false);
  // Always "ready" except in test-server builds, which first connect to the server.
  const serverStatus = useTestServerStore((state) => state.status);

  useTestServerLinks();

  useEffect(() => {
    // Never block the app on fonts: fall back to system fonts after a moment.
    const timer = setTimeout(() => setFontTimeout(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // The bar is transparent; its style ("dark" = light buttons) follows the theme.
    if (Platform.OS === "android") NavigationBar.setStyle(scheme);
  }, [scheme]);

  const palette = useAppearanceStore((state) => state.palette);
  const appearanceLoaded = useAppearanceStore((state) => state.loaded);
  useEffect(() => {
    void useAppearanceStore.getState().load();
  }, []);

  const fontsReady = fontsLoaded || fontTimeout;
  let content: ReactNode;
  if (serverStatus === "ready") {
    content = <Session fontsReady={fontsReady} />;
  } else if (serverStatus === "checking" || !fontsReady) {
    content = (
      <>
        <SplashScreen />
        <StatusBar style="light" />
      </>
    );
  } else {
    content = <TestServerScreen />;
  }

  return (
    <TamaguiProvider config={config} defaultTheme={scheme === "dark" ? "dark" : "light"}>
      {/* The saved theme loads in a few ms; waiting avoids a flash of the default one. */}
      {appearanceLoaded ? (
        <Theme name={palette}>
          <BrowserLayout><ErrorBoundary><SupportSessionBoundary>{content}</SupportSessionBoundary></ErrorBoundary></BrowserLayout>
          <ToastHost />
        </Theme>
      ) : (
        // Same colour as the native splash, so there's no blank frame.
        <View style={{ flex: 1, backgroundColor: SPLASH_BACKGROUND }} />
      )}
    </TamaguiProvider>
  );
}

export default function MainApp() {
  return (
    // Any touch inside Paire counts as activity for presence (only the moment is noted).
    <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={noteActivity}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <AppContent />
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
