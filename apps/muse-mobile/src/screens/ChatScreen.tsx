import { Alert } from "../services/dialog";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { ActionSheet, ActionSheetOption } from "../components/ActionSheet";
import { AiSuggestions } from "../components/AiSuggestions";
import { AvatarPair } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { MuseInput } from "../components/MuseInput";
import { LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { features } from "../config/features";
import { getDailyPrompt } from "../data/musePrompts";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { useMemberProfile } from "../hooks/useMemberProfile";
import { fetchOpeners } from "../services/aiService";
import {
  loadOlderMessages,
  MAX_MESSAGE_LENGTH,
  sendChatMessage,
  subscribeToLatestMessages,
  subscribeToSafetyWarnings
} from "../services/chatService";
import { friendlyError } from "../services/errors";
import { leaveChat } from "../services/duoService";
import {
  chatTitle,
  markMatchRead,
  otherParticipant,
  otherParticipants,
  otherSide,
  partnerIn,
  subscribeToMatch,
  unmatch,
  waitingForFirstMove
} from "../services/matchService";
import { setActiveChat } from "../services/notificationService";
import { blockUser } from "../services/safetyService";
import { useAuthStore } from "../store/authStore";
import { ChatMessage, Match, MessageSafety } from "../types/models";
import { REPORT_REASON_FOR, safetyNotice } from "../utils/chatSafety";
import { formatClockTime, formatDayLabel, isSameDay } from "../utils/time";
import type { AppStackParamList } from "../navigation/types";

const GROUP_GAP_MS = 5 * 60 * 1000;

/** Ready-made goodbyes: closure is kinder than silence, and costs one tap. */
export const KIND_GOODBYES = [
  "I've enjoyed chatting, but I don't think we're a match. Wishing you the very best!",
  "I'd rather be honest than go quiet: I'm not feeling a connection. Take care!",
  "I'm stepping back from dating for a while. It was lovely talking to you. All the best!"
];

/** The note sent with a like, shown where the conversation begins. */
function SparkBubble({ label, text, mine }: { label: string; text: string; mine?: boolean }) {
  return (
    <YStack
      alignSelf="stretch"
      gap="$1"
      padding="$3"
      borderRadius="$5"
      borderWidth={mine ? 1 : 2}
      borderColor={mine ? "$border" : "$primary"}
      backgroundColor={mine ? "$backgroundSoft" : "$primarySoft"}
    >
      <XStack gap="$2" alignItems="center">
        <Icon name="chatbubble-ellipses" size={14} color={mine ? "textMuted" : "primary"} />
        <Text fontSize="$1" fontWeight="700" color={mine ? "$textMuted" : "$primary"} textTransform="uppercase">
          {label}
        </Text>
      </XStack>
      <Text fontSize="$4" lineHeight={22}>
        “{text}”
      </Text>
    </YStack>
  );
}

export function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Chat">>();
  const { matchId } = route.params;
  const insets = useSafeAreaInsets();
  // The keyboard covers the navigation bar, so its inset only applies while it's hidden.
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const composerBottom = keyboardVisible || !insets.bottom ? 10 : insets.bottom + 8;
  const uid = useAuthStore((state) => state.user?.uid) ?? "";

  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [latest, setLatest] = useState<ChatMessage[]>([]);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [oldestCursor, setOldestCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const [warnings, setWarnings] = useState<ReadonlyMap<string, MessageSafety>>(() => new Map());
  const cursorFromLatest = useRef(true);

  const otherUid = (match ? otherParticipant(match, uid) : route.params.otherUid) ?? "";
  const snippet = match?.profiles[otherUid];
  // Duo chats: two pairs of friends, up to four people.
  const group = match?.kind === "duo";
  const name = match && group ? chatTitle(match, uid) : (snippet?.displayName ?? route.params.name ?? "Your match");
  const photoUrl = snippet?.photoUrl ?? route.params.photoUrl ?? null;
  const theirPair = match && group ? otherSide(match, uid) : [otherUid];
  const faces = theirPair.map((member) => ({
    uri: match?.profiles[member]?.photoUrl ?? (member === otherUid ? photoUrl : null),
    name: match?.profiles[member]?.displayName ?? name
  }));
  const partnerName = match && group ? match.profiles[partnerIn(match, uid) ?? ""]?.displayName : undefined;
  const nameOf = (member: string) => match?.profiles[member]?.displayName?.split(" ")[0] ?? "Someone";
  const active = Boolean(match?.active);
  const { data: otherProfile } = useMemberProfile(active && !group ? otherUid : undefined);
  // "I'll message first": who must open, and the notes sent with each like.
  const waitingFor = match ? waitingForFirstMove(match, uid) : null;
  const iOpen = Boolean(match && !group && !match.lastMessage && match.firstMoveBy === uid);
  const theirSpark = !group ? match?.sparks?.[otherUid] : undefined;
  const mySpark = !group ? match?.sparks?.[uid] : undefined;

  useEffect(
    () =>
      subscribeToMatch(
        matchId,
        (next) => setMatch(next),
        () => setMatch(null)
      ),
    [matchId]
  );

  useEffect(() => {
    if (!active) return;
    return subscribeToLatestMessages(
      matchId,
      (page) => {
        setLatest(page.messages);
        setMessagesLoaded(true);
        if (cursorFromLatest.current) {
          setOldestCursor(page.oldest);
          setHasMore(page.hasMore);
        }
      },
      () => setMessagesLoaded(true)
    );
  }, [active, matchId]);

  useEffect(() => (uid ? subscribeToSafetyWarnings(matchId, uid, setWarnings) : undefined), [matchId, uid]);

  // Clear unread + update "Seen" while the chat is open and new messages arrive.
  const myUnread = match?.unread[uid] ?? 0;
  useFocusEffect(
    useCallback(() => {
      setActiveChat(matchId);
      return () => setActiveChat(null);
    }, [matchId])
  );
  useEffect(() => {
    if (active && myUnread > 0 && navigation.isFocused()) {
      void markMatchRead(matchId, uid).catch(() => undefined);
    }
  }, [active, matchId, myUnread, navigation, uid]);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...latest, ...older]
      .filter((message) => (seen.has(message.id) ? false : (seen.add(message.id), true)))
      .map((message) => (warnings.has(message.id) ? { ...message, safety: warnings.get(message.id) } : message));
  }, [latest, older, warnings]);

  const loadMore = async () => {
    if (!hasMore || loadingOlder || !oldestCursor) return;
    setLoadingOlder(true);
    try {
      const page = await loadOlderMessages(matchId, oldestCursor);
      cursorFromLatest.current = false;
      setOlder((current) => [...current, ...page.messages]);
      setOldestCursor(page.oldest);
      setHasMore(page.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async (body = text) => {
    const trimmed = body.trim();
    const recipients = match ? otherParticipants(match, uid) : [otherUid];
    if (!trimmed || !active || sending || !recipients.length || !recipients[0]) return;
    setSending(true);
    setText("");
    try {
      await sendChatMessage(matchId, uid, recipients, trimmed);
    } catch (error) {
      setText(trimmed);
      showToast(friendlyError(error, "Message not sent. Please try again."), "error");
    } finally {
      setSending(false);
    }
  };

  const confirmUnmatch = () =>
    Alert.alert(`Unmatch ${name}?`, "You'll both lose this conversation and won't see each other again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unmatch",
        style: "destructive",
        onPress: async () => {
          try {
            await unmatch(matchId, uid);
            showToast(`You unmatched ${name}.`);
            navigation.goBack();
          } catch (error) {
            showToast(friendlyError(error, "Couldn't unmatch. Please try again."), "error");
          }
        }
      }
    ]);

  /** A polite goodbye instead of ghosting: sends the message, then ends the match. */
  const closeKindly = async (goodbye: string) => {
    try {
      if (!waitingFor) await sendChatMessage(matchId, uid, [otherUid], goodbye);
      await unmatch(matchId, uid);
      showToast(`You closed things kindly with ${name}.`);
      navigation.goBack();
    } catch (error) {
      showToast(friendlyError(error, "Couldn't close this chat. Please try again."), "error");
    }
  };

  const closingOptions: ActionSheetOption[] = KIND_GOODBYES.map((goodbye, index) => ({
    label: goodbye,
    testID: `chat-close-kindly-${index}`,
    onPress: () => void closeKindly(goodbye)
  }));

  const confirmBlock = () =>
    Alert.alert(`Block ${name}?`, "They won't be able to see you or message you, and this match will end.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await blockUser(otherUid);
            showToast(`${name} is blocked.`);
            navigation.goBack();
          } catch (error) {
            showToast(friendlyError(error, "Couldn't block. Please try again."), "error");
          }
        }
      }
    ]);

  const confirmLeave = () =>
    Alert.alert(
      "Leave this chat?",
      match && !partnerIn(match, uid)
        ? "Your friend has already left, so this ends the chat for everyone."
        : "You won't see new messages. The chat carries on for the others.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveChat(matchId);
              showToast("You left the chat.");
              navigation.goBack();
            } catch (error) {
              showToast(friendlyError(error, "Couldn't leave the chat. Please try again."), "error");
            }
          }
        }
      ]
    );

  const groupMenu: ActionSheetOption[] = [
    {
      label: "People in this chat",
      icon: "people-outline",
      onPress: () => navigation.navigate("ChatMembers", { matchId })
    },
    {
      label: "Report or block someone",
      icon: "flag-outline",
      destructive: true,
      onPress: () => navigation.navigate("ChatMembers", { matchId })
    },
    ...(active
      ? [
          {
            label: "Leave chat",
            icon: "exit-outline" as const,
            destructive: true,
            onPress: confirmLeave
          }
        ]
      : [])
  ];

  const pairMenu: ActionSheetOption[] = [
    {
      label: "View profile",
      icon: "person-circle-outline",
      onPress: () => navigation.navigate("ProfileView", { source: "match", uid: otherUid, matchId })
    },
    ...(features.calls && active
      ? [
          {
            label: "Video call",
            icon: "videocam-outline" as const,
            onPress: () => navigation.navigate("Call", { matchId, video: true })
          }
        ]
      : []),
    ...(active
      ? [
          {
            label: "Close kindly",
            icon: "hand-right-outline" as const,
            testID: "chat-close-kindly",
            onPress: () => (waitingFor ? confirmUnmatch() : setCloseOpen(true))
          },
          { label: "Unmatch", icon: "heart-dislike-outline" as const, onPress: confirmUnmatch }
        ]
      : []),
    {
      label: `Report ${name}`,
      icon: "flag-outline",
      destructive: true,
      onPress: () => navigation.navigate("Report", { targetUid: otherUid, name, matchId })
    },
    { label: `Block ${name}`, icon: "ban-outline", destructive: true, onPress: confirmBlock }
  ];

  const menuOptions = group ? groupMenu : pairMenu;

  // Written for this match by Paire AI; the local ones show while it loads or if it can't.
  const openers = useQuery({
    queryKey: ["openers", matchId],
    queryFn: () => fetchOpeners(matchId),
    enabled: active && messagesLoaded && messages.length === 0 && !waitingFor,
    staleTime: Infinity,
    retry: false
  });

  const icebreakers = useMemo(() => {
    const fromAnswers = (otherProfile?.quickAnswers ?? [])
      .map((entry) => {
        const question = rapidQuestionMap.get(entry.questionId);
        return question ? `${question.question.replace(/\?$/, "")}: ${entry.answer}? Tell me more!` : null;
      })
      .filter((item): item is string => Boolean(item))
      .slice(0, 2);
    return [...fromAnswers, getDailyPrompt()];
  }, [otherProfile?.quickAnswers]);

  const otherReadAt = match?.lastReadAt[otherUid] ?? 0;
  const newestMine = messages.find((message) => message.senderId === uid);
  const seenBy = (message: ChatMessage) =>
    match ? otherParticipants(match, uid).filter((member) => (match.lastReadAt[member] ?? 0) >= message.createdAt) : [];

  const reportMessage = (item: ChatMessage) =>
    navigation.navigate("Report", {
      targetUid: group ? item.senderId : otherUid,
      name: group ? (match?.profiles[item.senderId]?.displayName ?? name) : name,
      matchId,
      messageId: item.id,
      reason: item.safety ? REPORT_REASON_FOR[item.safety.category] : undefined
    });

  const renderSafety = (item: ChatMessage) => {
    const notice = item.safety ? safetyNotice(item.safety) : null;
    if (!notice) return null;
    if (notice.subtle) {
      return (
        <XStack
          gap="$1"
          marginTop={4}
          maxWidth="85%"
          alignItems="flex-start"
          accessible
          accessibilityLabel={`Paire AI tip: ${notice.title} ${notice.body}`}
        >
          <Icon name="shield-checkmark-outline" size={13} color="textMuted" />
          <Text fontSize="$1" color="$textMuted" flex={1}>
            {notice.title} {notice.body}
          </Text>
        </XStack>
      );
    }
    return (
      <YStack
        testID="chat-safety-notice"
        accessibilityRole="alert"
        marginTop="$2"
        maxWidth="88%"
        padding="$3"
        gap="$1"
        borderRadius="$3"
        backgroundColor="$warningSoft"
        borderWidth={1}
        borderColor="$warning"
      >
        <XStack gap="$2" alignItems="center">
          <Icon name={notice.icon} size={16} color="warning" />
          <Text fontSize="$2" fontWeight="700" flex={1}>
            {notice.title}
          </Text>
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          {notice.body}
        </Text>
        <XStack gap="$4" marginTop="$1" alignItems="center">
          <Text fontSize="$1" color="$textMuted" flex={1}>
            Flagged by Paire AI
          </Text>
          {notice.suggestReport && active ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Report ${group ? nameOf(item.senderId) : name} for this message`}
              hitSlop={8}
              onPress={() => reportMessage(item)}
            >
              <Text fontSize="$2" fontWeight="700" color="$primary">
                Report
              </Text>
            </Pressable>
          ) : null}
        </XStack>
      </YStack>
    );
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.senderId === uid;
    const concealed = !mine && item.safety?.hidden === true && !revealed.has(item.id);
    const previous = messages[index + 1];
    const next = messages[index - 1];
    const startsDay = !previous || !isSameDay(previous.createdAt, item.createdAt);
    const endsGroup = !next || next.senderId !== item.senderId || next.createdAt - item.createdAt > GROUP_GAP_MS;
    const newest = mine && newestMine?.id === item.id && !item.pending;
    const readers = group && newest ? seenBy(item) : [];
    const seen = group ? readers.length > 0 : newest && otherReadAt >= item.createdAt;
    const seenLabel = group ? ` · Seen by ${readers.map(nameOf).join(", ")}` : " · Seen";
    // A name above the first bubble of each run in a Duo chat.
    const showSender = group && !mine && (!previous || previous.senderId !== item.senderId || startsDay);

    if (item.senderId === "system") {
      return (
        <YStack paddingHorizontal="$4" alignItems="center" marginVertical="$2">
          <Text fontSize="$1" color="$textMuted" textAlign="center">
            {item.text}
          </Text>
        </YStack>
      );
    }

    return (
      <YStack paddingHorizontal="$4" testID={index === 0 ? "chat-message-latest" : undefined}>
        {startsDay ? (
          <Text alignSelf="center" fontSize="$1" color="$textMuted" marginVertical="$3">
            {formatDayLabel(item.createdAt)}
          </Text>
        ) : null}
        <YStack alignItems={mine ? "flex-end" : "flex-start"} marginBottom={endsGroup ? "$3" : 3}>
          {showSender ? (
            <Text fontSize="$1" fontWeight="700" color="$primary" marginBottom={3} marginLeft="$2">
              {nameOf(item.senderId)}
            </Text>
          ) : null}
          <YStack
            maxWidth="80%"
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius={20}
            borderBottomRightRadius={mine && endsGroup ? 6 : 20}
            borderBottomLeftRadius={!mine && endsGroup ? 6 : 20}
            backgroundColor={mine ? "$primary" : "$backgroundStrong"}
            borderWidth={mine ? 0 : 1}
            borderColor="$border"
          >
            {concealed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show hidden message"
                onPress={() => setRevealed((current) => new Set(current).add(item.id))}
              >
                <XStack gap="$2" alignItems="center">
                  <Icon name="eye-off-outline" size={16} color="textMuted" />
                  <Text color="$textMuted" fontSize="$3">
                    Hidden by Paire AI · Tap to view
                  </Text>
                </XStack>
              </Pressable>
            ) : (
              <Text color={mine ? "$primaryForeground" : "$text"} fontSize="$4" lineHeight={22} selectable>
                {item.text}
              </Text>
            )}
          </YStack>
          {!mine ? renderSafety(item) : null}
          {endsGroup ? (
            <XStack gap="$1" marginTop={3} alignItems="center">
              {item.pending ? <Icon name="time-outline" size={12} color="textMuted" /> : null}
              <Text fontSize="$1" color="$textMuted">
                {item.pending ? "Sending…" : formatClockTime(item.createdAt)}
                {seen ? seenLabel : ""}
              </Text>
            </XStack>
          ) : null}
        </YStack>
      </YStack>
    );
  };

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        paddingTop={insets.top + 4}
        paddingBottom="$2"
        paddingHorizontal="$2"
        alignItems="center"
        gap="$2"
        borderBottomWidth={1}
        borderBottomColor="$border"
        backgroundColor="$backgroundStrong"
      >
        <IconButton
          testID="chat-back"
          icon="chevron-back"
          accessibilityLabel="Go back"
          size={40}
          iconSize={26}
          onPress={() => navigation.goBack()}
        />
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
          disabled={!active}
          onPress={() =>
            group
              ? navigation.navigate("ChatMembers", { matchId })
              : navigation.navigate("ProfileView", { source: "match", uid: otherUid, matchId })
          }
        >
          <XStack alignItems="center" gap="$3">
            <AvatarPair people={faces} size={40} />
            <YStack flex={1}>
              <Text fontSize="$5" fontWeight="700" numberOfLines={1}>
                {name}
              </Text>
              {!active && match !== undefined ? (
                <Text fontSize="$1" color="$textMuted">
                  {group ? "Chat ended" : "Match ended"}
                </Text>
              ) : group ? (
                <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
                  Duo chat{partnerName ? ` · with ${partnerName.split(" ")[0]}` : ""}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        </Pressable>
        {match !== null ? (
          <IconButton
            testID="chat-menu"
            icon="ellipsis-vertical"
            accessibilityLabel="Chat options"
            onPress={() => setMenuOpen(true)}
          />
        ) : null}
      </XStack>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {match === undefined || (active && !messagesLoaded) ? (
          <LoadingView />
        ) : (
          <FlatList
            data={messages}
            inverted={messages.length > 0}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              // The list is inverted, so the footer sits above the first message: the notes
              // that started this conversation stay in view once it gets going.
              messages.length && !hasMore && (theirSpark || mySpark) ? (
                <YStack gap="$2" paddingHorizontal="$3" paddingTop="$3" paddingBottom="$2">
                  {theirSpark ? <SparkBubble label={`${name.split(" ")[0]}'s note`} text={theirSpark} /> : null}
                  {mySpark ? <SparkBubble label="Your note" text={mySpark} mine /> : null}
                </YStack>
              ) : null
            }
            contentContainerStyle={messages.length ? { paddingTop: 8 } : { flexGrow: 1, justifyContent: "center" }}
            ListEmptyComponent={
              active ? (
                <YStack alignItems="center" gap="$3" padding="$5">
                  <AvatarPair people={faces} size={96} ring />
                  <Text fontSize="$6" fontWeight="700" textAlign="center">
                    {group ? `Your Duo matched with ${name}` : `You matched with ${name}`}
                  </Text>
                  {theirSpark ? <SparkBubble label={`${name.split(" ")[0]}'s note`} text={theirSpark} /> : null}
                  {mySpark ? <SparkBubble label="Your note" text={mySpark} mine /> : null}
                  {waitingFor ? (
                    <YStack testID="chat-waiting-first-move" gap="$1" alignItems="center">
                      <Icon name="hourglass-outline" size={22} color="primary" />
                      <Text color="$textMuted" textAlign="center">
                        {name.split(" ")[0]} likes to make the first move. You'll be notified when they say hi.
                      </Text>
                    </YStack>
                  ) : (
                    <>
                      <Text color="$textMuted" textAlign="center">
                        {iOpen
                          ? "You chose to make the first move. Say hi whenever you're ready."
                          : theirSpark
                            ? "Reply to their note, or tap an idea below and make it yours."
                            : "Not sure what to say? Tap one to start, then make it yours."}
                      </Text>
                      <AiSuggestions
                        testID="chat-openers"
                        title="Paire AI icebreakers"
                        suggestions={openers.data?.suggestions ?? icebreakers}
                        loading={openers.isFetching}
                        onPick={setText}
                      />
                    </>
                  )}
                  <XStack gap="$2" alignItems="center" marginTop="$3" paddingHorizontal="$3">
                    <Icon name="shield-checkmark-outline" size={16} color="textMuted" />
                    <Text fontSize="$1" color="$textMuted" flex={1}>
                      Paire AI watches for scams and abuse to keep chats safe. Never send money to a match.
                    </Text>
                  </XStack>
                </YStack>
              ) : null
            }
          />
        )}

        {active && waitingFor ? (
          <YStack
            padding="$4"
            paddingBottom={insets.bottom + 16}
            backgroundColor="$backgroundStrong"
            borderTopWidth={1}
            borderTopColor="$border"
          >
            <Text color="$textMuted" textAlign="center" fontSize="$2">
              Waiting for {name.split(" ")[0]} to say hi first
            </Text>
          </YStack>
        ) : active ? (
          <XStack
            paddingHorizontal="$3"
            paddingTop="$2"
            paddingBottom={composerBottom}
            gap="$2"
            alignItems="flex-end"
            borderTopWidth={1}
            borderTopColor="$border"
            backgroundColor="$backgroundStrong"
          >
            <MuseInput
              testID="chat-input"
              flex={1}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={`Message ${name}`}
              value={text}
              onChangeText={setText}
              minHeight={46}
              maxHeight={120}
              borderRadius={23}
              paddingTop="$3"
              textAlignVertical="center"
            />
            <IconButton
              testID="chat-send"
              icon="arrow-up"
              accessibilityLabel="Send message"
              variant="solid"
              color="primary"
              size={46}
              disabled={!text.trim() || sending}
              onPress={() => void handleSend()}
            />
          </XStack>
        ) : match !== undefined ? (
          <YStack
            padding="$4"
            paddingBottom={insets.bottom + 16}
            backgroundColor="$backgroundStrong"
            borderTopWidth={1}
            borderTopColor="$border"
            gap="$1"
          >
            <Text fontWeight="700" textAlign="center">
              {match === null ? "This chat isn't available" : group ? "This chat has ended" : "This match has ended"}
            </Text>
            <Text color="$textMuted" textAlign="center" fontSize="$2">
              {match === null
                ? "You're no longer in this chat, or it was removed."
                : group
                  ? "You can no longer message this group."
                  : "You can no longer message each other."}
            </Text>
          </YStack>
        ) : null}
      </KeyboardAvoidingView>

      <ActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} options={menuOptions} />
      <ActionSheet
        visible={closeOpen}
        title={`Send ${name.split(" ")[0]} a kind goodbye, then end the match`}
        onClose={() => setCloseOpen(false)}
        options={closingOptions}
      />
    </YStack>
  );
}
