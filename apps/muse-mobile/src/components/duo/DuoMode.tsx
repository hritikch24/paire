import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, ScrollView, Share, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Text, XStack, YStack } from "tamagui";
import type { DuoState } from "../../hooks/useDuo";
import {
  acceptDuoInvite,
  answerDuoRequest,
  cancelDuoInvite,
  cancelDuoRequest,
  createDuoInvite,
  duoInviteMessage,
  fetchDuoFeed,
  sendDuoSwipe,
  undoDuoSwipe
} from "../../services/duoService";
import { errorCode, friendlyError } from "../../services/errors";
import { inviteFriends } from "../../services/inviteService";
import { suppressMatchAlert } from "../../services/notificationService";
import { useAuthStore } from "../../store/authStore";
import { useThemeColors } from "../../theme/useThemeColors";
import { DuoCard, DuoJoinRequest, DuoPendingRequest } from "../../types/models";
import type { AppStackParamList } from "../../navigation/types";
import { Avatar, AvatarPair } from "../Avatar";
import { Icon, IconName } from "../Icon";
import { IconButton } from "../IconButton";
import { MatchMoment } from "../MatchMoment";
import { GhostButton, PrimaryButton, SecondaryButton } from "../MuseButton";
import { MuseInput } from "../MuseInput";
import { EmptyState, LoadingView } from "../States";
import { showToast } from "../Toast";
import { DuoCardView } from "./DuoCardView";

const firstName = (name?: string) => name?.trim().split(/\s+/)[0] ?? "";
const namesOf = (card: DuoCard) => card.members.map((person) => firstName(person.displayName)).join(" & ");

// ------------------------------------------------------------------ join / invite

function JoinWithCode() {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const join = async () => {
    Keyboard.dismiss();
    setJoining(true);
    try {
      const { friendName } = await acceptDuoInvite(code);
      setCode("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast(`Request sent! ${firstName(friendName)} just needs to confirm it's you.`, "success");
    } catch (error) {
      showToast(friendlyError(error, "Couldn't join with that code."), "error");
    } finally {
      setJoining(false);
    }
  };
  return (
    <YStack gap="$2">
      <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase">
        Got a code from a friend?
      </Text>
      <XStack gap="$2" alignItems="center">
        <MuseInput
          testID="duo-code-input"
          flex={1}
          value={code}
          onChangeText={(value) =>
            setCode(
              value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 6)
            )
          }
          placeholder="ABC234"
          accessibilityLabel="Your friend's 6-character Duo code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={{ fontSize: 20, letterSpacing: 4, fontWeight: "700" }}
        />
        <YStack width={110}>
          <PrimaryButton testID="duo-join" onPress={() => void join()} disabled={code.length !== 6} loading={joining}>
            Join
          </PrimaryButton>
        </YStack>
      </XStack>
      <Text fontSize="$1" color="$textMuted">
        Codes never use 0, O, 1, I or L, so there's no mixing them up.
      </Text>
    </YStack>
  );
}

/** Someone entered your code: you confirm it's really your friend. */
function JoinRequestCard({ request }: { request: DuoJoinRequest }) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const answer = async (accept: boolean) => {
    setBusy(accept ? "yes" : "no");
    try {
      await answerDuoRequest(accept);
      if (accept) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        showToast(`You and ${firstName(request.displayName)} are a Duo! 🎉`, "success");
      }
    } catch (error) {
      showToast(friendlyError(error, "Couldn't answer that request."), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <YStack
      testID="duo-request"
      gap="$3"
      padding="$4"
      borderRadius={24}
      backgroundColor="$backgroundStrong"
      borderWidth={1.5}
      borderColor="$primary"
    >
      <XStack gap="$3" alignItems="center">
        <Avatar uri={request.photoUrl} name={request.displayName} size={56} ring />
        <YStack flex={1}>
          <Text fontSize="$5" fontWeight="700">
            {firstName(request.displayName)}
            {request.age ? `, ${request.age}` : ""} wants to be your Duo
          </Text>
          <Text fontSize="$2" color="$textMuted">
            Only accept if this is the friend you sent your code to.
          </Text>
        </YStack>
      </XStack>
      <XStack gap="$3">
        <YStack flex={1}>
          <SecondaryButton
            testID="duo-request-decline"
            loading={busy === "no"}
            disabled={Boolean(busy)}
            onPress={() => void answer(false)}
          >
            Not them
          </SecondaryButton>
        </YStack>
        <YStack flex={1}>
          <PrimaryButton
            testID="duo-request-accept"
            loading={busy === "yes"}
            disabled={Boolean(busy)}
            onPress={() => void answer(true)}
          >
            Accept
          </PrimaryButton>
        </YStack>
      </XStack>
    </YStack>
  );
}

/** You entered a friend's code; they haven't confirmed yet. */
function PendingCard({ pending }: { pending: DuoPendingRequest }) {
  return (
    <XStack gap="$3" alignItems="center" padding="$4" borderRadius={24} backgroundColor="$primarySoft">
      <Avatar uri={pending.toPhotoUrl} name={pending.toName} size={48} />
      <YStack flex={1} gap={2}>
        <Text fontSize="$4" fontWeight="700">
          Waiting for {firstName(pending.toName)} to confirm
        </Text>
        <Text fontSize="$2" color="$textMuted">
          We've let them know. You'll be a Duo as soon as they accept.
        </Text>
      </YStack>
      <GhostButton onPress={() => void cancelDuoRequest().catch(() => undefined)}>Cancel</GhostButton>
    </XStack>
  );
}

function InviteCodePanel({ code, expiresAt }: { code: string; expiresAt: number }) {
  const myName = useAuthStore((state) => state.profile?.displayName) ?? "Your friend";
  const hours = Math.max(1, Math.round((expiresAt - Date.now()) / 3_600_000));
  return (
    <YStack
      gap="$3"
      padding="$4"
      borderRadius={24}
      backgroundColor="$backgroundStrong"
      borderWidth={1}
      borderColor="$border"
    >
      <Text fontSize="$5" fontWeight="700">
        Send this code to your friend
      </Text>
      <XStack
        gap={6}
        justifyContent="center"
        accessible
        accessibilityLabel={`Your code is ${code.split("").join(" ")}`}
      >
        {code.split("").map((char, index) => (
          <YStack
            key={`${char}-${index}`}
            width={44}
            height={56}
            borderRadius={14}
            backgroundColor="$primarySoft"
            alignItems="center"
            justifyContent="center"
          >
            <Text
              testID={index === 0 ? "duo-code" : undefined}
              fontSize={26}
              lineHeight={32}
              fontWeight="700"
              color="$primary"
            >
              {char}
            </Text>
          </YStack>
        ))}
      </XStack>
      <Text fontSize="$2" color="$textMuted" textAlign="center">
        They open Paire → Discover → Duos and enter it. Works for {hours} more hour
        {hours === 1 ? "" : "s"}.
      </Text>
      <PrimaryButton
        testID="duo-share"
        leftIcon={<Icon name="share-social" size={18} color="primaryForeground" />}
        onPress={() => void Share.share({ message: duoInviteMessage(code, firstName(myName)) }).catch(() => undefined)}
      >
        Share with a friend
      </PrimaryButton>
      <GhostButton onPress={() => void cancelDuoInvite().catch(() => undefined)}>Cancel code</GhostButton>
    </YStack>
  );
}

const PERKS: Array<{ icon: IconName; text: string }> = [
  { icon: "shield-checkmark", text: "Safer, easier first dates with your bestie by your side" },
  { icon: "people", text: "Match with another pair of friends, chat as four" },
  { icon: "sparkles", text: "Paire AI finds pairs your whole group will click with" }
];

function DuoIntro({ invite, pending }: { invite: DuoState["invite"]; pending: DuoState["pending"] }) {
  const me = useAuthStore((state) => state.profile);
  const { gradient, glow } = useThemeColors();
  const [creating, setCreating] = useState(false);
  const create = async () => {
    setCreating(true);
    try {
      await createDuoInvite();
    } catch (error) {
      showToast(friendlyError(error, "Couldn't make a code. Please try again."), "error");
    } finally {
      setCreating(false);
    }
  };
  return (
    <ScrollView
      contentContainerStyle={styles.introScroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <XStack alignItems="center" gap="$3">
          <AvatarPair people={[{ uri: me?.photoUrls?.[0], name: me?.displayName }, { name: "+" }]} size={64} ring />
          <YStack flex={1}>
            <Text color={glow} fontSize="$2" fontWeight="700" textTransform="uppercase" letterSpacing={1}>
              New · Duos
            </Text>
            <Text color="white" fontSize="$7" lineHeight={30} fontWeight="700">
              Double dates with your bestie
            </Text>
          </YStack>
        </XStack>
        <YStack gap="$2">
          {PERKS.map((perk) => (
            <XStack key={perk.text} gap="$2" alignItems="center">
              <Icon name={perk.icon} size={16} color={glow} />
              <Text color="rgba(255,255,255,0.92)" fontSize="$3" flex={1}>
                {perk.text}
              </Text>
            </XStack>
          ))}
        </YStack>
      </LinearGradient>

      {invite?.request ? <JoinRequestCard request={invite.request} /> : null}
      {pending ? <PendingCard pending={pending} /> : null}
      {invite && !invite.request ? (
        <InviteCodePanel code={invite.code} expiresAt={invite.expiresAt} />
      ) : invite ? null : (
        <PrimaryButton
          testID="duo-invite"
          loading={creating}
          leftIcon={<Icon name="person-add" size={18} color="primaryForeground" />}
          onPress={() => void create()}
        >
          Invite a friend to be your Duo
        </PrimaryButton>
      )}
      {!pending && !invite?.request ? <JoinWithCode /> : null}
      <Text fontSize="$1" color="$textMuted">
        Your Duo sees the pairs you like, and you see theirs. Your solo likes and chats stay private.
      </Text>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ deck

type Answer = { card: DuoCard; type: "like" | "nope" };

function DuoDeck({ duoId, partnerName }: { duoId: string; partnerName: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const me = useAuthStore((state) => state.profile);
  const feed = useQuery({
    queryKey: ["duo-feed", duoId],
    queryFn: fetchDuoFeed,
    staleTime: 10_000
  });
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());
  const [last, setLast] = useState<Answer | null>(null);
  const [match, setMatch] = useState<{ matchId: string; card: DuoCard } | null>(null);

  const deck = useMemo(() => (feed.data ?? []).filter((card) => !answered.has(card.duoId)), [answered, feed.data]);
  const top = deck[0];

  const x = useSharedValue(0);
  useEffect(() => {
    x.value = 0;
  }, [top?.duoId, x]);

  const answer = (card: DuoCard, type: "like" | "nope") => {
    setAnswered((current) => new Set(current).add(card.duoId));
    setLast({ card, type });
    void Haptics.selectionAsync().catch(() => undefined);
    sendDuoSwipe(card.duoId, type)
      .then((result) => {
        if (result.matched && result.matchId) {
          suppressMatchAlert(result.matchId);
          setMatch({ matchId: result.matchId, card });
        }
      })
      .catch((error) => {
        if (errorCode(error) === "functions/not-found") return;
        setAnswered((current) => {
          const next = new Set(current);
          next.delete(card.duoId);
          return next;
        });
        setLast(null);
        showToast(friendlyError(error, "That didn't go through. Please try again."), "error");
      });
  };

  const fly = (type: "like" | "nope") => {
    const card = top;
    if (!card) return;
    x.value = withTiming(type === "like" ? 520 : -520, { duration: 220 }, (done) => {
      if (done) scheduleOnRN(answer, card, type);
    });
  };

  const undo = async () => {
    const previous = last;
    if (!previous) return;
    setLast(null);
    try {
      await undoDuoSwipe(previous.card.duoId);
      setAnswered((current) => {
        const next = new Set(current);
        next.delete(previous.card.duoId);
        return next;
      });
    } catch (error) {
      showToast(friendlyError(error, "Couldn't undo that."), "error");
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      x.value = event.translationX;
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > 110 || Math.abs(event.velocityX) > 900) {
        const type = event.translationX > 0 ? "like" : "nope";
        x.value = withTiming(type === "like" ? 520 : -520, { duration: 180 }, (done) => {
          if (done && top) scheduleOnRN(answer, top, type);
        });
      } else {
        x.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${interpolate(x.value, [-300, 0, 300], [-8, 0, 8])}deg` }]
  }));
  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [20, 120], [0, 1], "clamp")
  }));
  const nopeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-120, -20], [1, 0], "clamp")
  }));

  if (feed.isLoading) return <LoadingView label="Finding pairs for your Duo…" />;
  if (feed.isError) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load pairs"
        message={friendlyError(feed.error, "Check your connection.")}
      >
        <PrimaryButton onPress={() => void feed.refetch()}>Try again</PrimaryButton>
      </EmptyState>
    );
  }

  return (
    <YStack flex={1}>
      {!top ? (
        <EmptyState
          testID="duo-empty"
          icon="people-outline"
          title="No more pairs right now"
          message="New Duos form every day. Get your friends to team up and the deck fills faster."
        >
          <PrimaryButton onPress={() => void inviteFriends()}>Invite friends to Paire</PrimaryButton>
          <GhostButton
            onPress={() => {
              setAnswered(new Set());
              void feed.refetch();
            }}
          >
            Refresh
          </GhostButton>
        </EmptyState>
      ) : (
        <>
          <YStack flex={1} paddingHorizontal="$3">
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.card, cardStyle]}>
                <DuoCardView
                  card={top}
                  onOpenMember={(person) =>
                    navigation.navigate("ProfileView", {
                      source: "match",
                      profile: person
                    })
                  }
                />
                <Animated.View style={[styles.stamp, styles.likeStamp, likeStamp]} pointerEvents="none">
                  <Text color="#2E9E6B" fontSize={30} fontWeight="700">
                    LIKE
                  </Text>
                </Animated.View>
                <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStamp]} pointerEvents="none">
                  <Text color="#E0564F" fontSize={30} fontWeight="700">
                    PASS
                  </Text>
                </Animated.View>
              </Animated.View>
            </GestureDetector>
          </YStack>
          <XStack justifyContent="center" alignItems="center" gap="$4" paddingTop="$2" paddingBottom="$3">
            <IconButton
              testID="duo-undo"
              icon="arrow-undo"
              accessibilityLabel="Undo"
              variant="soft"
              color="warning"
              size={46}
              disabled={!last}
              onPress={() => void undo()}
              elevated
            />
            <IconButton
              testID="duo-nope"
              icon="close"
              accessibilityLabel={`Pass on ${namesOf(top)}`}
              variant="soft"
              color="nope"
              size={64}
              iconSize={34}
              onPress={() => fly("nope")}
              elevated
            />
            <IconButton
              testID="duo-like"
              icon="heart"
              accessibilityLabel={`Like ${namesOf(top)} for your Duo`}
              variant="soft"
              color="primary"
              size={64}
              iconSize={32}
              onPress={() => fly("like")}
              elevated
            />
          </XStack>
        </>
      )}

      <MatchMoment
        visible={Boolean(match)}
        title="It's a Duo match!"
        subtitle={
          match ? `You & ${partnerName} matched with ${namesOf(match.card)}. Plan something for all four of you.` : ""
        }
        me={{ name: me?.displayName ?? "You", photoUrl: me?.photoUrls?.[0] }}
        them={{
          name: match ? namesOf(match.card) : "",
          photoUrl: match?.card.members[0]?.photoUrls[0]
        }}
        onClose={() => setMatch(null)}
        onMessage={() => {
          if (!match) return;
          setMatch(null);
          navigation.navigate("Chat", { matchId: match.matchId, name: namesOf(match.card) });
        }}
      />
    </YStack>
  );
}

// ------------------------------------------------------------------ mode

/** Discover's Duo mode: set up a Duo, or swipe on other pairs with your friend. */
export function DuoMode({ state }: { state: DuoState }) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const me = useAuthStore((store) => store.profile);
  if (state.loading) return <LoadingView />;
  if (!state.duo || !state.partnerUid) return <DuoIntro invite={state.invite} pending={state.pending} />;

  const partner = state.duo.profiles[state.partnerUid];
  const partnerName = firstName(partner?.displayName) || "your friend";
  return (
    <YStack flex={1} gap="$2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your Duo"
        testID="duo-manage"
        onPress={() => navigation.navigate("Duo")}
      >
        <XStack
          marginHorizontal="$4"
          padding="$2"
          paddingRight="$3"
          gap="$3"
          alignItems="center"
          borderRadius={999}
          backgroundColor="$backgroundStrong"
          borderWidth={1}
          borderColor="$border"
        >
          <AvatarPair
            people={[
              { uri: me?.photoUrls?.[0], name: me?.displayName },
              { uri: partner?.photoUrl, name: partner?.displayName }
            ]}
            size={36}
          />
          <Text flex={1} fontSize="$3" fontWeight="700" numberOfLines={1}>
            You & {partnerName}
          </Text>
          <Text fontSize="$2" color="$primary" fontWeight="700">
            Your Duo
          </Text>
          <Icon name="chevron-forward" size={16} color="primary" />
        </XStack>
      </Pressable>
      <DuoDeck duoId={state.duo.id} partnerName={partnerName} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  introScroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 18 },
  hero: { borderRadius: 28, padding: 20, gap: 16 },
  card: { flex: 1 },
  stamp: {
    position: "absolute",
    top: 64,
    borderWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  likeStamp: { left: 24, borderColor: "#2E9E6B", transform: [{ rotate: "-14deg" }] },
  nopeStamp: { right: 24, borderColor: "#E0564F", transform: [{ rotate: "14deg" }] }
});
