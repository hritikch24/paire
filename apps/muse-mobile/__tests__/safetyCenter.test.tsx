import React from "react";
import renderer, { act } from "react-test-renderer";
import { SafetyCenterScreen } from "../src/screens/SafetyCenterScreen";

jest.mock("../src/services/firebase", () => ({
  db: {}
}));

jest.mock("../src/utils/location", () => ({
  getLocationSnapshot: jest.fn(async () => ({ status: "denied", location: null }))
}));

jest.mock("tamagui", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Stack = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  const Button = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  const Input = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  return {
    Text,
    YStack: Stack,
    XStack: Stack,
    Card: Stack,
    Button,
    Input,
    styled: (Component: any) => Component
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

describe("SafetyCenterScreen", () => {
  it("renders the check-in timer section", () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<SafetyCenterScreen />);
    });
    const root = tree!.root;
    const containsText = (text: string) =>
      root.findAll(
        (node) =>
          typeof node.props?.children === "string" && node.props.children.includes(text)
      ).length > 0;
    expect(containsText("Check-in timer")).toBe(true);
    expect(containsText("Start check-in")).toBe(true);
  });
});
