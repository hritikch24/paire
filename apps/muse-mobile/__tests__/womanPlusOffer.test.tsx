import React from "react";
import renderer, { act } from "react-test-renderer";
import { WomanPlusOffer } from "../src/components/WomanPlusOffer";
import { dismissOffer, offerDismissed, resetOfferMemory } from "../src/utils/offerDismissal";

let mockPolicy: { freeSender: boolean } | undefined;
let mockPremium: { active: boolean } | undefined;
const mockNavigate = jest.fn();
const mockUseQuery = jest.fn();
jest.mock("react-native", () => ({ Platform: { OS: "web" }, Pressable: "Pressable" }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => { mockUseQuery(options); return { data: mockPremium }; } }));
jest.mock("../src/components/Icon", () => ({ Icon: () => null }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "her" } }) }));
jest.mock("../src/hooks/useSendPolicy", () => ({ useSendPolicy: () => ({ data: mockPolicy }) }));
jest.mock("../src/services/billingService", () => ({ fetchPremiumStatus: jest.fn() }));

const store = new Map<string, string>();
const installStorage = () => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); }
  };
};
const ofType = (tree: renderer.ReactTestRenderer, name: string) => tree.root.findAll((node) => (node.type as unknown) === name);
const mount = async (matchId = "m1") => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<WomanPlusOffer matchId={matchId} />); });
  return tree;
};
const offer = (tree: renderer.ReactTestRenderer) => tree.root.findAllByProps({ testID: "woman-plus-offer" });

beforeEach(() => { store.clear(); resetOfferMemory(); installStorage(); mockPolicy = { freeSender: true }; mockPremium = { active: false }; });
afterEach(() => { jest.clearAllMocks(); delete (globalThis as { localStorage?: unknown }).localStorage; });

test("a free-sending woman without Plus sees the soft offer, with the agreed wording and no price", async () => {
  const tree = await mount();
  expect(offer(tree)).toHaveLength(1);
  const words = ofType(tree, "Text").map((node) => node.props.children).join(" ");
  expect(words).toContain("See who likes you and be seen first with Paire Plus");
  expect(words).not.toMatch(/₹|\d/);
});

test.each([
  ["Plus already", { freeSender: true }, { active: true }],
  ["a man, or the switch off", { freeSender: false }, { active: false }],
  ["policy still loading", undefined, { active: false }],
  ["premium status still loading", { freeSender: true }, undefined]
])("no offer for %s", async (_name, policy, premium) => {
  mockPolicy = policy;
  mockPremium = premium;
  expect(offer(await mount())).toHaveLength(0);
});

test("the premium status is only fetched once the policy says she sends free", async () => {
  mockPolicy = { freeSender: false };
  await mount();
  expect(mockUseQuery.mock.calls.every(([options]) => options.enabled === false)).toBe(true);
});

test("see Plus opens the existing Premium screen", async () => {
  const tree = await mount();
  act(() => tree.root.findByProps({ testID: "woman-plus-offer-open" }).props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith("Premium");
});

test("dismissing hides it, remembers it per match, and another match still gets its own offer", async () => {
  const tree = await mount("m1");
  act(() => tree.root.findByProps({ testID: "woman-plus-offer-dismiss" }).props.onPress());
  expect(offer(tree)).toHaveLength(0);
  expect(offerDismissed("m1")).toBe(true);
  expect(offerDismissed("m2")).toBe(false);
  expect(offer(await mount("m1"))).toHaveLength(0);
  expect(offer(await mount("m2"))).toHaveLength(1);
});

test("dismissal is remembered across reloads through localStorage", async () => {
  dismissOffer("m1");
  resetOfferMemory();
  expect(offerDismissed("m1")).toBe(true);
});

test("without usable storage the offer still shows and can still be dismissed for the session", async () => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); }
  };
  const tree = await mount();
  expect(offer(tree)).toHaveLength(1);
  act(() => tree.root.findByProps({ testID: "woman-plus-offer-dismiss" }).props.onPress());
  expect(offer(tree)).toHaveLength(0);
  delete (globalThis as { localStorage?: unknown }).localStorage;
  expect(() => dismissOffer("m9")).not.toThrow();
  expect(() => offerDismissed("m9")).not.toThrow();
});
