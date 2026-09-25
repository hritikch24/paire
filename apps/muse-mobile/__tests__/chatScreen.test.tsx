import React from "react";
import renderer, { act } from "react-test-renderer";
import { Alert } from "react-native";
import { ChatScreen } from "../src/screens/ChatScreen";
import { useAuthStore } from "../src/store/authStore";
import { endMatch } from "../src/services/matchService";

jest.mock("react-native", () => {
  const React = require("react");
  const View = (props: any) => React.createElement("View", props, props.children);
  const Text = (props: any) => React.createElement("Text", props, props.children);
  const Image = (props: any) => React.createElement("Image", props, props.children);
  const ScrollView = (props: any) => React.createElement("ScrollView", props, props.children);
  const KeyboardAvoidingView = (props: any) =>
    React.createElement("KeyboardAvoidingView", props, props.children);
  const TextInput = React.forwardRef((props: any, ref: any) =>
    React.createElement("TextInput", { ...props, ref }, props.children)
  );
  const FlatList = ({ data = [], renderItem, ListEmptyComponent, ...props }: any) => {
    const items = data.length
      ? data.map((item: any, index: number) => renderItem({ item, index }))
      : ListEmptyComponent
        ? typeof ListEmptyComponent === "function"
          ? ListEmptyComponent()
          : ListEmptyComponent
        : null;
    return React.createElement(View, props, items);
  };
  const Alert = { alert: jest.fn() };
  const useWindowDimensions = () => ({ width: 390, height: 844, fontScale: 1, scale: 2 });
  const Platform = { OS: "android" };
  return {
    View,
    Text,
    Image,
    ScrollView,
    KeyboardAvoidingView,
    TextInput,
    FlatList,
    Alert,
    Platform,
    useWindowDimensions
  };
});

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

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: { matchId: "match-1", targetUid: "user-2" } }),
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) })
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock("@firebase/firestore/dist/index.cjs.js", () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(async () => ({ exists: () => false })),
  onSnapshot: jest.fn((ref: any, cb: any) => {
    cb({
      docs: [],
      exists: () => true,
      data: () => ({ active: true })
    });
    return () => {};
  }),
  orderBy: jest.fn(),
  query: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() }))
}));

jest.mock("../src/services/matchService", () => ({
  sendMessage: jest.fn(),
  endMatch: jest.fn(async () => {})
}));

jest.mock("../src/services/firebase", () => ({
  db: {},
  auth: {}
}));

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

describe("ChatScreen", () => {
  beforeEach(() => {
    act(() => {
      useAuthStore.setState({
        user: ({ uid: "user-1", email: "test@muse.com" } as any),
        profile: ({ uid: "user-1", displayName: "Muse Tester" } as any),
        loading: false,
        isGuest: false
      });
    });
  });

  it("shows match ended state when match is inactive", async () => {
    const firestore = require("@firebase/firestore/dist/index.cjs.js");
    firestore.onSnapshot.mockImplementation((ref: any, cb: any) => {
      cb({
        docs: [],
        exists: () => false,
        data: () => ({ active: false })
      });
      return () => {};
    });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ChatScreen />);
    });
    await act(async () => {});

    const root = tree!.root;
    expect(root.findAll((node) => containsText(node, "Match ended")).length).toBeGreaterThan(0);
  });

  it("triggers unmatch flow", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons) => {
      const destructive = buttons?.find((btn) => btn.text === "Unmatch");
      destructive?.onPress?.();
    });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ChatScreen />);
    });
    await act(async () => {});

    const root = tree!.root;
    const unmatchButton = root.findAll((node) => containsText(node, "Unmatch"))[0];
    await act(async () => {
      unmatchButton.props.onPress();
    });

    expect(endMatch).toHaveBeenCalledWith({
      matchId: "match-1",
      endedBy: "user-1",
      reason: "unmatch"
    });
    alertSpy.mockRestore();
  });
});
