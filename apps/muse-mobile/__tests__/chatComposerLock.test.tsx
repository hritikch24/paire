import React from "react";
import renderer, { act } from "react-test-renderer";
import { ChatScreen } from "../src/screens/ChatScreen";
import type { ChatAccess } from "../src/services/chatAccessService";

const NOW = Date.now();
const lockedAccess = { enforced: true, unlimited: false, premiumUntil: null, legacyCutoff: null, legacyGraceUntil: null, enforceFrom: NOW - 1000, unlock: { priceInr: 49 } } as unknown as ChatAccess;
let mockAccess: ChatAccess | undefined;
let mockPolicy: { freeSender: boolean } | undefined;
const mockMatch = { id: "her_him", active: true, kind: "pair", participants: ["her", "him"], profiles: { her: { displayName: "Her" }, him: { displayName: "Arjun" } }, unread: {}, lastReadAt: {}, sparks: {}, superLikedBy: [], createdAt: NOW - 86_400_000 * 30, firstMoveBy: null };

jest.mock("react-native", () => ({ Platform: { OS: "web" }, FlatList: "FlatList", Pressable: "Pressable" }));
jest.mock("react-native-keyboard-controller", () => ({ KeyboardAvoidingView: "KeyboardAvoidingView", useKeyboardState: () => false }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), isFocused: () => true }),
  useRoute: () => ({ params: { matchId: "her_him", otherUid: "him", name: "Arjun" } }),
  useFocusEffect: () => undefined
}));
jest.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
jest.mock("../src/config/features", () => ({ features: { calls: false, notifications: false } }));
jest.mock("../src/services/dialog", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("../src/components/ActionSheet", () => ({ ActionSheet: "ActionSheet" }));
jest.mock("../src/components/AiSuggestions", () => ({ AiSuggestions: "AiSuggestions" }));
jest.mock("../src/components/Avatar", () => ({ AvatarPair: "AvatarPair" }));
jest.mock("../src/components/ChatAccessCard", () => ({ ChatAccessCard: "ChatAccessCard" }));
jest.mock("../src/components/Icon", () => ({ Icon: "Icon" }));
jest.mock("../src/components/IconButton", () => ({ IconButton: "IconButton" }));
jest.mock("../src/components/MuseInput", () => ({ MuseInput: "MuseInput" }));
jest.mock("../src/components/MuseButton", () => ({ SecondaryButton: "SecondaryButton" }));
jest.mock("../src/components/States", () => ({ LoadingView: "LoadingView" }));
jest.mock("../src/components/Toast", () => ({ showToast: jest.fn() }));
jest.mock("../src/hooks/useChatAccess", () => ({ useChatAccess: () => ({ data: mockAccess, refetch: jest.fn() }) }));
jest.mock("../src/hooks/useSendPolicy", () => ({ useSendPolicy: () => ({ data: mockPolicy }) }));
jest.mock("../src/hooks/useMemberProfile", () => ({ useMemberProfile: () => ({ data: undefined }) }));
jest.mock("../src/hooks/usePresence", () => ({ usePresence: () => ({ statusOf: () => undefined }) }));
jest.mock("../src/services/aiService", () => ({ fetchOpeners: jest.fn() }));
jest.mock("../src/services/chatService", () => ({ loadOlderMessages: jest.fn(), MAX_MESSAGE_LENGTH: 1000, sendChatMessage: jest.fn(), subscribeToLatestMessages: () => () => undefined, subscribeToSafetyWarnings: () => () => undefined }));
jest.mock("../src/services/duoService", () => ({ leaveChat: jest.fn() }));
jest.mock("../src/services/matchService", () => ({
  chatTitle: () => "Arjun", markMatchRead: jest.fn(), otherParticipant: () => "him", otherParticipants: () => ["him"], otherSide: () => ["him"], partnerIn: () => undefined,
  subscribeToMatch: (_id: string, onMatch: (match: unknown) => void) => { onMatch(mockMatch); return () => undefined; },
  unmatch: jest.fn(), waitingForFirstMove: () => null
}));
jest.mock("../src/services/notificationService", () => ({ setActiveChat: jest.fn() }));
jest.mock("../src/services/safetyService", () => ({ blockUser: jest.fn() }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "her" } }) }));

const ofType = (tree: renderer.ReactTestRenderer, name: string) => tree.root.findAll((node) => (node.type as unknown) === name);
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<ChatScreen />); });
  return tree;
};
const send = (tree: renderer.ReactTestRenderer) => tree.root.findByProps({ testID: "chat-send" });
afterEach(() => { mockAccess = undefined; mockPolicy = undefined; });

test("a man without a pass: the composer is locked and the existing pay card is shown", async () => {
  mockAccess = lockedAccess;
  mockPolicy = { freeSender: false };
  const tree = await mount();
  expect(ofType(tree, "ChatAccessCard")).toHaveLength(1);
  expect(send(tree).props.disabled).toBe(true);
});

test("a woman who sends free: the composer is open, with no pay card and no 'sending will need Plus' notice", async () => {
  mockAccess = lockedAccess;
  mockPolicy = { freeSender: true };
  const tree = await mount();
  expect(ofType(tree, "ChatAccessCard")).toHaveLength(0);
  expect(tree.root.findAllByProps({ testID: "chat-access-notice" })).toHaveLength(0);
  expect(tree.root.findByProps({ testID: "chat-input" })).toBeTruthy();
});

test("while the policy is unknown the paid-chat result stands (still locked)", async () => {
  mockAccess = lockedAccess;
  mockPolicy = undefined;
  expect(ofType(await mount(), "ChatAccessCard")).toHaveLength(1);
});

test("a man (or a switch that is off) whose pass covers him is not locked, as before", async () => {
  mockAccess = { ...lockedAccess, premiumUntil: NOW + 86_400_000 };
  mockPolicy = { freeSender: false };
  expect(ofType(await mount(), "ChatAccessCard")).toHaveLength(0);
});
