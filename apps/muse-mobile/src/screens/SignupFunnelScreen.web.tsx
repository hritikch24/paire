import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { SecondaryButton } from "../components/MuseButton";
import { EmptyState, LoadingView } from "../components/States";
import { auth, callFunction } from "../services/firebase";
import { friendlyError } from "../services/errors";

type Row = { email: string; status: "waiting" | "sent" | "returned" | "failed"; signedUpAt: number | null; likeSentAt: number | null; lastActiveAt: number | null; reason: string | null };
type Funnel = { enabled: boolean; delayMinutes: number; rows: Row[]; sent: number; returned: number };
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "–");
const LABEL: Record<Row["status"], string> = { waiting: "Like not sent yet", sent: "Like sent · hasn't come back", returned: "Came back after the like ✓", failed: "Not sent" };

export function SignupFunnelScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { void auth.currentUser?.getIdTokenResult().then(({ claims }) => setAllowed(claims.moderator === true && claims.supportAccess === true)).catch(() => setAllowed(false)); }, []);
  const query = useQuery({ queryKey: ["admin-signup-funnel", auth.currentUser?.uid], queryFn: () => callFunction<Funnel>("adminGetSignupFunnel", undefined, 30_000), enabled: allowed === true, staleTime: 15_000, retry: false });
  const data = query.data;
  return <Screen scroll header={<ScreenHeader title="Signup test funnel" />}>
    {allowed === null ? <LoadingView /> : !allowed ? <EmptyState icon="lock-closed-outline" title="Owner access required" message="Sign in with your owner account to see the signup funnel." /> : <YStack gap="$3" paddingVertical="$3">
      <Text color="$textMuted" lineHeight={22}>Allowlisted test signups only. Each gets one like from the test sender about {data?.delayMinutes ?? 5} minutes after finishing onboarding. “Came back” means they were active after that like.</Text>
      {query.isLoading ? <LoadingView /> : null}
      {data ? <>
        <YStack testID="signup-funnel-summary" padding="$3" gap="$2" borderRadius={18} backgroundColor="$primarySoft">
          <Text fontSize="$6" fontWeight="700">{data.returned} of {data.sent} came back</Text>
          <Text fontSize="$2" color="$textMuted">{data.enabled ? "Test likes are ON." : "Test likes are OFF (runtime/testLike.enabled)."}</Text>
        </YStack>
        {data.rows.map((row) => <YStack key={row.email + row.signedUpAt} padding="$3" gap={4} borderWidth={1} borderColor="$border" borderRadius={18}>
          <Text selectable fontWeight="700">{row.email}</Text>
          <Text color={row.status === "returned" ? "$success" : "$text"}>{LABEL[row.status]}</Text>
          <Text fontSize="$2" color="$textMuted">Signed up {when(row.signedUpAt)} · like {when(row.likeSentAt)} · last active {when(row.lastActiveAt)} IST</Text>
          {row.reason ? <Text fontSize="$2" color="$textMuted">Reason: {row.reason}</Text> : null}
        </YStack>)}
        {!data.rows.length ? <Text>No test signups yet.</Text> : null}
      </> : null}
      {query.error ? <Text color="$error">{friendlyError(query.error, "Couldn't load the funnel.")}</Text> : null}
      <SecondaryButton disabled={query.isFetching} onPress={() => void query.refetch()}>Refresh</SecondaryButton>
    </YStack>}
  </Screen>;
}
