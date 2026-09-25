import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthScreen } from "../../screens/AuthScreen";
import { WelcomeScreen } from "../../screens/WelcomeScreen";
import { AuthHelpScreen } from "../../screens/AuthHelpScreen";
import { SignupScreen } from "../../screens/SignupScreen";

export type AuthStackParamList = {
  Welcome: undefined;
  AuthHome: undefined;
  Signup: undefined;
  AuthHelp: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="AuthHome" component={AuthScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="AuthHelp" component={AuthHelpScreen} />
    </Stack.Navigator>
  );
}
