import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { features } from "../config/features";
import { useMatchAlerts, useMatchesSubscription, usePushRegistration } from "../hooks/useAppServices";
import { useLastActive } from "../hooks/useLastActive";
import { useLocationHeartbeat } from "../hooks/useLocationHeartbeat";
import { CallScreen } from "../screens/CallScreen";
import { ChatMembersScreen } from "../screens/ChatMembersScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { DuoScreen } from "../screens/DuoScreen";
import { EditPhotosScreen } from "../screens/EditPhotosScreen";
import { EditProfileScreen } from "../screens/EditProfileScreen";
import { LikesGalleryScreen } from "../screens/LikesGalleryScreen";
import { ProfileViewScreen } from "../screens/ProfileViewScreen";
import { ReportScreen } from "../screens/ReportScreen";
import { MyReportsScreen } from "../screens/MyReportsScreen";
import { AppearanceScreen } from "../screens/AppearanceScreen";
import { SafetyCenterScreen } from "../screens/SafetyCenterScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { PremiumScreen } from "../screens/PremiumScreen";
import { VerificationScreen } from "../screens/VerificationScreen";
import { VibeGuideScreen } from "../screens/VibeGuideScreen";
import { MainTabs } from "./MainTabs";
import type { AppStackParamList } from "./types";

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppStack() {
  // Background work for a signed-in, onboarded member.
  useMatchesSubscription();
  usePushRegistration();
  useMatchAlerts();
  useLastActive();
  useLocationHeartbeat();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen
        name="ProfileView"
        component={ProfileViewScreen}
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="EditPhotos" component={EditPhotosScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="SafetyCenter" component={SafetyCenterScreen} />
      <Stack.Screen name="MyReports" component={MyReportsScreen} />
      <Stack.Screen name="Verification" component={VerificationScreen} />
      <Stack.Screen name="Premium" component={PremiumScreen} />
      <Stack.Screen name="VibeGuide" component={VibeGuideScreen} />
      <Stack.Screen name="Appearance" component={AppearanceScreen} />
      <Stack.Screen name="ChatMembers" component={ChatMembersScreen} />
      <Stack.Screen name="Duo" component={DuoScreen} />
      <Stack.Screen name="LikesGallery" component={LikesGalleryScreen} options={{ animation: "fade_from_bottom" }} />
      <Stack.Screen
        name="Report"
        component={ReportScreen}
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      {features.calls ? <Stack.Screen name="Call" component={CallScreen} /> : null}
    </Stack.Navigator>
  );
}
