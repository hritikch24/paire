import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { TextField } from "./MuseInput";
import { auth, callFunction } from "../services/firebase";
import { openSupportView } from "../services/openSupportView";
import { errorCode, friendlyError } from "../services/errors";

type Session = { id: string; actorUid: string; reason: string; startedAt: number; expiresAt: number; endedAt: number | null };
export function MemberSupportTools({ uid }: { uid: string }) {
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void auth.currentUser?.getIdTokenResult().then(({ claims }) => setAllowed(claims.moderator === true && claims.supportAccess === true)).catch(() => undefined);
  }, []);
  const history = useQuery({ queryKey: ["support-history", uid], queryFn: () => callFunction<{ sessions: Session[] }>("adminGetSupportHistory", { uid }), enabled: allowed });
  if (!allowed) return null;
  const start = async () => {
    setBusy(true); setError("");
    try { await openSupportView(uid, reason.trim()); setReason(""); await history.refetch(); }
    catch (failure) { setError(failure instanceof Error && !errorCode(failure) ? failure.message : friendlyError(failure, "Couldn't open support access.")); }
    finally { setBusy(false); }
  };
  const end = async (sessionId: string) => {
    setBusy(true); setError("");
    try { await callFunction("adminEndSupportSession", { sessionId }); await history.refetch(); }
    catch (failure) { setError(friendlyError(failure, "Couldn't end support access.")); }
    finally { setBusy(false); }
  };
  return <YStack gap="$2" padding="$3" borderRadius="$4" borderWidth={1} borderColor="$border">
    <Text fontWeight="700">Support access</Text>
    <Text fontSize="$2" lineHeight={20}>Open this member's app in a separate tab to investigate their reported issue. Access lasts 15 minutes and is read-only, including chats. Your admin account stays signed in.</Text>
    <TextField testID="support-reason" label="Support reason or ticket reference" value={reason} onChangeText={setReason} maxLength={500} placeholder="Example: Ticket 104 — matches won't load" helper="Required, 10–500 characters. Recorded with your account and the session time. Avoid copying sensitive message content here." />
    <PrimaryButton testID="support-start" loading={busy} disabled={reason.trim().length < 10} onPress={() => void start()}>View as member</PrimaryButton>
    {error ? <Text color="$error" accessibilityLiveRegion="polite">{error}</Text> : null}
    <Text fontWeight="700" marginTop="$2">Recent support sessions</Text>
    {history.isLoading ? <Text>Loading history…</Text> : null}
    {history.isError ? <SecondaryButton onPress={() => void history.refetch()}>Retry support history</SecondaryButton> : null}
    {history.data?.sessions.length === 0 ? <Text fontSize="$2" color="$textMuted">No support sessions recorded.</Text> : null}
    {history.data?.sessions.map((session) => <YStack key={session.id} gap="$1" paddingVertical="$2" borderTopWidth={1} borderTopColor="$border">
      <Text fontSize="$2">{session.reason}</Text>
      <Text fontSize="$1" color="$textMuted" selectable>{new Date(session.startedAt).toLocaleString("en-IN")} · Admin {session.actorUid}</Text>
      <Text fontSize="$1">{session.endedAt ? "Ended" : session.expiresAt <= Date.now() ? "Expired" : "Active"}</Text>
      {!session.endedAt && session.expiresAt > Date.now() ? <SecondaryButton disabled={busy} onPress={() => void end(session.id)}>End session</SecondaryButton> : null}
    </YStack>)}
  </YStack>;
}
