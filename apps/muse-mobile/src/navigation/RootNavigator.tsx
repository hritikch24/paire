import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { VerifyEmailScreen } from "../screens/auth/VerifyEmailScreen";
import { useAuthStore } from "../store/authStore";
import { needsOnboarding } from "../utils/profile";
import { AppStack } from "./AppStack";
import { AuthStack } from "./AuthStack";
import { OnboardingStack } from "./OnboardingStack";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Signed out → Auth; email not confirmed yet → VerifyEmail; incomplete profile →
 * Onboarding; otherwise the app.
 */
export function RootNavigator() {
  const signedIn = useAuthStore((state) => state.status === "signedIn");
  const emailVerified = useAuthStore((state) => state.emailVerified);
  const onboarding = useAuthStore((state) => needsOnboarding(state.profile));

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
      {!signedIn ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : !emailVerified ? (
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      ) : onboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingStack} />
      ) : (
        <Stack.Screen name="App" component={AppStack} />
      )}
    </Stack.Navigator>
  );
}
