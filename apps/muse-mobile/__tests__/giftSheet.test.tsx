import React from "react";
import renderer, { act } from "react-test-renderer";
import { GiftSheet } from "../src/components/GiftSheet";
import { WEB_PREMIUM_PLANS, webPlan } from "../src/config/premium";
import { createGift } from "../src/services/giftService";

let mockGifts: unknown;
jest.mock("react-native", () => ({ Platform: { OS: "web" }, Modal: "Modal", Pressable: "Pressable", ScrollView: "ScrollView" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("../src/components/MuseButton", () => ({ GhostButton: "GhostButton" }));
jest.mock("../src/hooks/useGifts", () => ({ useGifts: () => ({ data: mockGifts }) }));
jest.mock("../src/services/giftService", () => ({ createGift: jest.fn() }));

const plans = WEB_PREMIUM_PLANS.slice(0, 3);
const mount = async (onClose = jest.fn()) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<GiftSheet visible matchId="her_him" name="Arjun Rao" onClose={onClose} />); });
  return tree;
};
const words = (tree: renderer.ReactTestRenderer) => tree.root.findAll((node) => (node.type as unknown) === "Text").map((node) => [node.props.children].flat().join("")).join(" | ");
const planButtons = (tree: renderer.ReactTestRenderer) => tree.root.findAll((node) => (node.type as unknown) === "Pressable" && String(node.props.testID ?? "").startsWith("gift-plan-"));
beforeEach(() => { mockGifts = undefined; });
afterEach(() => jest.clearAllMocks());

test("it offers exactly Day, Week and Month, labelled and priced from the existing plan config", async () => {
  const tree = await mount();
  const buttons = planButtons(tree);
  expect(buttons.map((button) => button.props.testID)).toEqual(["gift-plan-day", "gift-plan-week", "gift-plan-month"]);
  plans.forEach((plan, index) => {
    const label = buttons[index].props.accessibilityLabel as string;
    expect(label).toContain(webPlan(plan).label);
    expect(label).toContain(`₹${plan.priceInr}`);
    expect(words(tree)).toContain(`₹${plan.priceInr}`);
  });
  expect(words(tree)).not.toMatch(/6 months|Lifetime/);
  expect(words(tree)).toContain("They'll get a notification and can accept it; if they don't, you're refunded after 7 days.");
});

test("choosing a size starts the gift for this match only, then waits while the page leaves", async () => {
  jest.mocked(createGift).mockReturnValue(new Promise(() => undefined));
  const tree = await mount();
  await act(async () => { planButtons(tree)[1].props.onPress(); planButtons(tree)[1].props.onPress(); });
  expect(createGift).toHaveBeenCalledTimes(1);
  expect(createGift).toHaveBeenCalledWith("her_him", "week");
});

test.each([
  ["already-lifetime", "They already have Lifetime Plus, so a gift isn't needed."],
  ["limit", "You've sent 3 gifts today. Try again tomorrow."],
  ["unavailable", "A gift can't be sent to this person right now."]
])("a '%s' refusal shows the server's plain message and the page stays", async (_reason, message) => {
  jest.mocked(createGift).mockRejectedValue(Object.assign(new Error(message), { code: "functions/failed-precondition", details: { reason: _reason } }));
  const onClose = jest.fn();
  const tree = await mount(onClose);
  await act(async () => { await planButtons(tree)[0].props.onPress(); });
  expect(words(tree)).toContain(message);
  expect(tree.root.findAllByProps({ testID: "gift-error" })[0].props.accessibilityRole).toBe("alert");
  expect(onClose).not.toHaveBeenCalled();
  // They can try another size straight away.
  jest.mocked(createGift).mockReturnValue(new Promise(() => undefined));
  await act(async () => { planButtons(tree)[2].props.onPress(); });
  expect(createGift).toHaveBeenLastCalledWith("her_him", "month");
});

test("Your gifts lists what was sent and received, in plain words", async () => {
  mockGifts = {
    sent: [{ id: "o1", plan: "week", status: "pending", counterpartName: "Arjun", createdAt: 1, expiresAt: 2 }, { id: "o2", plan: "day", status: "declined", counterpartName: "Kabir", createdAt: 1, expiresAt: 2 }],
    received: [{ id: "o3", plan: "month", status: "claimed", counterpartName: "Meera", createdAt: 1, expiresAt: 2, endsAt: 3 }]
  };
  const text = words(await mount());
  expect(text).toContain("Your gifts");
  expect(text).toContain("To Arjun");
  expect(text).toContain("Waiting for a reply");
  expect(text).toContain("Declined, refunded to you");
  expect(text).toContain("From Meera");
  expect(text).toContain("Added to your Plus");
});

test("with no gifts yet there is no empty list to read", async () => {
  mockGifts = { sent: [], received: [] };
  expect(words(await mount())).not.toContain("Your gifts");
});

test("Close stays usable while a payment page is opening, and Back from the browser's page cache frees the sheet again", async () => {
  const listeners = new Map<string, (event: { persisted: boolean }) => void>();
  (globalThis as { window?: unknown }).window = { addEventListener: (name: string, fn: (event: { persisted: boolean }) => void) => { listeners.set(name, fn); }, removeEventListener: (name: string) => { listeners.delete(name); } };
  try {
    jest.mocked(createGift).mockReturnValue(new Promise(() => undefined));
    const onClose = jest.fn();
    const tree = await mount(onClose);
    await act(async () => { planButtons(tree)[0].props.onPress(); });
    expect(planButtons(tree)[1].props.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: "gift-close" }).props.disabled).toBeUndefined();
    // A normal page show changes nothing; one restored from the cache resets the sheet.
    await act(async () => { listeners.get("pageshow")!({ persisted: false }); });
    expect(planButtons(tree)[1].props.disabled).toBe(true);
    await act(async () => { listeners.get("pageshow")!({ persisted: true }); });
    expect(planButtons(tree)[1].props.disabled).toBe(false);
    await act(async () => { planButtons(tree)[1].props.onPress(); });
    expect(createGift).toHaveBeenLastCalledWith("her_him", "week");
    await act(async () => { tree.unmount(); });
    expect(listeners.has("pageshow")).toBe(false);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});
