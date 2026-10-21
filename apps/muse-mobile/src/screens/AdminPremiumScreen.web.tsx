import { useEffect, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Text, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState, LoadingView } from "../components/States";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { TextField } from "../components/MuseInput";
import { auth, callFunction } from "../services/firebase";
import { friendlyError } from "../services/errors";
import { queryClient } from "../services/queryClient";
import type { AppStackParamList } from "../navigation/types";

type Preview = { uid: string; email: string; name: string; addedDays: number; startsAt: number; expiresAt: number };
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The public metrics link opens this authenticated, owner-only form. */
export function AdminPremiumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ email: string; expiresAt: number } | null>(null);
  const requestId = useRef<string | null>(null);
  const pendingKey = `paire.plusGrant.pending.${auth.currentUser?.uid ?? ""}`;
  useEffect(() => {
    void auth.currentUser?.getIdTokenResult().then(({ claims }) => setAllowed(claims.moderator === true && claims.supportAccess === true)).catch(() => setAllowed(false));
  }, []);
  const lookup = async () => {
    setBusy(true); setError(""); setDone(null);
    try {
      const result = await callFunction<Preview>("adminPreviewPlusGrant", { email: email.trim() });
      let pending: { email?: string; requestId?: string } = {};
      try { pending = JSON.parse(sessionStorage.getItem(pendingKey) || "{}"); } catch { /* Start a new reference if storage is unavailable. */ }
      requestId.current = pending.email === result.email && typeof pending.requestId === "string" ? pending.requestId : crypto.randomUUID();
      try { sessionStorage.setItem(pendingKey, JSON.stringify({ email: result.email, requestId: requestId.current })); } catch { /* The in-memory reference still protects retries. */ }
      setPreview(result);
    } catch (failure) { setError(friendlyError(failure, "Couldn't look up this member.")); }
    finally { setBusy(false); }
  };
  const grant = async () => {
    if (!preview || !requestId.current || busy) return;
    setBusy(true); setError("");
    try {
      const result = await callFunction<{ email: string; expiresAt: number }>("adminGrantPlusMonth", { email: preview.email, requestId: requestId.current, reason: note.trim() });
      setDone(result); setPreview(null); requestId.current = null;
      try { sessionStorage.removeItem(pendingKey); } catch { /* No stored reference. */ }
      void queryClient.invalidateQueries({ queryKey: ["admin-member", result.email] });
      void queryClient.invalidateQueries({ queryKey: ["admin-member", preview.uid] });
      void queryClient.invalidateQueries({ queryKey: ["premium"] });
      void queryClient.invalidateQueries({ queryKey: ["likes-you"] });
    } catch (failure) { setError(friendlyError(failure, "Couldn't grant Plus. Retry uses the same reference and won't add the month twice.")); }
    finally { setBusy(false); }
  };
  return <Screen scroll header={<ScreenHeader title="Grant a month of Plus" />}>
    {allowed === null ? <LoadingView /> : !allowed ? <EmptyState icon="lock-closed-outline" title="Owner access required" message="Sign in with your owner account to grant complimentary Plus." /> : <YStack gap="$3" paddingVertical="$4">
      <Text fontSize="$5" fontWeight="700">One complimentary month · 30 days</Text>
      <Text color="$textMuted" lineHeight={22}>Add 30 days to any member's existing validity, or start their pass now. This is a free grant and adds ₹0 to sales.</Text>
      <TextField testID="grant-email" label="Member's login email" value={email} autoCapitalize="none" keyboardType="email-address" editable={!busy} onChangeText={(value) => { setEmail(value); setPreview(null); setDone(null); requestId.current = null; }} />
      <TextField testID="grant-note" label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} editable={!busy} placeholder="Example: customer support goodwill" />
      {!preview ? <PrimaryButton testID="grant-lookup" loading={busy} disabled={!email.trim().includes("@")} onPress={() => void lookup()}>Find member</PrimaryButton> : <YStack gap="$3" borderWidth={1} borderColor="$border" borderRadius={20} padding="$4">
        <Text fontSize="$5" fontWeight="700">{preview.name}</Text>
        <Text selectable>{preview.email}</Text>
        <Text color="$textMuted" lineHeight={22}>Add 30 days free. Expected expiry: {when(preview.expiresAt)}. The exact expiry is checked again when you grant.</Text>
        <PrimaryButton testID="grant-confirm" loading={busy} onPress={() => void grant()}>Grant 30 days free</PrimaryButton>
      </YStack>}
      {done ? <YStack testID="grant-success" gap="$2" padding="$4" borderRadius={18} backgroundColor="$primarySoft"><Text fontWeight="700">30 days added</Text><Text selectable>{done.email}</Text><Text>Plus is active until {when(done.expiresAt)}.</Text><SecondaryButton onPress={() => { setDone(null); setEmail(""); setNote(""); }}>Grant to another member</SecondaryButton></YStack> : null}
      {error ? <Text color="$error" accessibilityLiveRegion="polite">{error}</Text> : null}
      <SecondaryButton onPress={() => navigation.navigate("MemberAdmin")}>Open member admin</SecondaryButton>
    </YStack>}
  </Screen>;
}
