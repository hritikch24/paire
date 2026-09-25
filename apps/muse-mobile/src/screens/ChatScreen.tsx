import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  useWindowDimensions
} from "react-native";
import { Card, Text, XStack, YStack, styled } from "tamagui";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch
} from "@firebase/firestore/dist/index.cjs.js";
import { Screen } from "../components/Screen";
import { MuseInput } from "../components/MuseInput";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { AppStackParamList } from "../navigation/stacks/AppStack";
import { sendMessage } from "../services/matchService";
import { endMatch } from "../services/matchService";
import { db } from "../services/firebase";
import { useAuthStore } from "../store/authStore";
import { ChatMessage, UserProfile } from "../types/models";
import { getDailyPrompt, musePromptTitle } from "../data/musePrompts";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { datingIntentionMap } from "../data/datingIntentions";
import { RootStackParamList } from "../navigation/RootNavigator";
import { formatLastActive } from "../utils/formatLastActive";
import { distanceKm, formatDistanceKm } from "../utils/distance";
import { demoProfiles } from "../data/demoProfiles";

export function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Chat">>();
  const { matchId, targetUid } = route.params;
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compactHeader = width <= 360 || fontScale >= 1.2;
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isGuest = useAuthStore((state) => state.isGuest);
  const resetAuth = useAuthStore((state) => state.resetAuth);
  const uid = user?.uid ?? "";
  const inputRef = useRef<TextInput>(null);
  const dailyPrompt = useMemo(() => getDailyPrompt(), []);
  const callRoomId = matchId ? `match-${matchId}` : "muse-call";
  const isDemo =
    matchId.startsWith("demo-") || matchId.startsWith("random-") || targetUid.startsWith("demo_");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [typingUid, setTypingUid] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [matchExists, setMatchExists] = useState(true);

  useEffect(() => {
    if (isDemo) {
      const demoProfile =
        demoProfiles.find((profile) => profile.uid === targetUid) ?? demoProfiles[0];
      if (demoProfile) {
        const now = Date.now();
        setTargetProfile({
          ...demoProfile,
          shareLocation: true,
          location: demoProfile.location ?? {
            lat: 19.076,
            lng: 72.8777,
            updatedAt: now
          }
        });
        setMessages([
          {
            id: "demo-hello",
            matchId,
            senderId: demoProfile.uid,
            text: "Hey! Want to grab coffee this week?",
            createdAt: now,
            readBy: [demoProfile.uid]
          }
        ]);
      }
      setMatchExists(true);
      return;
    }
    if (!matchId || !uid) return;
    const messagesQuery = query(
      collection(db, "matches", matchId, "messages"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot: any) => {
      const nextMessages = snapshot.docs.map((doc: any) => {
        const data = doc.data() as ChatMessage;
        return { ...data, id: doc.id };
      });
      setMessages(nextMessages);
    });

    return unsubscribe;
  }, [matchId, uid]);

  useEffect(() => {
    if (isDemo) return;
    if (!targetUid) {
      setTargetProfile(null);
      return;
    }
    let mounted = true;
    getDoc(doc(db, "users", targetUid))
      .then((snap) => {
        if (!mounted) return;
        setTargetProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      })
      .catch(() => {
        if (!mounted) return;
        setTargetProfile(null);
      });
    return () => {
      mounted = false;
    };
  }, [targetUid]);

  useEffect(() => {
    if (isDemo) return;
    if (!matchId || !uid || !messages.length) return;
    setPendingMessages((prev) =>
      prev.filter((pending) => !messages.some((message) => message.id === pending.id))
    );
    const unread = messages.filter(
      (message) => !message.readBy.includes(uid) && message.senderId !== uid
    );

    if (!unread.length) return;

    const batch = writeBatch(db);
    unread.forEach((message) => {
      const ref = doc(db, "matches", matchId, "messages", message.id);
      batch.update(ref, { readBy: [...message.readBy, uid] });
    });
    batch.commit();
  }, [matchId, messages, uid]);

  useEffect(() => {
    if (isDemo) return;
    if (!matchId) {
      setMatchExists(false);
      return;
    }
    const matchRef = doc(db, "matches", matchId);
    const unsubscribe = onSnapshot(matchRef, (snapshot: any) => {
      const isActive = snapshot.exists() && snapshot.data()?.active !== false;
      setMatchExists(isActive);
      if (!isActive) {
        setTypingUid(null);
        return;
      }
      const data = snapshot.data() as { typing?: string; typingAt?: number } | undefined;
      if (!data?.typing || data.typing === uid) {
        setTypingUid(null);
        return;
      }
      const isFresh = data.typingAt ? Date.now() - data.typingAt < 6000 : false;
      setTypingUid(isFresh ? data.typing : null);
    });

    return unsubscribe;
  }, [matchId, uid]);

  const canChat = isDemo || (Boolean(matchId) && !isGuest && matchExists);
  const matchEnded = Boolean(matchId) && !matchExists && !isDemo;

  const handleSend = async () => {
    if (!canChat) return;
    if (!uid || !text.trim()) return;
    const trimmed = text.trim();
    const createdAt = Date.now();
    const pendingId = `local-${createdAt}`;
    if (isDemo) {
      setMessages((prev) => [
        {
          id: `demo-${createdAt}`,
          matchId,
          senderId: uid,
          text: trimmed,
          createdAt,
          readBy: [uid]
        },
        ...prev
      ]);
      setText("");
      return;
    }
    const optimistic = {
      id: pendingId,
      matchId,
      senderId: uid,
      text: trimmed,
      createdAt,
      readBy: [uid]
    };
    setPendingMessages((prev) => [
      optimistic,
      ...prev.filter((message) => message.id !== pendingId)
    ]);
    setText("");
    try {
      const messageRef = await sendMessage({ matchId, senderId: uid, text: trimmed });
      setPendingMessages((prev) => prev.filter((message) => message.id !== pendingId));
      setMessages((prev) => [
        { ...optimistic, id: messageRef.id },
        ...prev.filter((message) => message.id !== messageRef.id)
      ]);
    } catch {
      // Keep optimistic bubble if the network fails.
    }
    try {
      const matchRef = doc(db, "matches", matchId);
      await updateDoc(matchRef, { typing: null, typingAt: null });
    } catch {
      // Ignore typing updates if rules/network block them.
    }
  };

  const handleTyping = async (value: string) => {
    setText(value);
    if (!matchId || !uid || !canChat) return;
    try {
      const matchRef = doc(db, "matches", matchId);
      await updateDoc(matchRef, { typing: uid, typingAt: Date.now() });
    } catch {
      // Ignore typing updates if rules/network block them.
    }
  };

  const handleUnmatch = async () => {
    if (!matchId || !uid) return;
    if (isDemo) {
      setMatchExists(false);
      setMessages([]);
      navigation.goBack();
      return;
    }
    try {
      await endMatch({ matchId, endedBy: uid, reason: "unmatch" });
    } catch {
      // Best-effort unmatch.
    }
    navigation.goBack();
  };

  const confirmUnmatch = () => {
    Alert.alert(
      "Unmatch?",
      "You won’t be able to chat again and this match will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unmatch", style: "destructive", onPress: handleUnmatch }
      ]
    );
  };

  const messageData = useMemo(() => {
    const merged = [...pendingMessages, ...messages];
    const seen = new Set<string>();
    return merged.filter((message) => {
      if (seen.has(message.id)) {
        return false;
      }
      seen.add(message.id);
      return true;
    });
  }, [messages, pendingMessages]);

  const openerSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    const quickAnswers = targetProfile?.quickAnswers ?? [];
    quickAnswers.slice(0, 2).forEach((entry) => {
      const question = rapidQuestionMap.get(entry.questionId)?.question;
      if (question) {
        suggestions.push(question);
      }
    });
    if (dailyPrompt) {
      suggestions.push(dailyPrompt);
    }
    const seen = new Set<string>();
    return suggestions.filter((item) => {
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) return false;
      seen.add(trimmed);
      return true;
    });
  }, [dailyPrompt, targetProfile]);

  const intentionLabel = targetProfile?.intentions
    ?.map((id) => datingIntentionMap.get(id)?.label)
    .filter((label): label is string => Boolean(label))
    .slice(0, 1)
    .join(", ");
  const activityLabel = formatLastActive(targetProfile?.lastActiveAt);
  const canShowDistance =
    Boolean(profile?.shareLocation && profile?.location) &&
    Boolean(targetProfile?.shareLocation && targetProfile?.location);
  const distanceLabel = canShowDistance
    ? formatDistanceKm(
        distanceKm(
          { lat: profile!.location!.lat, lng: profile!.location!.lng },
          { lat: targetProfile!.location!.lat, lng: targetProfile!.location!.lng }
        )
      )
    : "";
  const metaLine = [activityLabel, intentionLabel, distanceLabel].filter(Boolean).join(" • ");

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <YStack flex={1} gap="$3" paddingBottom={Math.max(insets.bottom, 0)}>
          {compactHeader ? (
            <YStack gap="$2">
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <SecondaryButton testID="chat-back" onPress={() => navigation.goBack()}>
                  Back
                </SecondaryButton>
                <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
                  {targetProfile?.photoUrls?.[0] ? (
                    <Image
                      source={{ uri: targetProfile.photoUrls[0] }}
                      style={{ width: 32, height: 32, borderRadius: 12 }}
                    />
                  ) : (
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={12}
                      backgroundColor="$backgroundSoft"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text fontSize="$2" fontWeight="700">
                        {targetProfile?.displayName?.slice(0, 1) ?? "M"}
                      </Text>
                    </YStack>
                  )}
                  <YStack flex={1} minWidth={0}>
                    <Text fontSize="$6" fontWeight="700" numberOfLines={1}>
                      {targetProfile?.displayName ?? "Chat"}
                    </Text>
                    {metaLine ? (
                      <Text fontSize="$2" color="$textMuted" numberOfLines={1}>
                        {metaLine}
                      </Text>
                    ) : null}
                  </YStack>
                </XStack>
              </XStack>
              <XStack justifyContent="flex-end" flexWrap="wrap" gap="$2">
                <SecondaryButton
                  onPress={() => navigation.navigate("Call", { roomId: callRoomId, video: false })}
                  disabled={!canChat}
                >
                  Audio call
                </SecondaryButton>
                <SecondaryButton
                  onPress={() => navigation.navigate("Call", { roomId: callRoomId, video: true })}
                  disabled={!canChat}
                >
                  Video call
                </SecondaryButton>
                <SecondaryButton
                  onPress={() => navigation.navigate("PublicProfile", { uid: targetUid })}
                >
                  View profile
                </SecondaryButton>
                <SecondaryButton onPress={confirmUnmatch} disabled={!matchId}>
                  Unmatch
                </SecondaryButton>
                <SecondaryButton
                  onPress={() => rootNavigation?.navigate("ReportBlock", { targetUid })}
                >
                  Report or block
                </SecondaryButton>
              </XStack>
            </YStack>
          ) : (
            <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
              <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
                <SecondaryButton testID="chat-back" onPress={() => navigation.goBack()}>
                  Back
                </SecondaryButton>
                <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
                  {targetProfile?.photoUrls?.[0] ? (
                    <Image
                      source={{ uri: targetProfile.photoUrls[0] }}
                      style={{ width: 32, height: 32, borderRadius: 12 }}
                    />
                  ) : (
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={12}
                      backgroundColor="$backgroundSoft"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text fontSize="$2" fontWeight="700">
                        {targetProfile?.displayName?.slice(0, 1) ?? "M"}
                      </Text>
                    </YStack>
                  )}
                  <YStack flex={1} minWidth={0}>
                    <Text fontSize="$6" fontWeight="700" numberOfLines={1}>
                      {targetProfile?.displayName ?? "Chat"}
                    </Text>
                    {metaLine ? (
                      <Text fontSize="$2" color="$textMuted" numberOfLines={1}>
                        {metaLine}
                      </Text>
                    ) : null}
                  </YStack>
                </XStack>
              </XStack>
              <XStack gap="$2" flexWrap="wrap">
                <SecondaryButton
                  accessibilityLabel="Start audio call"
                  onPress={() => navigation.navigate("Call", { roomId: callRoomId, video: false })}
                  disabled={!canChat}
                >
                  Audio call
                </SecondaryButton>
                <SecondaryButton
                  accessibilityLabel="Start video call"
                  onPress={() => navigation.navigate("Call", { roomId: callRoomId, video: true })}
                  disabled={!canChat}
                >
                  Video call
                </SecondaryButton>
                <SecondaryButton
                  accessibilityLabel="View profile"
                  onPress={() => navigation.navigate("PublicProfile", { uid: targetUid })}
                >
                  View profile
                </SecondaryButton>
                <SecondaryButton accessibilityLabel="Unmatch" onPress={confirmUnmatch} disabled={!matchId}>
                  Unmatch
                </SecondaryButton>
                <SecondaryButton
                  accessibilityLabel="Report or block"
                  onPress={() => rootNavigation?.navigate("ReportBlock", { targetUid })}
                >
                  Report or block
                </SecondaryButton>
              </XStack>
            </XStack>
          )}

          {typingUid ? (
            <Text fontSize="$2" color="$textMuted">
              Typing...
            </Text>
          ) : null}

          <Card
            padding="$3"
            borderRadius="$5"
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$border"
          >
            <YStack gap="$2">
              <Text fontWeight="700">Safety check</Text>
              <Text fontSize="$2" color="$textMuted">
                Keep things respectful and never share sensitive info. You can report or block at any time.
              </Text>
            </YStack>
          </Card>

          {!canChat ? (
            <Card
              padding="$3"
              borderRadius="$5"
              backgroundColor="$backgroundStrong"
              borderWidth={1}
              borderColor="$border"
            >
              <YStack gap="$2">
                <Text fontWeight="700">
                  {matchEnded ? "Match ended" : "Chat unlocks after a match"}
                </Text>
                <Text fontSize="$2" color="$textMuted">
                  {matchEnded
                    ? "This match is no longer active."
                    : "Keep swiping to match, or create an account to continue."}
                </Text>
                {isGuest ? (
                  <PrimaryButton onPress={resetAuth}>Create account</PrimaryButton>
                ) : (
                  <SecondaryButton onPress={() => navigation.goBack()}>Back to Discover</SecondaryButton>
                )}
              </YStack>
            </Card>
          ) : null}

          {openerSuggestions.length ? (
            <YStack gap="$2">
              <Text fontSize="$2" color="$textMuted">
                {musePromptTitle} icebreakers
              </Text>
              <XStack gap="$2" flexWrap="wrap">
                {openerSuggestions.slice(0, 3).map((suggestion) => (
                  <SuggestionChip
                    key={suggestion}
                    onPress={() => {
                      setText(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    <Text fontSize="$2" flexShrink={1}>
                      {suggestion}
                    </Text>
                  </SuggestionChip>
                ))}
              </XStack>
            </YStack>
          ) : null}

          <FlatList
            data={messageData}
            keyExtractor={(item) => item.id}
            inverted
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={
              messageData.length ? undefined : { flexGrow: 1, justifyContent: "center" }
            }
            ListEmptyComponent={
              canChat ? (
                <YStack alignItems="center" gap="$2" padding="$4">
                  <Text fontWeight="700">No messages yet</Text>
                  <Text fontSize="$2" color="$textMuted" textAlign="center">
                    Break the ice with a quick hello or try an icebreaker.
                  </Text>
                </YStack>
              ) : null
            }
            renderItem={({ item, index }) => (
              <YStack
                testID={index === 0 ? "chat-message-latest" : `chat-message-${item.id}`}
                alignSelf={item.senderId === uid ? "flex-end" : "flex-start"}
                backgroundColor={item.senderId === uid ? "$primarySoft" : "$backgroundSoft"}
                padding="$3"
                borderRadius="$4"
                marginBottom={8}
                maxWidth="80%"
              >
                <Text>{item.text}</Text>
                {item.senderId === uid && item.readBy.length > 1 ? (
                  <Text fontSize="$1" color="$textMuted">
                    Read
                  </Text>
                ) : null}
              </YStack>
            )}
          />

          <XStack gap="$2" alignItems="center">
            <MuseInput
              placeholder="Message"
              value={text}
              onChangeText={handleTyping}
              flex={1}
              ref={inputRef}
              testID="chat-input"
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => handleSend()}
              editable={canChat}
            />
            <PrimaryButton testID="chat-send" onPress={handleSend} minWidth={96} disabled={!canChat}>
              Send
            </PrimaryButton>
          </XStack>
        </YStack>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const SuggestionChip = styled(Card, {
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderRadius: "$5",
  backgroundColor: "$backgroundSoft",
  borderWidth: 1,
  borderColor: "$border",
  pressStyle: { opacity: 0.85, scale: 0.98 }
});
