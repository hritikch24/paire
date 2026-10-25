import React from "react";
import renderer, { act } from "react-test-renderer";
import { GiftBanner } from "../src/components/GiftBanner";
import { showToast } from "../src/components/Toast";
import { claimGift, declineGift } from "../src/services/giftService";

let mockGifts: unknown;
const mockInvalidate = jest.fn();
const mockSetData = jest.fn((_key: unknown, update: (list: unknown) => unknown) => { mockGifts = update(mockGifts); });
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate, setQueryData: mockSetData }) }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "her" } }) }));
jest.mock("../src/components/Toast", () => ({ showToast: jest.fn() }));
jest.mock("../src/components/MuseButton", () => ({ PrimaryButton: "PrimaryButton", GhostButton: "GhostButton" }));
jest.mock("../src/hooks/useGifts", () => ({ useGifts: () => ({ data: mockGifts }) }));
// Sales being off must never stop a paid gift from being claimed.
jest.mock("../src/hooks/useSendPolicy", () => ({ useSendPolicy: () => ({ data: { giftSales: false } }) }));
jest.mock("../src/services/giftService", () => ({ claimGift: jest.fn(), declineGift: jest.fn() }));

const gift = (over: object) => ({ id: "order_G1", plan: "week", status: "pending", counterpartName: "Priya", createdAt: 1, expiresAt: Date.now() + 86_400_000, ...over });
const mount = async (spaced = false) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<GiftBanner spaced={spaced} />); });
  return tree;
};
const rerender = (tree: renderer.ReactTestRenderer) => act(async () => { tree.update(<GiftBanner />); });
const find = (tree: renderer.ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID });
const words = (tree: renderer.ReactTestRenderer) => tree.root.findAll((node) => ["Text", "PrimaryButton", "GhostButton"].includes(node.type as string)).map((node) => [node.props.children].flat().join("")).join(" | ");
beforeEach(() => { mockGifts = { received: [gift({})], sent: [] }; });
afterEach(() => jest.clearAllMocks());

test("a pending received gift shows who sent it and what it is, with Accept gift and No thanks", async () => {
  const tree = await mount();
  expect(words(tree)).toContain("Priya gifted you Paire Plus: 1 week");
  expect(find(tree, "gift-accept")[0].props.accessibilityLabel).toBe("Accept gift from Priya");
  expect(find(tree, "gift-decline")[0].props.accessibilityLabel).toBe("No thanks to the gift from Priya");
  expect(words(tree)).toContain("Accept gift");
  expect(words(tree)).toContain("No thanks");
});

test.each([
  ["no gifts", { received: [], sent: [] }],
  ["still loading", undefined],
  ["only sent gifts", { received: [], sent: [gift({})] }],
  ["an answered or ended gift", { received: [gift({ status: "claimed" }), gift({ id: "o2", status: "declined" }), gift({ id: "o3", status: "expired" })], sent: [] }]
])("nothing shows for %s", async (_name, gifts) => {
  mockGifts = gifts;
  expect((await mount()).toJSON()).toBeNull();
});

test("Accept gift calls claimGift once even on a double tap, then thanks them with the date and refreshes status", async () => {
  let resolve!: (value: { status: "claimed"; endsAt: number }) => void;
  jest.mocked(claimGift).mockReturnValue(new Promise((done) => { resolve = done; }));
  const tree = await mount();
  const endsAt = Date.UTC(2026, 10, 3, 12);
  await act(async () => {
    find(tree, "gift-accept")[0].props.onPress();
    find(tree, "gift-accept")[0].props.onPress();
    resolve({ status: "claimed", endsAt });
  });
  expect(claimGift).toHaveBeenCalledTimes(1);
  expect(claimGift).toHaveBeenCalledWith("order_G1");
  expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Gift added\. Your Plus runs until 3 Nov 2026\.$/), "success");
  for (const key of ["gifts", "premium", "chat-access", "daily-allowance", "send-policy"]) expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: [key] });
});

test("No thanks calls declineGift once and refreshes the list", async () => {
  jest.mocked(declineGift).mockResolvedValue({ status: "declined" });
  const tree = await mount();
  await act(async () => { find(tree, "gift-decline")[0].props.onPress(); find(tree, "gift-decline")[0].props.onPress(); });
  expect(declineGift).toHaveBeenCalledTimes(1);
  expect(declineGift).toHaveBeenCalledWith("order_G1");
  expect(claimGift).not.toHaveBeenCalled();
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["gifts"] });
});

test("a gift that can no longer be accepted shows the server's message and refreshes the list", async () => {
  jest.mocked(claimGift).mockRejectedValue(Object.assign(new Error("This gift expired, so it's been refunded to the sender."), { code: "functions/failed-precondition" }));
  const tree = await mount();
  await act(async () => { await find(tree, "gift-accept")[0].props.onPress(); });
  expect(showToast).toHaveBeenCalledWith("This gift expired, so it's been refunded to the sender.", "error");
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["gifts"] });
  // Free again to retry after a failure.
  jest.mocked(claimGift).mockResolvedValue({ status: "claimed", endsAt: 1 });
  await act(async () => { await find(tree, "gift-accept")[0].props.onPress(); });
  expect(claimGift).toHaveBeenCalledTimes(2);
});

test("once accepted, the cached gift no longer reads pending, so a quick second tap finds no button and calls nothing", async () => {
  jest.mocked(claimGift).mockResolvedValue({ status: "claimed", endsAt: 1 });
  const tree = await mount();
  await act(async () => { await find(tree, "gift-accept")[0].props.onPress(); });
  expect(mockSetData).toHaveBeenCalledWith(["gifts", "her"], expect.any(Function));
  await rerender(tree);
  expect(find(tree, "gift-accept")).toHaveLength(0);
  expect(tree.toJSON()).toBeNull();
  expect(claimGift).toHaveBeenCalledTimes(1);
});

test("once declined, the banner goes away at once, before the refetch", async () => {
  jest.mocked(declineGift).mockResolvedValue({ status: "declined" });
  const tree = await mount();
  await act(async () => { await find(tree, "gift-decline")[0].props.onPress(); });
  await rerender(tree);
  expect(tree.toJSON()).toBeNull();
});

test("a failed answer leaves the cached gift pending so it can be retried", async () => {
  jest.mocked(claimGift).mockRejectedValue(Object.assign(new Error("x"), { code: "functions/unavailable" }));
  const tree = await mount();
  await act(async () => { await find(tree, "gift-accept")[0].props.onPress(); });
  expect(mockSetData).not.toHaveBeenCalled();
  await rerender(tree);
  expect(find(tree, "gift-accept")).toHaveLength(1);
});

test("the banner owns its top spacing, so a screen with no gift is unchanged", async () => {
  expect((await mount(true)).root.findByProps({ testID: "gift-banner" }).props.marginTop).toBe("$4");
  expect((await mount()).root.findByProps({ testID: "gift-banner" }).props.marginTop).toBeUndefined();
  mockGifts = { received: [], sent: [] };
  expect((await mount(true)).toJSON()).toBeNull();
});
