import { useEffect, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Text, XStack, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { EmptyState, LoadingView } from "../components/States";
import { auth, callFunction } from "../services/firebase";
import { Alert } from "../services/dialog";
import { friendlyError } from "../services/errors";
import type { AppStackParamList } from "../navigation/types";

type Summary = { checked: number; ready: number; attempted: number; acceptedMembers: number; acceptedPushes: number; failedPushes: number; errors: number; stopped: boolean; skipped: Record<string, number>; samples: Array<{ title: string; body: string }> };
type Run = { id: string; createdAt: number; status: string; summary?: Summary };
type ConsoleData = { checkedAt: number; automationEnabled: boolean; schedule: string; registeredBrowsers: number; registeredMembers: number; reminderOptIns: number; reachableMembers: number; preview: Summary; week: { attempts: number; acceptedMembers: number; opens: number }; history: Run[] };
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const reasons: Record<string, string> = { "no-browser": "Browser setup missing", "not-opted-in": "Reminder preference off", "activity-or-frequency": "Recently active or frequency limit", unavailable: "Unavailable, staff or test account", "no-profiles": "No relevant profiles", "changed-or-capped": "Eligibility changed" };
function Stat({ label, value }: { label: string; value: number }) {
  return <YStack flexGrow={1} flexBasis={120} padding="$3" borderRadius={16} backgroundColor="$backgroundSoft"><Text fontSize="$7" fontWeight="700">{value}</Text><Text fontSize="$2" color="$textMuted">{label}</Text></YStack>;
}

export function AdminNotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState("");
  const pending = useRef<string | null>(null);
  const pendingKey = `paire.reminderRun.${auth.currentUser?.uid ?? ""}`;
  useEffect(() => {
    void auth.currentUser?.getIdTokenResult().then(({ claims }) => setAllowed(claims.moderator === true && claims.supportAccess === true)).catch(() => setAllowed(false));
    try { pending.current = sessionStorage.getItem(pendingKey); } catch { /* In-memory reference still protects retries. */ }
  }, [pendingKey]);
  const consoleQuery = useQuery({ queryKey: ["admin-notifications", auth.currentUser?.uid], queryFn: () => callFunction<ConsoleData>("adminGetNotificationConsole", undefined, 120_000), enabled: allowed === true, staleTime: 60_000, retry: false });
  const data = consoleQuery.data;
  const send = async () => {
    if (busy) return;
    setBusy(true); setError(""); setResult("");
    pending.current ??= crypto.randomUUID();
    try { sessionStorage.setItem(pendingKey, pending.current); } catch { /* Keep the same in-memory reference. */ }
    try {
      const run = await callFunction<Run>("adminSendReminderRun", { requestId: pending.current }, 600_000);
      if (run.status === "running") setResult("This run is still in progress. Refresh the audience/history to check its result. Retrying uses the same reference.");
      else {
        setResult(run.status === "complete" ? `Run complete: ${run.summary?.attempted ?? 0} members attempted; ${run.summary?.acceptedMembers ?? 0} accepted by a push service.` : `Run ${run.status}. Check the history before starting another run.`);
        pending.current = null;
        try { sessionStorage.removeItem(pendingKey); } catch { /* Already acknowledged. */ }
      }
      await consoleQuery.refetch();
    } catch (failure) { setError(friendlyError(failure, "Couldn't finish checking this run. Retry uses the same reference and won't resend it.")); }
    finally { setBusy(false); }
  };
  const reviewSend = () => Alert.alert("Send eligible reminders now?", `${data?.preview.ready ?? 0} members are ready in this preview. The server rechecks permissions, activity, profiles and the two-per-week limit before sending.`, [{ text: "Cancel", style: "cancel" }, { text: "Send now", onPress: () => void send() }]);
  const test = async () => {
    setBusy(true); setError(""); setResult("");
    try {
      const receipt = await callFunction<{ accepted: number; failed: number }>("adminSendNotificationTest");
      setResult(receipt.accepted ? `Test accepted for ${receipt.accepted} of your registered browsers. Look for “Paire test notification”. Device display depends on browser/OS settings.` : "No browser accepted the test. Enable notifications for your owner account, then try again.");
    } catch (failure) { setError(friendlyError(failure, "Couldn't send your test notification.")); }
    finally { setBusy(false); }
  };
  return <Screen scroll header={<ScreenHeader title="Notifications" />}>
    {allowed === null ? <LoadingView /> : !allowed ? <EmptyState icon="lock-closed-outline" title="Owner access required" message="Sign in with your owner account to manage reminders." /> : <YStack gap="$4" paddingVertical="$3">
      <Text fontSize="$6" fontWeight="700">Bring people back to Paire</Text>
      <Text color="$textMuted" lineHeight={22}>Match and message alerts follow real activity. People & events reminders go to opted-in browsers when there are relevant profiles to explore.</Text>
      {consoleQuery.isLoading ? <LoadingView /> : null}
      {data ? <>
        <YStack testID="notification-audience" gap="$3">
          <XStack gap="$2" flexWrap="wrap"><Stat label="Registered members" value={data.registeredMembers} /><Stat label="Reminder opt-ins" value={data.reminderOptIns} /></XStack>
          <XStack gap="$2" flexWrap="wrap"><Stat label="Opted in + browser" value={data.reachableMembers} /><Stat label="Eligible right now" value={data.preview.ready} /></XStack>
          <Text fontSize="$2" color="$textMuted">Checked {when(data.checkedAt)} · {data.registeredBrowsers} registered browsers</Text>
        </YStack>
        <YStack padding="$3" gap="$2" borderRadius={16} backgroundColor="$primarySoft">
          <Text fontWeight="700">Automatic reminders: {data.automationEnabled ? "on" : "off"}</Text>
          <Text>{data.schedule} · up to 2 attempts a week, at least 72 hours apart.</Text>
          {!data.reachableMembers ? <Text testID="notification-no-audience">Nobody has both steps completed yet. Members can use Settings → Browser notifications → Enable reminders.</Text> : null}
        </YStack>
        <YStack gap="$2"><Text fontWeight="700">Reminder preview</Text>
          {data.preview.samples.length ? data.preview.samples.map(sample => <YStack key={sample.title} gap="$1" padding="$3" borderRadius={16} borderWidth={1} borderColor="$border"><Text fontWeight="700">{sample.title}</Text><Text color="$textMuted" lineHeight={21}>{sample.body}</Text></YStack>) : <Text color="$textMuted">No eligible recipients right now. A reminder needs completed setup, relevant profiles and room within the activity/frequency limits.</Text>}
          {Object.entries(data.preview.skipped).map(([reason, count]) => <Text key={reason} fontSize="$2" color="$textMuted">{reasons[reason] ?? reason}: {count}</Text>)}
          {data.preview.errors ? <Text color="$error">{data.preview.errors} eligibility checks failed. Refresh before sending.</Text> : null}
        </YStack>
        <PrimaryButton testID="notification-send-run" loading={busy} disabled={!data.automationEnabled || (!data.preview.ready && !pending.current)} onPress={reviewSend}>Send eligible reminders now</PrimaryButton>
        <SecondaryButton testID="notification-refresh" disabled={busy || consoleQuery.isFetching} onPress={() => void consoleQuery.refetch()}>Refresh audience & history</SecondaryButton>
        <XStack gap="$3" flexWrap="wrap"><Stat label="Attempts · 7 days" value={data.week.attempts} /><Stat label="Accepted · 7 days" value={data.week.acceptedMembers} /><Stat label="Opens · 7 days" value={data.week.opens} /></XStack>
        <Text fontSize="$2" color="$textMuted">Push-service acceptance does not confirm display or reading. Opens count clicks on the latest reminder.</Text>
        <YStack gap="$2"><Text fontWeight="700">Recent manual runs</Text>{data.history.length ? data.history.map(run => <YStack key={run.id} padding="$3" gap="$1" borderRadius={16} backgroundColor="$backgroundSoft"><Text>{when(run.createdAt)} · {run.status}</Text><Text fontSize="$2" color="$textMuted">{run.summary?.attempted ?? 0} attempted · {run.summary?.acceptedMembers ?? 0} accepted · {run.summary?.failedPushes ?? 0} failed pushes · {run.summary?.errors ?? 0} errors</Text></YStack>) : <Text color="$textMuted">No manual runs yet.</Text>}</YStack>
      </> : null}
      <SecondaryButton testID="notification-self-test" disabled={busy} onPress={() => void test()}>Send test to my browsers</SecondaryButton>
      <SecondaryButton onPress={() => navigation.navigate("Settings")}>Open notification settings</SecondaryButton>
      {result ? <Text testID="notification-result" accessibilityLiveRegion="polite" lineHeight={22}>{result}</Text> : null}
      {error || consoleQuery.error ? <Text color="$error" accessibilityLiveRegion="polite">{error || friendlyError(consoleQuery.error, "Couldn't load the notification console.")}</Text> : null}
    </YStack>}
  </Screen>;
}
