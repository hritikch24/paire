import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProfileSetupScreen } from "../../screens/onboarding/ProfileSetupScreen";
import { PhotoSetupScreen } from "../../screens/onboarding/PhotoSetupScreen";
import { InterestsScreen } from "../../screens/onboarding/InterestsScreen";
import { RapidQuestionsScreen } from "../../screens/onboarding/RapidQuestionsScreen";
import { SafetyConfirmScreen } from "../../screens/onboarding/SafetyConfirmScreen";

export type OnboardingStackParamList = {
  ProfileSetup: undefined;
  PhotoSetup: undefined;
  Interests: undefined;
  RapidQuestions: undefined;
  SafetyConfirm: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      <Stack.Screen name="PhotoSetup" component={PhotoSetupScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="RapidQuestions" component={RapidQuestionsScreen} />
      <Stack.Screen name="SafetyConfirm" component={SafetyConfirmScreen} />
    </Stack.Navigator>
  );
}
