import React from "react";
import renderer, { act } from "react-test-renderer";
import { GiftRequestSheet } from "../src/components/GiftRequestSheet.web";
import { closeGiftRequest, requestPlusGift } from "../src/services/giftRequestService";
let mockData: { enabled: boolean; requests: unknown[] };
const mockRefetch = jest.fn();
jest.mock("react-native", () => ({ Platform: { OS: "web" }, Modal: "Modal", Pressable: "Pressable", ScrollView: "ScrollView" }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: mockData, refetch: mockRefetch }) }));
jest.mock("../src/components/MuseButton", () => ({ PrimaryButton: "PrimaryButton", SecondaryButton: "SecondaryButton" }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { uid: "me" } }) }));
jest.mock("../src/services/giftRequestService", () => ({ requestPlusGift: jest.fn(), closeGiftRequest: jest.fn(), fetchGiftRequests: jest.fn() }));
jest.mock("../src/services/errors", () => ({ friendlyError: (_e: unknown, fallback: string) => fallback }));
beforeEach(() => { mockData = { enabled: true, requests: [] }; jest.clearAllMocks(); });
const mount = async () => {
  const onGift = jest.fn(); let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<GiftRequestSheet matchId="me_them" onClose={jest.fn()} onGift={onGift} />); });
  return { tree, onGift };
};
test("choosing a plan creates no payment and only explicit Ask sends a structured request", async () => {
  const { tree, onGift } = await mount();
  await act(async () => { tree.root.findByProps({ testID: "request-plan-week" }).props.onPress(); });
  expect(requestPlusGift).not.toHaveBeenCalled(); expect(onGift).not.toHaveBeenCalled();
  await act(async () => { await tree.root.findByProps({ testID: "gift-request-send" }).props.onPress(); });
  expect(requestPlusGift).toHaveBeenCalledWith("me_them", "week"); expect(onGift).not.toHaveBeenCalled();
});
test("No thanks closes only the incoming request; choosing gift passes the requested plan to price review", async () => {
  const row = { id: "request", version: "v1", fromUid: "them", toUid: "me", plan: "day", status: "pending" };
  mockData.requests = [row]; const { tree, onGift } = await mount();
  const no = tree.root.findAll(node => (node.type as unknown) === "SecondaryButton" && node.props.children === "No thanks")[0];
  await act(async () => { await no.props.onPress(); });
  expect(closeGiftRequest).toHaveBeenCalledWith(row, "decline"); expect(onGift).not.toHaveBeenCalled();
  await act(async () => { tree.root.findByProps({ testID: "request-choose-gift" }).props.onPress(); }); expect(onGift).toHaveBeenCalledWith("day");
});
test("sales off disables new asks and checkout, but keeps refusal available", async () => {
  mockData = { enabled: false, requests: [{ id: "request", version: "v1", fromUid: "them", toUid: "me", plan: "month", status: "pending" }] };
  const { tree } = await mount();
  expect(tree.root.findByProps({ testID: "gift-request-send" }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ testID: "request-choose-gift" }).props.disabled).toBe(true);
  expect(tree.root.findAll(node => (node.type as unknown) === "SecondaryButton" && node.props.children === "No thanks")[0].props.disabled).toBe(false);
});
