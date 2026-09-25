import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme } from "tamagui";
import { DiscoverScreen } from "../../screens/DiscoverScreen";
import { MatchesScreen } from "../../screens/MatchesScreen";
import { ProfileScreen } from "../../screens/ProfileScreen";

export type MainTabsParamList = {
  Discover: undefined;
  Matches: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const iconMap = {
  Discover: require("../../../assets/icons/tab-discover.png"),
  Matches: require("../../../assets/icons/tab-matches.png"),
  Profile: require("../../../assets/icons/tab-profile.png")
};

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);
  const theme = useTheme();
  const activeColor = theme.primary?.get() ?? "#0F3D52";
  const inactiveColor = theme.textMuted?.get() ?? "#6D6672";
  const barBackground = theme.background?.get() ?? "#F5F2EF";
  const barBorder = theme.border?.get() ?? "#DED7D4";
  const renderLabel = (label: string) =>
    ({ color }: { color: string }) => (
      <Text color={color} fontSize="$2" allowFontScaling={false}>
        {label}
      </Text>
    );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          height: 72 + bottomInset,
          paddingBottom: 12 + bottomInset,
          paddingTop: 8,
          backgroundColor: barBackground,
          borderTopColor: barBorder
        },
        tabBarIcon: ({ color }) => (
          <Image source={iconMap.Discover} style={{ width: 22, height: 22, tintColor: color }} />
        )
      }}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarButtonTestID: "tab-discover",
          tabBarAccessibilityLabel: "Discover",
          tabBarLabel: renderLabel("Discover"),
          tabBarIcon: ({ color }) => (
            <Image source={iconMap.Discover} style={{ width: 22, height: 22, tintColor: color }} />
          )
        }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          tabBarButtonTestID: "tab-matches",
          tabBarAccessibilityLabel: "Matches",
          tabBarLabel: renderLabel("Matches"),
          tabBarIcon: ({ color }) => (
            <Image source={iconMap.Matches} style={{ width: 22, height: 22, tintColor: color }} />
          )
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarButtonTestID: "tab-profile",
          tabBarAccessibilityLabel: "Profile",
          tabBarLabel: renderLabel("Profile"),
          tabBarIcon: ({ color }) => (
            <Image source={iconMap.Profile} style={{ width: 22, height: 22, tintColor: color }} />
          )
        }}
      />
    </Tab.Navigator>
  );
}
