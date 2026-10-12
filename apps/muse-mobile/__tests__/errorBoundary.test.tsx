import React from "react";
import renderer, { act } from "react-test-renderer";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

jest.mock("tamagui", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Stack = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  return {
    Text,
    YStack: Stack,
    styled: (Component: any) => Component
  };
});

jest.mock("../src/components/MuseButton", () => ({
  PrimaryButton: ({ children, ...props }: { children?: React.ReactNode }) => {
    const React = require("react");
    return React.createElement("PrimaryButton", props, children);
  },
  SecondaryButton: ({ children, ...props }: { children?: React.ReactNode }) => {
    const React = require("react");
    return React.createElement("SecondaryButton", props, children);
  }
}));

jest.mock("react-native", () => {
  const React = require("react");
  const View = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("View", props, children);
  const Text = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children);
  return {
    View,
    Text
  };
});

const Thrower = () => {
  throw new Error("Boom");
};

describe("ErrorBoundary", () => {
  it("renders fallback on error", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        React.createElement(ErrorBoundary, null, React.createElement(Thrower))
      );
    });
    const root = tree!.root;
    const hasText = root.findAll(
      (node) => typeof node.props?.children === "string" && node.props.children.includes("Something went wrong")
    );
    expect(hasText.length).toBeGreaterThan(0);
    const retry = root.findAll((node) => (node.type as unknown) === "PrimaryButton");
    expect(retry.length).toBe(1);
    consoleSpy.mockRestore();
  });
});
