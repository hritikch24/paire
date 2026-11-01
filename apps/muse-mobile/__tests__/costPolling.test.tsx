import React from "react";
import renderer, { act } from "react-test-renderer";
import { useWebScreenActive } from "../src/hooks/useWebScreenActive";
import { useLaunchOffer } from "../src/hooks/useLaunchOffer";
import { useLikesYou } from "../src/hooks/useLikesYou";

let mockFocused = true;
let mockPlatform = "web";
let mockQuote: { personalized?: { expiresAt: number } } | undefined;
const mockRefetch = jest.fn();
const mockSetQueryData = jest.fn();
const mockOptions = new Map<string, { enabled: boolean; refetchInterval: unknown }>();
jest.mock("react-native", () => ({ Platform: { get OS() { return mockPlatform; } } }));
jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => mockFocused,
  useFocusEffect: (effect: () => void) => { require("react").useEffect(effect, [effect]); }
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[]; enabled: boolean; refetchInterval: unknown }) => {
    mockOptions.set(options.queryKey[0], options);
    return { data: options.queryKey[0] === "launch-offer" ? mockQuote : undefined, refetch: mockRefetch };
  },
  useQueryClient: () => ({ setQueryData: mockSetQueryData })
}));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "fixture" } }) }));
jest.mock("../src/services/firebase", () => ({ callFunction: jest.fn() }));
jest.mock("../src/services/discoveryService", () => ({ fetchLikesYou: jest.fn() }));

let visible = true;
let onVisibility: (() => void) | undefined;
let tree: renderer.ReactTestRenderer | undefined;
let active = false;
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true; mockPlatform = "web"; mockQuote = undefined; visible = true;
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    get visibilityState() { return visible ? "visible" : "hidden"; },
    addEventListener: (_event: string, callback: () => void) => { onVisibility = callback; },
    removeEventListener: () => { onVisibility = undefined; }
  } });
});
afterEach(() => {
  act(() => tree?.unmount()); tree = undefined;
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else Reflect.deleteProperty(globalThis, "document");
  jest.useRealTimers(); jest.clearAllMocks(); mockOptions.clear();
});
function Activity() { active = useWebScreenActive(); return null; }
function Offer() { useLaunchOffer(); return null; }
function Likes() { useLikesYou(true); return null; }

test("browser polling resumes on visibility/focus and native activity behavior is preserved", () => {
  act(() => { tree = renderer.create(<Activity />); }); expect(active).toBe(true);
  act(() => { visible = false; onVisibility?.(); }); expect(active).toBe(false);
  act(() => { visible = true; onVisibility?.(); }); expect(active).toBe(true);
  act(() => { mockFocused = false; tree!.update(<Activity />); }); expect(active).toBe(false);
  act(() => { mockPlatform = "ios"; tree!.update(<Activity />); }); expect(active).toBe(true);
});

test.each([Offer, Likes])("mounted background screens disable their Firebase queries", Probe => {
  mockFocused = false;
  act(() => { tree = renderer.create(<Probe />); });
  expect([...mockOptions.values()].every(options => !options.enabled)).toBe(true);
  act(() => { mockFocused = true; tree!.update(<Probe />); });
  expect([...mockOptions.values()].every(options => options.enabled)).toBe(true);
  act(() => { visible = false; onVisibility?.(); });
  expect([...mockOptions.values()].every(options => !options.enabled)).toBe(true);
  act(() => { jest.advanceTimersByTime(600_000); });
  expect(mockRefetch).not.toHaveBeenCalled();
});

test("a fixed offer expires on time despite less frequent polling; a hidden screen defers the refresh", () => {
  mockQuote = { personalized: { expiresAt: Date.now() + 10_000 } };
  act(() => { tree = renderer.create(<Offer />); });
  act(() => { jest.advanceTimersByTime(9_000); }); expect(mockRefetch).not.toHaveBeenCalled();
  act(() => { visible = false; onVisibility?.(); jest.advanceTimersByTime(2_000); });
  expect(mockRefetch).not.toHaveBeenCalled();
  act(() => { visible = true; onVisibility?.(); });
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("visible offers refresh at the fixed expiry without waiting five minutes", () => {
  mockQuote = { personalized: { expiresAt: Date.now() + 10_000 } };
  act(() => { tree = renderer.create(<Offer />); });
  act(() => { jest.advanceTimersByTime(10_101); });
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
