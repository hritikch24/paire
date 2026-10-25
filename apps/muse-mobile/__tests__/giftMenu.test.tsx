import React from "react";
import renderer, { act } from "react-test-renderer";
import { Platform } from "react-native";
import { ChatScreen } from "../src/screens/ChatScreen";
import type { ChatAccess } from "../src/services/chatAccessService";

const NOW = Date.now();
let mockAccess: ChatAccess | undefined;
let mockPolicy: { freeSender: boolean; giftSales?: boolean } | undefined;
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
jest.mock("../src/components/GiftSheet", () => ({ GiftSheet: "GiftSheet" }));
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

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<ChatScreen />); });
  return tree;
};
const menuLabels = (tree: renderer.ReactTestRenderer) => (tree.root.findAll((node) => (node.type as unknown) === "ActionSheet")[0].props.options as Array<{ label: string }>).map((option) => option.label);
const giftSheet = (tree: renderer.ReactTestRenderer) => tree.root.findAll((node) => (node.type as unknown) === "GiftSheet");
afterEach(() => { mockAccess = undefined; mockPolicy = undefined; });

test.each([["a woman", true], ["a man", false]])("with gifts on, the chat menu of %s has Gift premium, which opens the gift sheet for this match", async (_who, freeSender) => {
  mockPolicy = { freeSender, giftSales: true };
  const tree = await mount();
  expect(menuLabels(tree)).toContain("Gift premium");
  expect(giftSheet(tree)).toHaveLength(0);
  const option = (tree.root.findAll((node) => (node.type as unknown) === "ActionSheet")[0].props.options as Array<{ label: string; onPress: () => void }>).find((candidate) => candidate.label === "Gift premium")!;
  await act(async () => { option.onPress(); });
  expect(giftSheet(tree)[0].props).toMatchObject({ visible: true, matchId: "her_him", name: "Arjun" });
});

test.each([["switch off", { freeSender: false, giftSales: false }], ["policy unknown", undefined], ["policy without the field", { freeSender: true }]])("no Gift premium in the chat menu when %s", async (_name, policy) => {
  mockPolicy = policy;
  expect(menuLabels(await mount())).not.toContain("Gift premium");
});

test.each([["android"], ["ios"]])("on %s there is no Gift premium even when sales are on (gifts are web only)", async (os) => {
  (Platform as { OS: string }).OS = os;
  try {
    mockPolicy = { freeSender: false, giftSales: true };
    const tree = await mount();
    expect(menuLabels(tree)).not.toContain("Gift premium");
    expect(giftSheet(tree)).toHaveLength(0);
  } finally {
    (Platform as { OS: string }).OS = "web";
  }
});
