import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/authStore";
import { AuthStack } from "./stacks/AuthStack";
import { OnboardingStack } from "./stacks/OnboardingStack";
import { AppStack } from "./stacks/AppStack";
import { ReportBlockScreen } from "../screens/ReportBlockScreen";

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  App: undefined;
  ReportBlock: { targetUid: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, profile } = useAuthStore();
  const onboardingComplete = Boolean(profile?.onboardingComplete);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : !onboardingComplete ? (
        <Stack.Screen name="Onboarding" component={OnboardingStack} />
      ) : (
        <Stack.Screen name="App" component={AppStack} />
      )}
      <Stack.Screen
        name="ReportBlock"
        component={ReportBlockScreen}
        options={{ presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
