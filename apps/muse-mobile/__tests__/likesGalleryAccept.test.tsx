import React from "react";
import renderer, { act } from "react-test-renderer";
import { LikesGalleryScreen } from "../src/screens/LikesGalleryScreen";
import type { DiscoverProfile } from "../src/types/models";

const him = { uid: "him", displayName: "Arjun Rao", age: 29, photoUrls: [], compatibility: 80, note: "Loved your trek photo" } as unknown as DiscoverProfile;
let mockLikes: Record<string, unknown>;
const mockAccept = jest.fn();
const mockNotNow = jest.fn();
let mockPending: string | null = null;
jest.mock("react-native", () => ({ Pressable: "Pressable", ScrollView: "ScrollView", StyleSheet: { create: (s: unknown) => s, absoluteFill: {} }, Platform: { OS: "web" } }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: {} }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock("../src/utils/useAppDimensions", () => ({ useAppDimensions: () => ({ width: 390 }) }));
jest.mock("../src/theme/useThemeColors", () => ({ useThemeColors: () => ({ gradient: ["#fff", "#000"], glow: "#fff" }) }));
jest.mock("../src/components/Icon", () => ({ Icon: () => null }));
jest.mock("../src/components/IconButton", () => ({ IconButton: "IconButton" }));
jest.mock("../src/components/MuseButton", () => ({ PrimaryButton: "PrimaryButton", SecondaryButton: "SecondaryButton", GhostButton: "GhostButton" }));
jest.mock("../src/components/LockedLikes", () => ({ LockedLikes: "LockedLikes" }));
jest.mock("../src/components/States", () => ({ EmptyState: "EmptyState", LoadingView: "LoadingView" }));
jest.mock("../src/components/Toast", () => ({ showToast: jest.fn() }));
jest.mock("../src/hooks/useLikesYou", () => ({ LIKES_YOU_KEY: ["likes-you"], useLikesYou: () => ({ data: mockLikes, isLoading: false, isError: false, refetch: jest.fn() }) }));
jest.mock("../src/hooks/useAcceptActions", () => ({ useAcceptActions: () => ({ accept: mockAccept, notNow: mockNotNow, pendingUid: mockPending }) }));
jest.mock("../src/hooks/useSendPolicy", () => ({ useSendPolicy: () => ({ data: undefined }) }));
jest.mock("../src/services/discoveryService", () => ({ sendSwipe: jest.fn() }));
jest.mock("../src/services/likeLimitOffer", () => ({ offerPlusForLikeLimit: jest.fn() }));
jest.mock("../src/services/notificationService", () => ({ suppressMatchAlert: jest.fn() }));
jest.mock("../src/services/queryClient", () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock("../src/services/testServer", () => ({ resolveServerUrl: (url: string) => url }));
jest.mock("../src/utils/insights", () => ({ reasonLines: () => [] }));

const ofType = (tree: renderer.ReactTestRenderer, name: string) => tree.root.findAll((node) => (node.type as unknown) === name);
const mount = () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<LikesGalleryScreen />); });
  return tree;
};
const ids = (tree: renderer.ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID });
beforeEach(() => { mockPending = null; });
afterEach(() => jest.clearAllMocks());

test("an acceptable list shows Accept and Not now on each card, and no like-back heart or lock", () => {
  mockLikes = { profiles: [him], count: 1, locked: false, hasMore: false, expiresAt: null, acceptable: true };
  const tree = mount();
  act(() => ids(tree, "likes-gallery-accept-him")[0].props.onPress());
  act(() => ids(tree, "likes-gallery-notnow-him")[0].props.onPress());
  expect(mockAccept).toHaveBeenCalledWith(him);
  expect(mockNotNow).toHaveBeenCalledWith(him);
  expect(ids(tree, "likes-gallery-like-him")).toHaveLength(0);
  expect(ofType(tree, "LockedLikes")).toHaveLength(0);
});

test("buttons are disabled while an answer is pending", () => {
  mockLikes = { profiles: [him], count: 1, locked: false, hasMore: false, expiresAt: null, acceptable: true };
  mockPending = "him";
  const tree = mount();
  expect(ids(tree, "likes-gallery-accept-him")[0].props.disabled).toBe(true);
  expect(ids(tree, "likes-gallery-notnow-him")[0].props.disabled).toBe(true);
});

test("Plus member who is not accepting (acceptable false): the existing like-back card, no Accept", () => {
  mockLikes = { profiles: [him], count: 1, locked: false, hasMore: false, expiresAt: 1, acceptable: false };
  const tree = mount();
  expect(ids(tree, "likes-gallery-like-him").length).toBeGreaterThan(0);
  expect(ids(tree, "likes-gallery-accept-him")).toHaveLength(0);
});

test("a free member with acceptable false still sees the existing locked view", () => {
  mockLikes = { profiles: [], count: 3, locked: true, hasMore: false, expiresAt: null, acceptable: false };
  const tree = mount();
  expect(ofType(tree, "LockedLikes")).toHaveLength(1);
});
