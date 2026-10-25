import React from "react";
import renderer, { act } from "react-test-renderer";
import { MatchMoment } from "../src/components/MatchMoment";
import type { ChatAccess } from "../src/services/chatAccessService";

const lockedAccess = { enforced: true, unlimited: false, premiumUntil: null, legacyCutoff: null, legacyGraceUntil: null, unlock: { priceInr: 49 } } as unknown as ChatAccess;
let mockAccess: ChatAccess | undefined;
let mockPolicy: { freeSender: boolean } | undefined;

jest.mock("react-native", () => {
  const value = { Platform: { OS: "web" }, Modal: "Modal", Animated: { View: "AnimatedView", Value: class { setValue() {} interpolate() { return 0; } }, timing: () => ({ start: jest.fn() }), spring: () => ({ start: jest.fn() }), parallel: () => ({ start: jest.fn() }), sequence: () => ({ start: jest.fn() }), loop: () => ({ start: jest.fn(), stop: jest.fn() }), modulo: () => ({ interpolate: () => 0 }), add: () => 0 }, Easing: { out: () => 0, back: () => 0, linear: 0 } };
  return value;
});
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn().mockResolvedValue(undefined), impactAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("../src/theme/useThemeColors", () => ({ useThemeColors: () => ({ gradient: ["#1", "#2", "#3"] }) }));
jest.mock("../src/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
jest.mock("../src/hooks/useChatAccess", () => ({ useChatAccess: () => ({ data: mockAccess }) }));
jest.mock("../src/hooks/useSendPolicy", () => ({ useSendPolicy: () => ({ data: mockPolicy }) }));
jest.mock("../src/components/Avatar", () => ({ Avatar: "Avatar" }));
jest.mock("../src/components/Icon", () => ({ Icon: "Icon" }));
jest.mock("../src/components/MuseButton", () => ({ GhostButton: "GhostButton", SecondaryButton: "SecondaryButton" }));

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<MatchMoment visible me={{ name: "Her" }} them={{ name: "Arjun" }} onMessage={jest.fn()} onClose={jest.fn()} />); });
  return tree;
};
const payNote = (tree: renderer.ReactTestRenderer) => tree.root.findAllByProps({ testID: "match-access-note" });
afterEach(() => { mockAccess = undefined; mockPolicy = undefined; });

test("a man without a pass sees the pay copy, as today", async () => {
  mockAccess = lockedAccess;
  mockPolicy = { freeSender: false };
  const tree = await mount();
  expect(payNote(tree)).toHaveLength(1);
  expect(tree.root.findByProps({ testID: "match-message" }).props.children).toBe("Open the chat");
});

test("a free-sending woman sees no pay copy right after a mutual swipe", async () => {
  mockAccess = lockedAccess;
  mockPolicy = { freeSender: true };
  const tree = await mount();
  expect(payNote(tree)).toHaveLength(0);
  expect(tree.root.findByProps({ testID: "match-message" }).props.children).toBe("Send a message");
});

test("while the policy is unknown the paid-chat result stands", async () => {
  mockAccess = lockedAccess;
  expect(payNote(await mount())).toHaveLength(1);
});
