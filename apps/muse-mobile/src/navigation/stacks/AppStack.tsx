import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MainTabs } from "../tabs/MainTabs";
import { ChatScreen } from "../../screens/ChatScreen";
import { PublicProfileScreen } from "../../screens/PublicProfileScreen";
import { EditProfileScreen } from "../../screens/EditProfileScreen";
import { EditPhotosScreen } from "../../screens/EditPhotosScreen";
import { SettingsScreen } from "../../screens/SettingsScreen";
import { UIShowcaseScreen } from "../../screens/UIShowcaseScreen";
import { CallScreen } from "../../screens/CallScreen";
import { SafetyCenterScreen } from "../../screens/SafetyCenterScreen";
import { RandomConnectScreen } from "../../screens/RandomConnectScreen";

export type AppStackParamList = {
  Tabs: undefined;
  Chat: { matchId: string; targetUid: string };
  PublicProfile: { uid: string };
  EditProfile: undefined;
  EditPhotos: undefined;
  Settings: undefined;
  SafetyCenter: undefined;
  RandomConnect: undefined;
  Call: { roomId: string; video: boolean };
  UIShowcase: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="EditPhotos" component={EditPhotosScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="SafetyCenter" component={SafetyCenterScreen} />
      <Stack.Screen name="RandomConnect" component={RandomConnectScreen} />
      <Stack.Screen name="Call" component={CallScreen} />
      <Stack.Screen name="UIShowcase" component={UIShowcaseScreen} />
    </Stack.Navigator>
  );
}
