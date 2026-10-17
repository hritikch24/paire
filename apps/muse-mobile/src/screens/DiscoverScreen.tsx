import { DiscoverEmpty } from "../components/DiscoverEmpty";
import { DiscoverWebStyles } from "../components/DiscoverWebStyles";
import { DiscoveryActions } from "../components/DiscoveryActions";
import { VerificationGate } from "../components/VerificationGate";
import { fetchPremiumStatus } from "../services/billingService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { DuoMode } from "../components/duo/DuoMode";
import { IconButton } from "../components/IconButton";
import { MatchMoment } from "../components/MatchMoment";
import { Icon } from "../components/Icon";
import { GhostButton, PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { SetupNudge } from "../components/SetupNudge";
import { SparkComposer } from "../components/SparkComposer";
import { CardSkeleton } from "../components/CardSkeleton";
import { NoteFlight } from "../components/NoteFlight";
import { EmptyState } from "../components/States";
import { SwipeDeck, SwipeDeckHandle } from "../components/SwipeDeck";
import { VibeFirstCard } from "../components/VibeFirstCard";
import { useDuo } from "../hooks/useDuo";
import { showToast } from "../components/Toast";
import { fetchDailyAllowance, fetchFeedPage, FeedFilter, sendSwipe, undoPass } from "../services/discoveryService";
import { errorCode, friendlyError } from "../services/errors";
import { inviteFriends } from "../services/inviteService";
import { suppressMatchAlert } from "../services/notificationService";
import { useAuthStore } from "../store/authStore";
import { AGE_GAP_FILTERS } from "../data/ageGap";
import { activeGarbaSeason, MAX_GARBA_NIGHTS, myUpcomingNights, upcomingNights } from "../data/garba";
import { GarbaSheet } from "../components/GarbaNights";
import { DiscoverProfile, FeedCursor, SwipeType } from "../types/models";
import type { AppStackParamList, MainTabsParamList } from "../navigation/types";

const REFILL_BELOW = 4;
const DUOS_SEEN_KEY = "muse.duos.seen";

type Mode = "solo" | "vibe" | "duo";

function ModeSwitch({ mode, onChange, duoBadge }: { mode: Mode; onChange: (mode: Mode) => void; duoBadge: boolean }) {
  const options: Array<{ id: Mode; label: string }> = [
    { id: "solo", label: "People" },
    { id: "vibe", label: "Vibe first" },
    { id: "duo", label: "Duos" }
  ];
  return (
    <XStack
      accessibilityRole="tablist"
      marginHorizontal="$4"
      backgroundColor="$backgroundSoft"
      borderRadius={999}
      padding={4}
      gap={2}
    >
      {options.map((option) => {
        const active = option.id === mode;
        return (
          <Pressable
            key={option.id}
            testID={`discover-mode-${option.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, borderRadius: 24, overflow: "hidden" }}
            onPress={() => onChange(option.id)}
          >
            <XStack
              minHeight={44}
              paddingHorizontal="$2"
              borderRadius={999}
              alignItems="center"
              justifyContent="center"
              gap={6}
              backgroundColor={active ? "$primary" : "transparent"}
            >
              <Text fontSize="$2" fontWeight="700" color={active ? "$primaryForeground" : "$textMuted"}>
                {option.label}
              </Text>
              {option.id === "duo" && duoBadge ? (
                <YStack
                  paddingHorizontal={6}
                  paddingVertical={1}
                  borderRadius={999}
                  backgroundColor={active ? "$primaryForeground" : "$primary"}
                >
                  <Text
                    fontSize={10}
                    lineHeight={13}
                    fontWeight="700"
                    color={active ? "$primary" : "$primaryForeground"}
                  >
                    NEW
                  </Text>
                </YStack>
              ) : null}
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/**
 * One filter at a time: everyone, the Garba Nights edition (free, during Navratri),
 * or a Paire Plus age-gap side (Silver Foxes & Cougars, or people into someone older).
 */
function FeedFilters({
  value,
  locked,
  canSeekYounger,
  garbaOpen,
  onChange
}: {
  value: FeedFilter;
  locked: boolean;
  /** "Into someone older" is a filter for Silver Foxes and Cougars only. */
  canSeekYounger: boolean;
  garbaOpen: boolean;
  onChange: (value: FeedFilter) => void;
}) {
  const options: Array<{ id: FeedFilter; label: string; plus: boolean; spoken: string }> = [
    { id: null, label: "Everyone", plus: false, spoken: "Everyone" },
    ...(garbaOpen || value === "garba" ? [{ id: "garba" as const, label: "🪔 Garba Nights", plus: false, spoken: "Garba Nights, free this Navratri" }] : []),
    ...AGE_GAP_FILTERS.filter((option) => option.id && (option.id !== "intoOlder" || canSeekYounger || value === "intoOlder")).map(
      (option) => ({ id: option.id, label: option.label, plus: true, spoken: `${option.label.replace(/^\S+\s/, "")}, Paire Plus` })
    )
  ];
  // One line that scrolls sideways, so the card keeps its height on small phones.
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      accessibilityLabel="Discover filters"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id ?? "all"}
            testID={option.id === "garba" ? "discover-garba" : `discover-agegap-${option.id ?? "all"}`}
            accessibilityRole="button"
            accessibilityLabel={option.spoken}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.id)}
            style={{ minHeight: 36, justifyContent: "center" }}
          >
            <XStack
              paddingHorizontal="$3"
              paddingVertical={6}
              borderRadius={999}
              borderWidth={1}
              borderColor={active ? "$primary" : "$border"}
              backgroundColor={active ? "$primarySoft" : "transparent"}
              gap={4}
              alignItems="center"
            >
              {option.plus && locked ? <Icon name="lock-closed" size={11} color="textMuted" /> : null}
              <Text fontSize="$1" fontWeight="700" numberOfLines={1} color={active ? "$primary" : "$textMuted"}>
                {option.label}
              </Text>
            </XStack>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type MatchState = { matchId: string; profile: DiscoverProfile } | null;

function DiscoveryExperience() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<MainTabsParamList, "Discover">>();
  const me = useAuthStore((state) => state.profile);
  const settings = useAuthStore((state) => state.settings);
  const uid = useAuthStore((state) => state.user?.uid);
  const premium = useQuery({ queryKey: ["premium", uid], queryFn: fetchPremiumStatus, enabled: Boolean(uid), refetchInterval: 300_000, retry: 1 });
  const plus = premium.data?.active === true;
  // Only lock the chips once we know there's no pass; if the check fails, the server decides.
  const plusLocked = premium.isSuccess && !plus;
  // The feed filter: null shows everyone.
  const [filter, setFilter] = useState<FeedFilter>(null);
  const filterRef = useRef<FeedFilter>(null);
  filterRef.current = filter;
  // Garba Nights runs during Navratri; checked when the screen renders.
  const garbaOpen = activeGarbaSeason() !== null;
  const myGarbaNights = myUpcomingNights(settings?.garbaNights);
  const [garbaSheet, setGarbaSheet] = useState(false);
  // The season ended while the edition was on: back to everyone.
  useEffect(() => {
    if (!garbaOpen && filter === "garba") setFilter(null);
  }, [garbaOpen, filter]);
  const chooseFilter = (next: FeedFilter) => {
    if (next === "garba") {
      if (!garbaOpen) {
        showToast("Garba Nights is closed until next Navratri.");
        return;
      }
      if (!settings?.locationEnabled) {
        showToast("Garba Nights shows people near you. Turn on location first.");
        navigation.navigate("Settings");
        return;
      }
      // First pick your nights; the sheet turns the edition on once they're saved.
      if (!myGarbaNights.length) setGarbaSheet(true);
      else setFilter("garba");
      return;
    }
    if (next && premium.isLoading) return;
    if (next && plusLocked) {
      showToast("The age-gap filter comes with Paire Plus.");
      navigation.navigate("Premium");
      return;
    }
    setFilter(next);
  };
  const allowance = useQuery({ queryKey: ["daily-allowance", uid], queryFn: fetchDailyAllowance, enabled: Boolean(uid), staleTime: 30_000, retry: 1 });
  const refreshAllowance = allowance.refetch;
  useFocusEffect(useCallback(() => { if (uid) void refreshAllowance(); }, [uid, refreshAllowance]));
  useEffect(() => {
    if (!allowance.data?.resetsAt) return;
    const timer = setTimeout(() => { void refreshAllowance(); }, Math.max(1000, allowance.data.resetsAt - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [allowance.data?.resetsAt, refreshAllowance]);

  const [deck, setDeck] = useState<DiscoverProfile[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [blindMode, setBlindMode] = useState(false);
  const [lastPass, setLastPass] = useState<DiscoverProfile | null>(null);
  const [match, setMatch] = useState<MatchState>(null);
  // The note composer, for a like or Super Like with a note.
  const [compose, setCompose] = useState<{ profile: DiscoverProfile; kind: "like" | "super"; draft?: string } | null>(null);
  // A note chosen in the composer, waiting for the card's fly-out animation to report the swipe.
  const pendingNoteRef = useRef<{ uid: string; note: string | null } | null>(null);
  // The paper-aeroplane moment after a note is delivered.
  const [flight, setFlight] = useState<{ key: number; name: string } | null>(null);
  const endFlight = useCallback(() => setFlight(null), []);
  const [mode, setMode] = useState<Mode>("solo");
  const duo = useDuo();
  // "NEW" on the Duos tab until you've had a look.
  const [duosSeen, setDuosSeen] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(DUOS_SEEN_KEY)
      .then((value) => setDuosSeen(value === "1"))
      .catch(() => undefined);
  }, []);
  const changeMode = (next: Mode) => {
    setMode(next);
    if (next === "duo" && !duosSeen) {
      setDuosSeen(true);
      AsyncStorage.setItem(DUOS_SEEN_KEY, "1").catch(() => undefined);
    }
  };

  const deckRef = useRef<SwipeDeckHandle>(null);
  const cursorRef = useRef<FeedCursor | null>(null);
  const exhaustedRef = useRef(false);
  // Web, Paire Plus: once everyone new is seen, the feed carries on with people passed on before.
  const revisitRef = useRef(false);
  const [revisiting, setRevisiting] = useState(false);
  const plusRef = useRef(plus);
  plusRef.current = plus;
  const deckNowRef = useRef<DiscoverProfile[]>([]);
  deckNowRef.current = deck;
  const loadingRef = useRef(false);
  const seenRef = useRef(new Set<string>());

  // Each reset starts a new generation; pages from an older one are thrown away, so a
  // filter or preference change mid-load always wins.
  const generationRef = useRef(0);
  const load = useCallback(async (reset: boolean) => {
    if (!reset && (loadingRef.current || exhaustedRef.current)) return;
    if (reset) {
      generationRef.current += 1;
      cursorRef.current = null;
      exhaustedRef.current = false;
      revisitRef.current = false;
      setRevisiting(false);
      seenRef.current = new Set();
      setStatus("loading");
    }
    const generation = generationRef.current;
    const filter = filterRef.current;
    loadingRef.current = true;
    try {
      let fresh: DiscoverProfile[] = [];
      // A page can come back empty when everything scanned was filtered out; keep going a little.
      for (let attempt = 0; attempt < 3 && !fresh.length && !exhaustedRef.current; attempt += 1) {
        const page = await fetchFeedPage(cursorRef.current, filter, revisitRef.current);
        if (generation !== generationRef.current) return;
        fresh = page.profiles.filter((profile) => !seenRef.current.has(profile.uid));
        cursorRef.current = page.cursor;
        exhaustedRef.current = page.cursor === null;
        if (exhaustedRef.current && !revisitRef.current && !filter && plusRef.current && Platform.OS === "web") {
          // Everyone new is seen: start over, now including people passed on before (likes never return).
          revisitRef.current = true;
          setRevisiting(true);
          cursorRef.current = null;
          exhaustedRef.current = false;
          seenRef.current = new Set([...deckNowRef.current, ...fresh].map((profile) => profile.uid));
        }
      }
      fresh.forEach((profile) => seenRef.current.add(profile.uid));
      setDeck((current) => (reset ? fresh : [...current, ...fresh]));
      setExhausted(exhaustedRef.current);
      setError(null);
      setStatus("ready");
    } catch (err) {
      if (generation !== generationRef.current) return;
      const message = err instanceof Error ? err.message : "";
      if (filter === "garba" && /Garba/.test(message)) {
        // Navratri is over, or every night they picked has passed.
        showToast(friendlyError(err, "Garba Nights is off."));
        setFilter(null);
        if (/Pick the Garba nights/.test(message)) setGarbaSheet(true);
        return;
      }
      if (filter && /Paire Plus|Silver Fox/.test(message)) {
        // The pass ended (or the filter isn't open to them): show everyone again.
        showToast(friendlyError(err, "The age-gap filter is off."));
        setFilter(null);
        return;
      }
      setError(friendlyError(err, "We couldn't load profiles right now."));
      setStatus((current) => (reset || current === "loading" ? "error" : current));
    } finally {
      if (generation === generationRef.current) loadingRef.current = false;
    }
  }, []);

  // Reload from scratch whenever discovery preferences change.
  const preferencesKey = JSON.stringify([
    settings?.showMe,
    settings?.ageMin,
    settings?.ageMax,
    settings?.maxDistanceKm,
    settings?.locationEnabled,
    settings?.sharedVibesOnly,
    settings?.aiVibeMatching,
    settings?.sameIntentOnly,
    settings?.sharedLanguageOnly,
    filter,
    // Picking more Garba nights widens the Garba edition.
    filter === "garba" ? myGarbaNights.join() : null
  ]);
  useEffect(() => {
    void load(true);
  }, [load, preferencesKey]);

  // A Plus pass that starts while the deck is empty (bought from the prompt below) opens up
  // everyone passed on before straight away.
  useEffect(() => {
    if (plus && status === "ready" && exhausted && !deck.length && !revisitRef.current && !filterRef.current) void load(true);
  }, [deck.length, exhausted, load, plus, status]);

  useEffect(() => {
    if (status === "ready" && deck.length < REFILL_BELOW && !exhausted) {
      void load(false);
    }
  }, [deck.length, exhausted, load, status]);

  const handleSwipe = useCallback((profile: DiscoverProfile, type: SwipeType, explicitNote?: string | null) => {
    const pending = pendingNoteRef.current?.uid === profile.uid ? pendingNoteRef.current : null;
    pendingNoteRef.current = null;
    const note = explicitNote !== undefined ? explicitNote : pending ? pending.note : undefined;
    if (type !== "nope" && note === undefined && profile.requiresNote) {
      // "Notes only": bring the card back (remounted, so it starts centred) and ask for a note.
      setDeck((current) => current.filter((item) => item.uid !== profile.uid));
      setTimeout(() => setDeck((current) => [profile, ...current.filter((item) => item.uid !== profile.uid)]), 0);
      setCompose({ profile, kind: type === "super" ? "super" : "like" });
      return;
    }
    setDeck((current) => current.filter((item) => item.uid !== profile.uid));
    setLastPass(type === "nope" ? profile : null);
    sendSwipe(profile.uid, type, type === "nope" ? null : note)
      .then((result) => {
        void refreshAllowance();
        if (note && type !== "nope") setFlight({ key: Date.now(), name: profile.displayName });
        if (result.matched && result.matchId) {
          suppressMatchAlert(result.matchId);
          setMatch({ matchId: result.matchId, profile });
        }
      })
      .catch((err) => {
        void refreshAllowance();
        if (errorCode(err) === "functions/not-found") return; // they left or blocked you
        // Out of likes, or offline: put the card back so nothing is silently lost.
        setDeck((current) => [profile, ...current.filter((item) => item.uid !== profile.uid)]);
        setLastPass(null);
        if (note && errorCode(err) === "functions/invalid-argument") {
          // The note was refused (too long, or flagged): reopen it so they can edit, not retype.
          setCompose({ profile, kind: type === "super" ? "super" : "like", draft: note });
        }
        showToast(
          friendlyError(err, "That didn't go through. Check your connection and try again."),
          errorCode(err) === "functions/resource-exhausted" ? "info" : "error"
        );
      });
  }, [refreshAllowance]);

  const sendFromComposer = (note: string | null) => {
    const current = compose;
    setCompose(null);
    if (!current) return;
    if (mode === "solo" && deck[0]?.uid === current.profile.uid) {
      // Animate the card off; the deck then reports the swipe and picks up the note.
      pendingNoteRef.current = { uid: current.profile.uid, note };
      deckRef.current?.swipe(current.kind);
    } else {
      handleSwipe(current.profile, current.kind, note);
    }
  };

  const handleUndo = async () => {
    const profile = lastPass;
    if (!profile) return;
    setLastPass(null);
    setDeck((current) => [profile, ...current.filter((item) => item.uid !== profile.uid)]);
    try {
      await undoPass(profile.uid);
    } catch (err) {
      setDeck((current) => current.filter((item) => item.uid !== profile.uid));
      showToast(friendlyError(err, "Couldn't bring that profile back."), "error");
    }
  };

  const openProfile = useCallback(
    (profile: DiscoverProfile) => navigation.navigate("ProfileView", { source: "discover", profile }),
    [navigation]
  );

  // The full-profile screen can like/pass the card it was opened from.
  const requested = route.params?.swipe;
  useEffect(() => {
    if (!requested) return;
    navigation.setParams?.({ swipe: undefined } as never);
    if (deck[0]?.uid === requested.uid) {
      if (mode === "vibe") handleSwipe(deck[0], requested.type);
      else deckRef.current?.swipe(requested.type);
    } else {
      const profile = deck.find((item) => item.uid === requested.uid);
      if (profile) handleSwipe(profile, requested.type);
    }
    // Only react to new requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested?.nonce]);

  const top = deck[0];
  const hidden = me?.isDiscoverable === false;

  return (
    <Screen testID="discover-screen" edges={["top"]} padded={false}>
      <DiscoverWebStyles />
      <XStack testID="discover-header" paddingHorizontal="$4" alignItems="center" justifyContent="space-between" minHeight={56} marginBottom="$2">
        <YStack>
          <Text fontSize="$7" lineHeight={30} fontWeight="700" color="$primary" accessibilityRole="header">
            paire<Text color="$text">.</Text>
          </Text>
          <XStack alignItems="center" gap={4}>
            <Icon name="location-outline" size={12} color="primary" />
            <Text testID="discover-city" fontSize="$1" color="$textMuted" numberOfLines={Platform.OS === "web" ? 1 : undefined}>
              {me?.city || "Across India"}
            </Text>
          </XStack>
        </YStack>
        <XStack gap="$1">
          {mode === "solo" ? (
            <IconButton
              testID="discover-blind"
              icon={blindMode ? "eye-off" : "eye-off-outline"}
              color={blindMode ? "primary" : "text"}
              accessibilityLabel={blindMode ? "Turn off blind date mode" : "Turn on blind date mode"}
              onPress={() => {
                setBlindMode((value) => !value);
                showToast(
                  blindMode ? "Blind date off: photos are back." : "Blind date on: photos and names are hidden."
                );
              }}
            />
          ) : null}
          <IconButton testID="discover-safety" icon="shield-outline" accessibilityLabel="Open safety center" onPress={() => navigation.navigate("SafetyCenter")} />
          <IconButton
            testID="discover-preferences"
            icon="options-outline"
            accessibilityLabel="Discovery preferences"
            onPress={() => navigation.navigate("Settings")}
          />
        </XStack>
      </XStack>

      <XStack testID="discover-intro" paddingHorizontal="$4" alignItems="center" justifyContent="space-between" gap="$2" marginBottom="$3">
        <YStack flex={1}>
          {filter === "garba" && mode !== "duo" ? (
            <>
              <Text fontSize={27} lineHeight={33} fontWeight="700" accessibilityRole="header">Find your Garba Paire.</Text>
              <XStack marginTop={4} gap="$2" alignItems="center" flexWrap="wrap">
                <Text fontSize="$2" color="$textMuted">People dancing on your nights.</Text>
                <Pressable testID="discover-garba-edit" accessibilityRole="button" onPress={() => setGarbaSheet(true)} style={{ minHeight: 32, justifyContent: "center" }}>
                  <Text fontSize="$2" color="$primary" fontWeight="700">Edit my nights</Text>
                </Pressable>
              </XStack>
            </>
          ) : (
            <>
              <Text fontSize={27} lineHeight={33} fontWeight="700" accessibilityRole="header">{mode === "vibe" ? "More than a photo." : mode === "duo" ? "Better with your bestie." : "Find your Paire."}</Text>
              <Text fontSize="$2" color="$textMuted" marginTop={4}>{mode === "vibe" ? "Read their vibe. Reveal at your pace." : mode === "duo" ? "Meet people together, with mutual interest." : "People to meet, reasons to connect."}</Text>
            </>
          )}
        </YStack>
      </XStack>

      {hidden ? (
        <XStack
          testID="discover-hidden"
          marginHorizontal="$4"
          marginBottom="$2"
          padding="$3"
          borderRadius="$4"
          backgroundColor="$primarySoft"
          gap="$2"
          alignItems="center"
        >
          <Text flex={1} fontSize="$2" color="$text">
            Your profile is hidden, so new people can't see you. Turn "Show me on Paire" back on in Settings.
          </Text>
        </XStack>
      ) : null}

      <YStack testID="discover-modes" paddingBottom="$2">
        <ModeSwitch mode={mode} onChange={changeMode} duoBadge={!duosSeen && !duo.duo} />
      </YStack>

      {mode !== "duo" ? (
        <YStack testID="discover-filters" paddingBottom="$2">
          <FeedFilters value={filter} locked={plusLocked} canSeekYounger={settings?.ageGap === "older"} garbaOpen={garbaOpen} onChange={chooseFilter} />
        </YStack>
      ) : null}

      {mode === "duo" ? <DuoMode state={duo} /> : null}

      {Platform.OS !== "web" && mode !== "duo" ? <SetupNudge /> : null}

      {mode !== "duo" ? (
        <YStack testID="discover-card-area" flex={1} paddingHorizontal="$3" paddingBottom="$2">
          {status === "loading" ? (
            <CardSkeleton />
          ) : status === "error" ? (
            <EmptyState icon="cloud-offline-outline" title="Couldn't load profiles" message={error ?? undefined}>
              <PrimaryButton onPress={() => void load(true)}>Try again</PrimaryButton>
            </EmptyState>
          ) : !top && filter === "garba" ? (
            <EmptyState
              testID="discover-empty-garba"
              icon="sparkles-outline"
              title="No one else on your nights yet"
              message="Nobody near you has picked your nights yet. Try other nights, or invite your Garba group: new people pick their nights every day."
            >
              {myGarbaNights.length < Math.min(MAX_GARBA_NIGHTS, upcomingNights().length) ? (
                <PrimaryButton onPress={() => setGarbaSheet(true)}>Add more nights</PrimaryButton>
              ) : null}
              <SecondaryButton onPress={() => setFilter(null)}>Show everyone</SecondaryButton>
            </EmptyState>
          ) : !top && filter ? (
            <EmptyState
              testID="discover-empty-agegap"
              icon="sparkles-outline"
              title="No one here yet"
              message="Nobody who fits your preferences has picked this side yet. Check back soon."
            >
              <SecondaryButton onPress={() => setFilter(null)}>Show everyone</SecondaryButton>
            </EmptyState>
          ) : !top && Platform.OS === "web" ? (
            <DiscoverEmpty onReload={() => load(true)} plus={plus} revisited={revisiting} onGetPlus={() => navigation.navigate("Premium")} />
          ) : !top ? (
            <EmptyState
              testID="discover-empty"
              icon="sparkles-outline"
              title="Good connections take a little time"
              message="You've seen everyone who fits right now. New people join every day, and inviting friends brings them faster."
            >
              <PrimaryButton testID="discover-invite" onPress={() => void inviteFriends()}>
                Invite friends
              </PrimaryButton>
              <SecondaryButton onPress={() => navigation.navigate("Settings")}>Widen my preferences</SecondaryButton>
              <GhostButton onPress={() => void load(true)}>Refresh</GhostButton>
            </EmptyState>
          ) : mode === "vibe" ? (
            <VibeFirstCard key={top.uid} profile={top} onOpen={() => openProfile(top)} />
          ) : (
            <SwipeDeck
              ref={deckRef}
              profiles={deck}
              onSwipe={handleSwipe}
              onOpenProfile={openProfile}
              blindMode={blindMode}
            />
          )}
        </YStack>
      ) : null}

      {mode === "vibe" && (top || (Platform.OS !== "web" && lastPass)) ? (
        <XStack alignItems="center" gap="$2" paddingHorizontal="$4" paddingTop="$2" paddingBottom="$2">
          <IconButton testID="discover-undo" icon="arrow-undo" accessibilityLabel="Undo last pass" size={46} disabled={!lastPass} onPress={() => void handleUndo()} />
          <YStack flex={1}><SecondaryButton testID="discover-nope" disabled={!top} onPress={() => top && handleSwipe(top, "nope")}>Pass</SecondaryButton></YStack>
          <IconButton testID="discover-spark" icon="chatbubble-ellipses" accessibilityLabel="Like with a note" size={46} disabled={!top} onPress={() => top && setCompose({ profile: top, kind: "like" })} />
          <YStack flex={1}><PrimaryButton testID="discover-like" disabled={!top} leftIcon={<Icon name="heart-outline" color="primaryForeground" size={18} />} onPress={() => top && handleSwipe(top, "like")}>Like</PrimaryButton></YStack>
        </XStack>
      ) : null}

      {mode === "solo" && top && Platform.OS === "web" ? (
        <DiscoveryActions
          undoDisabled={!lastPass}
          onUndo={() => void handleUndo()}
          onPass={() => deckRef.current?.swipe("nope")}
          onSuper={() => top.requiresNote ? setCompose({ profile: top, kind: "super" }) : deckRef.current?.swipe("super")}
          onNote={() => setCompose({ profile: top, kind: "like" })}
          onLike={() => top.requiresNote ? setCompose({ profile: top, kind: "like" }) : deckRef.current?.swipe("like")}
        />
      ) : null}
      {mode === "solo" && top && Platform.OS !== "web" ? (
        <XStack justifyContent="center" alignItems="center" gap="$3" paddingTop="$2" paddingBottom="$2">
          <IconButton
            testID="discover-undo"
            icon="arrow-undo"
            accessibilityLabel="Undo last pass"
            variant="soft"
            color="warning"
            size={46}
            disabled={!lastPass}
            onPress={() => void handleUndo()}
            elevated
          />
          <IconButton
            testID="discover-nope"
            icon="close"
            accessibilityLabel="Pass"
            variant="soft"
            color="nope"
            size={64}
            iconSize={34}
            onPress={() => deckRef.current?.swipe("nope")}
            elevated
          />
          <IconButton
            testID="discover-super"
            icon="star"
            accessibilityLabel="Super Like"
            variant="soft"
            color="superLike"
            size={52}
            iconSize={26}
            onPress={() => (top.requiresNote ? setCompose({ profile: top, kind: "super" }) : deckRef.current?.swipe("super"))}
            elevated
          />
          <IconButton
            testID="discover-spark"
            icon="chatbubble-ellipses"
            accessibilityLabel="Like with a note"
            variant="soft"
            color="primary"
            size={52}
            iconSize={24}
            onPress={() => top && setCompose({ profile: top, kind: "like" })}
            elevated
          />
          <IconButton
            testID="discover-like"
            icon="heart"
            accessibilityLabel="Like"
            variant="soft"
            color="primary"
            size={64}
            iconSize={32}
            onPress={() => (top.requiresNote ? setCompose({ profile: top, kind: "like" }) : deckRef.current?.swipe("like"))}
            elevated
          />
        </XStack>
      ) : null}

      {mode !== "duo" && (Platform.OS !== "web" || top) ? (
        <XStack testID="discover-footer" paddingHorizontal="$4" paddingBottom="$2" gap="$3" alignItems="center" justifyContent="space-between">
          <Pressable accessibilityRole="button" accessibilityLabel="How vibe matching works" onPress={() => navigation.navigate("VibeGuide")} style={{ minHeight: 44, justifyContent: "center", flex: 1 }}>
            <XStack gap={5} alignItems="center"><Icon name="sparkles-outline" size={14} color="primary" /><Text color="$textMuted" fontSize="$1">Behind the vibe</Text></XStack>
          </Pressable>
          <Pressable testID="discover-premium" accessibilityRole="button" accessibilityLabel="View daily limits and premium plans" onPress={() => navigation.navigate("Premium")} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text color="$primary" fontSize="$1" fontWeight="700">{allowance.data && !allowance.isError ? `${allowance.data.remaining.likes} likes left today` : "Free daily likes · Plus from ₹20"}</Text>
          </Pressable>
        </XStack>
      ) : null}

      {Platform.OS === "web" && mode !== "duo" && top ? <SetupNudge /> : null}

      <GarbaSheet
        visible={garbaSheet && garbaOpen}
        onClose={() => setGarbaSheet(false)}
        onSaved={() => {
          setGarbaSheet(false);
          setFilter("garba");
          showToast("You're in! Showing people going on your nights. 🪔", "success");
        }}
      />

      <NoteFlight flightKey={flight?.key ?? null} name={flight?.name ?? ""} onDone={endFlight} />

      {compose ? (
        <SparkComposer profile={compose.profile} kind={compose.kind} draft={compose.draft} onSend={sendFromComposer} onClose={() => setCompose(null)} />
      ) : null}

      <MatchMoment
        visible={Boolean(match)}
        me={{ name: me?.displayName ?? "You", photoUrl: me?.photoUrls?.[0] }}
        them={{ name: match?.profile.displayName ?? "", photoUrl: match?.profile.photoUrls[0] }}
        onClose={() => setMatch(null)}
        onMessage={() => {
          if (!match) return;
          setMatch(null);
          navigation.navigate("Chat", {
            matchId: match.matchId,
            otherUid: match.profile.uid,
            name: match.profile.displayName,
            photoUrl: match.profile.photoUrls[0] ?? null
          });
        }}
      />
    </Screen>
  );
}

export function DiscoverScreen() {
  return <VerificationGate><DiscoveryExperience /></VerificationGate>;
}
