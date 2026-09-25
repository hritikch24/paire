import React from "react";
import renderer, { act } from "react-test-renderer";
import { CallScreen } from "../src/screens/CallScreen";
import { useAuthStore } from "../src/store/authStore";

jest.mock("tamagui", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Stack = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  const Button = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  return {
    Text,
    YStack: Stack,
    XStack: Stack,
    Card: Stack,
    Button,
    styled: (Component: any) => Component
  };
});

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: { roomId: "room-test", video: true } }),
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() })
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { WebView: (props: any) => React.createElement(View, props) };
});

describe("CallScreen", () => {
  beforeEach(() => {
    useAuthStore.setState({
      profile: ({ uid: "test", displayName: "Muse Tester" } as any)
    });
  });

  it("gates the call behind consent", async () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CallScreen />);
    });
    const root = tree!.root;
    const containsText = (node: renderer.ReactTestInstance, text: string) => {
      const children = node.props?.children;
      if (typeof children === "string") {
        return children.includes(text);
      }
      if (Array.isArray(children)) {
        return children.some((child) => typeof child === "string" && child.includes(text));
      }
      return false;
    };
    expect(root.findAll((node) => containsText(node, "Ready when you are")).length).toBeGreaterThan(
      0
    );
    expect(
      root.findAll((node) => containsText(node, "Connecting call...")).length
    ).toBe(0);
    const joinButton = root.findByProps({ testID: "call-join" });
    await act(async () => {
      await joinButton.props.onPress();
    });
    expect(
      root.findAll((node) => containsText(node, "Connecting call...")).length
    ).toBeGreaterThan(0);
  });
});
