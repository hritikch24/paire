import React from "react";
import renderer, { act } from "react-test-renderer";
import { WelcomeScreen } from "../src/screens/WelcomeScreen";
import { DiscoverScreen } from "../src/screens/DiscoverScreen";
import { MatchesScreen } from "../src/screens/MatchesScreen";
import { ProfileScreen } from "../src/screens/ProfileScreen";
import { SettingsScreen } from "../src/screens/SettingsScreen";
import { SafetyCenterScreen } from "../src/screens/SafetyCenterScreen";
import { RandomConnectScreen } from "../src/screens/RandomConnectScreen";
import { useAuthStore } from "../src/store/authStore";
import * as ReactNative from "react-native";
import { User } from "@firebase/auth/dist/rn";

jest.mock("tamagui", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Stack = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  const Button = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  const Input = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  const Slider = Object.assign(
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    {
      Track: ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(View, props, children),
      TrackActive: ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(View, props, children),
      Thumb: ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(View, props, children)
    }
  );
  return {
    Text,
    YStack: Stack,
    XStack: Stack,
    Card: Stack,
    Button,
    Input,
    Slider,
    styled: (Component: any) => Component
  };
});

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), getParent: () => null, goBack: jest.fn() }),
  useFocusEffect: () => {}
}));

jest.mock("@react-navigation/bottom-tabs", () => ({
  useBottomTabBarHeight: () => 72
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown }) => {
    const { demoProfiles } = require("../src/data/demoProfiles");
    const key = Array.isArray(options?.queryKey) ? options?.queryKey[0] : options?.queryKey;
    if (key === "discover") {
      return { data: demoProfiles, isLoading: false, isFetching: false, refetch: jest.fn() };
    }
    if (key === "matches") {
      return { data: [], isLoading: false, isFetching: false, refetch: jest.fn() };
    }
    return { data: [], isLoading: false, isFetching: false, refetch: jest.fn() };
  }
}));

jest.mock("../src/services/discoveryService", () => ({
  fetchDiscoverProfiles: jest.fn()
}));

jest.mock("../src/services/swipeService", () => ({
  recordSwipe: jest.fn()
}));

jest.mock("../src/data/musePrompts", () => ({
  musePromptTitle: "Today’s Spark",
  getDailyPrompt: () => "Describe your vibe with three sensory details."
}));

jest.mock("../src/services/firebase", () => ({
  db: {},
  auth: {}
}));

jest.mock(
  "@firebase/auth/dist/rn",
  () => ({
    signOut: jest.fn()
  }),
  { virtual: true }
);

jest.mock("../src/utils/location", () => ({
  getLocationSnapshot: jest.fn(async () => ({ status: "denied", location: null }))
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "Medium" },
  NotificationFeedbackType: { Success: "Success" }
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock("../src/components/SwipeDeck", () => ({
  SwipeDeck: () => null
}));

const renderWithProvider = (node: React.ReactElement) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
};

describe("layout snapshots across screen sizes", () => {
  let useWindowDimensionsSpy: jest.SpyInstance;

  beforeEach(() => {
    useWindowDimensionsSpy = jest.spyOn(ReactNative, "useWindowDimensions");
    act(() => {
      useAuthStore.setState({
        user: ({ uid: "guest_test" } as unknown as User),
        profile: {
          uid: "guest_test",
          displayName: "Guest",
          pronouns: "",
          age: 25,
          city: "India",
          bio: "Exploring Muse in guest mode.",
          photoUrls: [],
          interests: [],
          intentions: [],
          vibes: [],
          vibePreference: "any",
          maxDistanceKm: 25,
          quickAnswers: [],
          location: null,
          shareLocation: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          onboardingComplete: true,
          safetyConfirmed: true,
          lastActiveAt: Date.now(),
          isDiscoverable: false
        },
        loading: false,
        isGuest: true
      });
    });
  });
  afterEach(() => {
    useWindowDimensionsSpy.mockRestore();
  });

  it("renders Welcome and Discover on small screens", () => {
    useWindowDimensionsSpy.mockReturnValue({ width: 320, height: 568, fontScale: 1, scale: 2 });
    const tree = renderWithProvider(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(WelcomeScreen),
          React.createElement(DiscoverScreen),
          React.createElement(MatchesScreen),
          React.createElement(ProfileScreen),
          React.createElement(SettingsScreen),
          React.createElement(SafetyCenterScreen),
          React.createElement(RandomConnectScreen)
        )
      );
    expect(tree.toJSON()).toMatchSnapshot();
    act(() => {
      tree.unmount();
    });
  });

  it("renders Welcome and Discover on medium screens", () => {
    useWindowDimensionsSpy.mockReturnValue({ width: 390, height: 844, fontScale: 1, scale: 2 });
    const tree = renderWithProvider(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(WelcomeScreen),
          React.createElement(DiscoverScreen),
          React.createElement(MatchesScreen),
          React.createElement(ProfileScreen),
          React.createElement(SettingsScreen),
          React.createElement(SafetyCenterScreen),
          React.createElement(RandomConnectScreen)
        )
      );
    expect(tree.toJSON()).toMatchSnapshot();
    act(() => {
      tree.unmount();
    });
  });

  it("renders Welcome and Discover on large screens", () => {
    useWindowDimensionsSpy.mockReturnValue({ width: 480, height: 960, fontScale: 1, scale: 2 });
    const tree = renderWithProvider(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(WelcomeScreen),
          React.createElement(DiscoverScreen),
          React.createElement(MatchesScreen),
          React.createElement(ProfileScreen),
          React.createElement(SettingsScreen),
          React.createElement(SafetyCenterScreen),
          React.createElement(RandomConnectScreen)
        )
      );
    expect(tree.toJSON()).toMatchSnapshot();
    act(() => {
      tree.unmount();
    });
  });
});
