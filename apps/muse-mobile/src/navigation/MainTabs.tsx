import { Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "tamagui";
import { Icon, IconName } from "../components/Icon";
import { useUnreadTotal } from "../hooks/useAppServices";
import { useLikesYou } from "../hooks/useLikesYou";
import { DiscoverScreen } from "../screens/DiscoverScreen";
import { MatchesScreen } from "../screens/MatchesScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import type { MainTabsParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabsParamList>();

const tabIcon =
  (active: IconName, inactive: IconName) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <Icon name={focused ? active : inactive} size={25} color={color} />
  );

export function MainTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const unread = useUnreadTotal();
  const pendingLikes = useLikesYou(true).data?.count ?? 0;
  const attention = unread + pendingLikes;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary?.val,
        tabBarInactiveTintColor: theme.textMuted?.val,
        // Room for the icon and a full line of label text, so labels never clip (web included).
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontFamily: "SpaceGrotesk_500Medium" },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarStyle: {
          backgroundColor: theme.backgroundStrong?.val,
          borderTopColor: theme.border?.val,
          height: (Platform.OS === "web" ? 80 : 74) + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8)
        }
      }}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{ tabBarButtonTestID: "tab-discover", tabBarIcon: tabIcon("flame", "flame-outline") }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          tabBarButtonTestID: "tab-matches",
          tabBarIcon: tabIcon("chatbubbles", "chatbubbles-outline"),
          tabBarBadge: attention > 0 ? (attention > 99 ? "99+" : attention) : undefined,
          tabBarAccessibilityLabel: `Matches, ${pendingLikes} pending likes, ${unread} unread messages`,
          tabBarBadgeStyle: { backgroundColor: theme.primary?.val, fontSize: 11 }
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarButtonTestID: "tab-profile", tabBarIcon: tabIcon("person", "person-outline") }}
      />
    </Tab.Navigator>
  );
}
