import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useState } from "react";
import { BasicsScreen } from "../screens/onboarding/BasicsScreen";
import { InterestsScreen } from "../screens/onboarding/InterestsScreen";
import { PhotosScreen } from "../screens/onboarding/PhotosScreen";
import { useAuthStore } from "../store/authStore";
import { firstIncompleteStep } from "../utils/profile";
import type { OnboardingStackParamList } from "./types";

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  // Returning members resume where they left off; decided once when the stack mounts.
  const [initialRouteName] = useState(() => firstIncompleteStep(useAuthStore.getState().profile));

  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Basics" component={BasicsScreen} />
      <Stack.Screen name="Photos" component={PhotosScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
    </Stack.Navigator>
  );
}
