import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthHelpScreen } from "../screens/auth/AuthHelpScreen";
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";
import { SignInScreen } from "../screens/auth/SignInScreen";
import { SignUpScreen } from "../screens/auth/SignUpScreen";
import { WelcomeScreen } from "../screens/auth/WelcomeScreen";
import type { AuthStackParamList } from "./types";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="AuthHelp" component={AuthHelpScreen} />
    </Stack.Navigator>
  );
}
