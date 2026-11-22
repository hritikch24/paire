import { useState } from "react";
import { Pressable } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, XStack, YStack, useTheme } from "tamagui";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { Icon } from "../components/Icon";
import { Chip } from "../components/Chip";
import { PrimaryButton, SecondaryButton, GhostButton } from "../components/MuseButton";
import { TextField } from "../components/MuseInput";
import { LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { useWeddingSpots } from "../hooks/useWeddingSpots";
import { friendlyError } from "../services/errors";
import { Alert } from "../services/dialog";
import { pickPhoto, uploadWeddingInvite } from "../services/photoService";
import { isSupportView } from "../services/supportMode";
import {
  blockWeddingGuest, fetchWeddingGuests, joinWedding, leaveWedding, reportWeddingGuest, sendNod,
  type WeddingCard, type WeddingSide, type WeddingSpot
} from "../services/weddingService";
import { REPORT_REASONS, type ReportReason } from "../types/models";
import type { AppStackParamList } from "../navigation/types";

type Navigation = NativeStackNavigationProp<AppStackParamList>;
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const sideLabel = (side: WeddingSide) => (side === "bride" ? "Bride's side" : "Groom's side");

const PRIVACY = "Attendance is self-declared. Paire doesn't verify that anyone is at the wedding. Nodding is secret: nobody is told unless you both nod. We don't store your location. Meet in public and use Report or Block if anything feels off.";

function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const theme = useTheme();
  return <YStack gap="$1">
    <Text fontWeight="600" fontSize="$2">Wedding date</Text>
    <input
      data-testid="wedding-date" aria-label="Wedding date" type="date" value={value} min={daysFromNow(-6)} max={daysFromNow(180)}
      onChange={(event) => onChange(event.target.value)}
      style={{ minHeight: 54, borderRadius: 16, border: `1px solid ${theme.border?.val ?? "#ddd"}`, background: theme.backgroundStrong?.val ?? "#fff", color: theme.color?.val ?? "#222", padding: "0 16px", font: "inherit", boxSizing: "border-box", width: "100%" }}
    />
    <Text fontSize="$1" color="$textMuted"> </Text>
  </YStack>;
}

function AddWedding({ onDone }: { onDone: (spot: WeddingSpot) => void }) {
  const [bride, setBride] = useState(""), [groom, setGroom] = useState(""), [date, setDate] = useState(""), [pin, setPin] = useState("");
  const [side, setSide] = useState<WeddingSide | null>(null), [clue, setClue] = useState("");
  const [invitePath, setInvitePath] = useState<string | null>(null), [uploading, setUploading] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = bride.trim().length > 1 && groom.trim().length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^[1-9]\d{5}$/.test(pin) && side !== null && clue.trim().length >= 3;
  const pickInvite = async () => {
    setUploading(true);
    try {
      const photo = await pickPhoto();
      if (photo) { setInvitePath(await uploadWeddingInvite(photo)); showToast("Invitation photo added. Only Paire's safety team can see it.", "success"); }
    } catch (failure) { showToast(friendlyError(failure, "Couldn't add the photo. Please try again."), "error"); }
    finally { setUploading(false); }
  };
  const submit = async () => {
    if (!ready || saving || !side) return;
    setSaving(true); setError(null);
    try {
      const { spot } = await joinWedding({ brideName: bride, groomName: groom, date, pin, side, clue, invitePath });
      showToast("You're in. Your spot is saved.", "success");
      onDone(spot);
    } catch (failure) { setError(friendlyError(failure, "Couldn't add this wedding. Please try again.")); }
    finally { setSaving(false); }
  };
  return <YStack gap="$3" padding="$4" borderRadius={22} borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong">
    <Text fontSize="$5" fontWeight="700">Add your wedding</Text>
    <Text color="$textMuted" lineHeight={21}>Type the details as you know them. Other guests who type the same details land in the same wedding. You'll never see a list of weddings.</Text>
    <TextField testID="wedding-bride" label="Bride's first name" value={bride} onChangeText={setBride} maxLength={24} autoCapitalize="words" />
    <TextField testID="wedding-groom" label="Groom's first name" value={groom} onChangeText={setGroom} maxLength={24} autoCapitalize="words" />
    <DateField value={date} onChange={setDate} />
    <TextField testID="wedding-pin" label="Venue PIN code" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} helper="Six digits. Only used to find the same wedding." />
    <YStack gap="$2"><Text fontWeight="600" fontSize="$2">Your side</Text>
      <XStack gap="$2"><Chip testID="wedding-side-bride" label="Bride's side" selected={side === "bride"} onPress={() => setSide("bride")} /><Chip testID="wedding-side-groom" label="Groom's side" selected={side === "groom"} onPress={() => setSide("groom")} /></XStack></YStack>
    <TextField testID="wedding-clue" label="Spot me" placeholder="e.g. navy sherwani near the stage" value={clue} onChangeText={setClue} maxLength={60} showCount helper="What you're wearing or where you'll be. No name, phone, handle, link or location." />
    <YStack gap="$2">
      <Text fontWeight="600" fontSize="$2">Photo of the invitation (optional)</Text>
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>Helps our safety team check a wedding is real. Other guests never see it. Deleted after 30 days.</Text>
      <SecondaryButton testID="wedding-invite-pick" loading={uploading} onPress={() => void pickInvite()}>{invitePath ? "Change invitation photo" : "Add invitation photo"}</SecondaryButton>
      {invitePath ? <Text testID="wedding-invite-added" color="$primary" fontSize="$2">Invitation photo added.</Text> : null}
    </YStack>
    {error ? <Text testID="wedding-error" color="$error">{error}</Text> : null}
    <PrimaryButton testID="wedding-join" disabled={!ready} loading={saving} onPress={() => void submit()}>Join this wedding</PrimaryButton>
  </YStack>;
}

export function WeddingNodsScreen() {
  const navigation = useNavigation<Navigation>();
  const { spots, failed } = useWeddingSpots();
  const [adding, setAdding] = useState(false);
  const open = (spots ?? []).filter((spot) => spot.closesAt > Date.now());
  const showForm = adding || (spots !== null && open.length === 0);
  return <Screen scroll header={<ScreenHeader title="Going to a wedding?" />}>
    <YStack gap="$4" paddingTop="$2">
      <YStack gap="$2"><Text fontSize="$8" fontWeight="700" lineHeight={38}>Shaadi mein ek nod.</Text><Text color="$textMuted" lineHeight={22}>Going to the same wedding as someone you'd like to know? Give a secret nod. If they nod you back, you match. If not, nobody ever knows. No group chat, no host, no family watching.</Text></YStack>
      {isSupportView ? <Text color="$textMuted">Support sessions are read-only.</Text> : null}
      {spots === null && !failed ? <LoadingView /> : null}
      {failed ? <Text color="$error">Couldn't load your weddings. Please try again.</Text> : null}
      {open.length ? <YStack gap="$2"><Text fontSize="$5" fontWeight="700">Your weddings</Text>
        {open.map((spot) => <Pressable key={spot.weddingId} testID={`wedding-spot-${spot.weddingId}`} accessibilityRole="button" accessibilityLabel={`Open ${spot.label}`} onPress={() => navigation.push("Wedding", { weddingId: spot.weddingId })}>
          <XStack alignItems="center" gap="$3" padding="$3" borderRadius={18} borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong">
            <YStack width={42} height={42} alignItems="center" justifyContent="center" backgroundColor="$primarySoft" borderRadius={14}><Icon name="heart-outline" color="primary" size={22} /></YStack>
            <YStack flex={1} minWidth={0} gap={3}><Text fontWeight="700">{spot.label}</Text><Text color="$textMuted" fontSize="$2">{dateLabel(spot.date)} · {spot.active ? `You are ${spot.nickname}` : "You left"}</Text></YStack>
            <Icon name="chevron-forward" size={18} color="textMuted" />
          </XStack></Pressable>)}
      </YStack> : null}
      {!isSupportView && showForm ? <AddWedding onDone={(spot) => { setAdding(false); navigation.push("Wedding", { weddingId: spot.weddingId }); }} /> : null}
      {!isSupportView && !showForm ? <SecondaryButton testID="wedding-add-open" onPress={() => setAdding(true)}>Add another wedding</SecondaryButton> : null}
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>{PRIVACY}</Text>
    </YStack>
  </Screen>;
}

function GuestCard({ card, nodsLeft, busy, onNod, onReport, onBlock }: { card: WeddingCard; nodsLeft: number; busy: boolean; onNod: () => void; onReport: (reason: ReportReason) => void; onBlock: () => void }) {
  const [more, setMore] = useState(false);
  return <YStack testID={`wedding-card-${card.cardId}`} gap="$2" padding="$3" borderRadius={20} borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong">
    <XStack alignItems="center" justifyContent="space-between" gap="$2"><Text fontSize="$5" fontWeight="700" flex={1}>{card.nickname}</Text>
      <Pressable testID={`wedding-more-${card.cardId}`} accessibilityRole="button" accessibilityLabel={`Report or block ${card.nickname}`} onPress={() => setMore(!more)}><Icon name="ellipsis-horizontal" size={20} color="textMuted" /></Pressable></XStack>
    <XStack gap="$2" flexWrap="wrap"><Chip size="sm" label={sideLabel(card.side)} /><Chip size="sm" label={`Age ${card.ageBand}`} /></XStack>
    <Text color="$textMuted">“{card.clue}”</Text>
    <PrimaryButton testID={`wedding-nod-${card.cardId}`} disabled={card.nodded || nodsLeft <= 0 || busy} onPress={onNod}>{card.nodded ? "Nodded ✓ (secret)" : nodsLeft <= 0 ? "No nods left" : "Give a nod"}</PrimaryButton>
    {more ? <YStack gap="$2" paddingTop="$2">
      <Text fontSize="$2" fontWeight="700">Report {card.nickname} (they won't know it was you; you'll also block them)</Text>
      <XStack gap="$2" flexWrap="wrap">{REPORT_REASONS.filter((reason) => reason.id !== "offline_behavior").map((reason) => <Chip key={reason.id} size="sm" testID={`wedding-report-${reason.id}-${card.cardId}`} label={reason.label} onPress={() => onReport(reason.id)} />)}</XStack>
      <GhostButton testID={`wedding-block-${card.cardId}`} alignSelf="flex-start" onPress={onBlock}>Just block</GhostButton>
    </YStack> : null}
  </YStack>;
}

export function WeddingScreen() {
  const navigation = useNavigation<Navigation>();
  const { weddingId } = useRoute<RouteProp<AppStackParamList, "Wedding">>().params;
  const { spots } = useWeddingSpots();
  const spot = spots?.find((item) => item.weddingId === weddingId);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false), [matchId, setMatchId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["wedding-guests", weddingId], queryFn: () => fetchWeddingGuests(weddingId), staleTime: 0, refetchOnMount: "always", retry: false, enabled: spot?.active !== false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["wedding-guests", weddingId] });
  const act = async (work: () => Promise<void>, failure: string) => {
    if (busy || isSupportView) return;
    setBusy(true);
    try { await work(); } catch (error) { showToast(friendlyError(error, failure), "error"); }
    finally { setBusy(false); }
  };
  const nod = (card: WeddingCard) => act(async () => {
    const result = await sendNod(weddingId, card.cardId);
    if (result.matched && result.matchId) { setMatchId(result.matchId); showToast("It's a match!", "success"); }
    else showToast("Nod sent. Nobody is told unless they nod you back.", "success");
    await refresh();
  }, "Couldn't send that nod. Please try again.");
  const report = (card: WeddingCard, reason: ReportReason) => act(async () => {
    await reportWeddingGuest(weddingId, card.cardId, reason, reason === "other" ? "Reported from a wedding card" : "");
    showToast("Reported and blocked. Thank you.", "success"); await refresh();
  }, "Couldn't send the report. Please try again.");
  const block = (card: WeddingCard) => act(async () => { await blockWeddingGuest(weddingId, card.cardId); showToast("Blocked.", "success"); await refresh(); }, "Couldn't block. Please try again.");
  const leave = () => Alert.alert("Leave this wedding?", "Your card disappears and your clue is erased. Nods you already used stay counted if you come back.", [
    { text: "Stay", style: "cancel" },
    { text: "Leave", style: "destructive", onPress: () => void act(async () => { await leaveWedding(weddingId); await refresh(); showToast("You left the wedding.", "success"); navigation.goBack(); }, "Couldn't leave. Please try again.") }
  ]);
  const data = query.data;
  const nodsLeft = data && "nodsLeft" in data ? data.nodsLeft : Math.max(0, (spot?.nodsTotal ?? 3) - (spot?.nodsUsed ?? 0));
  return <Screen scroll header={<ScreenHeader title={spot?.label ?? "Wedding"} />}>
    <YStack gap="$3" paddingTop="$2">
      {spot ? <YStack gap="$2" padding="$4" borderRadius={22} backgroundColor="$primarySoft">
        <Text fontSize="$2" color="$textMuted">{dateLabel(spot.date)} · closes a week later</Text>
        <Text testID="wedding-my-nickname" fontSize="$6" fontWeight="700">You're {spot.nickname}</Text>
        <XStack gap="$2" flexWrap="wrap"><Chip size="sm" label={sideLabel(spot.side)} /><Chip size="sm" label={`Age ${spot.ageBand}`} /></XStack>
        {spot.active ? <Text color="$textMuted">“{spot.clue}”</Text> : <Text color="$textMuted">You left this wedding.</Text>}
        <Text testID="wedding-nods-left" fontWeight="700">{nodsLeft} of {spot.nodsTotal} nods left</Text>
      </YStack> : null}
      {matchId ? <YStack testID="wedding-match-banner" gap="$2" padding="$4" borderRadius={22} borderWidth={2} borderColor="$primary" backgroundColor="$backgroundStrong">
        <Text fontSize="$6" fontWeight="700">It's a match! ✨</Text><Text color="$textMuted">You both nodded. Say hello in chat.</Text>
        <PrimaryButton testID="wedding-open-chat" onPress={() => navigation.navigate("Chat", { matchId })}>Open chat</PrimaryButton></YStack> : null}
      {spot && !spot.active ? <PrimaryButton onPress={() => navigation.navigate("WeddingNods")}>Add this wedding again</PrimaryButton> : null}
      {query.isLoading ? <LoadingView /> : null}
      {query.error ? <Text color="$error">{friendlyError(query.error, "Couldn't load the guests. Please try again.")}</Text> : null}
      {data?.status === "joining" ? <YStack testID="wedding-joining" gap="$2" padding="$4" borderRadius={20} borderWidth={1} borderColor="$border"><Text fontSize="$5" fontWeight="700">Guests are still joining</Text><Text color="$textMuted" lineHeight={21}>Cards appear once enough guests have joined, so nobody stands out. Share Paire with friends going to the wedding, then check back.</Text></YStack> : null}
      {data?.status === "closed" ? <Text testID="wedding-closed">This wedding has closed. Nods and nicknames are deleted a week after the wedding. Matches stay.</Text> : null}
      {data?.status === "unavailable" ? <Text testID="wedding-unavailable">This wedding isn't available.</Text> : null}
      {data?.status === "ready" ? <YStack gap="$3">
        {data.guests.length ? <Text color="$textMuted">Anonymous guests who fit your preferences. Nobody sees names or photos until you both nod.</Text> : <YStack gap="$2"><Text testID="wedding-empty" fontSize="$5" fontWeight="700">Nobody to show right now.</Text><Text color="$textMuted">No guests fit your preferences yet. Check back closer to the day.</Text></YStack>}
        {data.guests.map((card) => <GuestCard key={card.cardId} card={card} nodsLeft={nodsLeft} busy={busy} onNod={() => void nod(card)} onReport={(reason) => void report(card, reason)} onBlock={() => void block(card)} />)}
      </YStack> : null}
      <SecondaryButton testID="wedding-refresh" loading={query.isRefetching} onPress={() => void query.refetch()}>Refresh</SecondaryButton>
      {spot?.active ? <GhostButton testID="wedding-leave" alignSelf="flex-start" onPress={leave}>Leave this wedding</GhostButton> : null}
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>{PRIVACY}</Text>
    </YStack>
  </Screen>;
}
