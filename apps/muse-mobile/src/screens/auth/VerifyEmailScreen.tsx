import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { Text, YStack } from "tamagui";
import { Icon } from "../../components/Icon";
import { GhostButton, PrimaryButton, SecondaryButton } from "../../components/MuseButton";
import { Screen } from "../../components/Screen";
import { showToast } from "../../components/Toast";
import { checkEmailVerified, resendVerificationEmail, signOut } from "../../services/accountService";
import { errorCode, friendlyError } from "../../services/errors";
import { useAuthStore } from "../../store/authStore";
import { isDisposableEmail } from "../../utils/disposableEmail";

const POLL_MS = 4000;

/** One tap to the inbox for the common providers (a new tab on the web, so this page keeps checking). */
const INBOXES: Array<[RegExp, string, string]> = [
  [/^(gmail|googlemail)\.com$/, "Gmail", "https://mail.google.com/mail/u/0/#inbox"],
  [/^(outlook|hotmail|live|msn)\.(com|in|co\.uk)$/, "Outlook", "https://outlook.live.com/mail/0/inbox"],
  [/^(yahoo|ymail)\.(com|in|co\.in)$/, "Yahoo Mail", "https://mail.yahoo.com"],
  [/^(icloud|me|mac)\.com$/, "iCloud Mail", "https://www.icloud.com/mail"],
  [/^rediffmail\.com$/, "Rediffmail", "https://mail.rediff.com"],
  [/^zoho(mail)?\.(com|in)$/, "Zoho Mail", "https://mail.zoho.in"]
];
function inboxFor(email: string | null | undefined): { name: string; url: string } | null {
  const domain = email?.split("@")[1]?.trim().toLowerCase() ?? "";
  const found = INBOXES.find(([pattern]) => pattern.test(domain));
  return found ? { name: found[1], url: found[2] } : null;
}
const RESEND_WAIT_S = 60;

/**
 * Email sign-ups land here until they open the link we emailed. Paire checks
 * quietly in the background, so the app moves on by itself once it's confirmed.
 */
export function VerifyEmailScreen() {
  const user = useAuthStore((state) => state.user);
  const email = user?.email ?? "your email";
  const throwaway = isDisposableEmail(user?.email);
  const inbox = inboxFor(user?.email);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_S);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const check = useCallback(async (manual: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (manual) { setChecking(true); setError(null); }
    try {
      const result = await checkEmailVerified();
      if (result === "pending" && manual) setError("Not confirmed yet. Open the link in the email from Paire, then try again.");
    } catch (err) {
      if (manual) setError(friendlyError(err, "We couldn't check right now. Please try again."));
    } finally {
      busy.current = false;
      if (manual) setChecking(false);
    }
  }, []);

  // Check every few seconds while the app is open, and whenever the member comes back to it.
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === "active") void check(false); }, POLL_MS);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") void check(false); });
    const onFocus = () => void check(false);
    if (Platform.OS === "web") window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      appState.remove();
      if (Platform.OS === "web") window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  // Accounts made before email confirmation existed never got a link: send one now.
  useEffect(() => {
    const created = Date.parse(user?.metadata.creationTime ?? "");
    if (!throwaway && Number.isFinite(created) && Date.now() - created > 10 * 60_000) void resendVerificationEmail().catch(() => undefined);
  }, [user, throwaway]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const resend = async () => {
    setResending(true); setError(null);
    try {
      await resendVerificationEmail();
      setWait(RESEND_WAIT_S);
      showToast("Sent! Check your inbox and spam folder.", "success");
    } catch (err) {
      setError(errorCode(err) === "auth/too-many-requests" ? "Too many emails in a row. Wait a few minutes, then try again." : friendlyError(err, "We couldn't send the email. Please try again."));
    } finally {
      setResending(false);
    }
  };

  if (throwaway) {
    return (
      <Screen scroll testID="verify-email-throwaway" footer={<PrimaryButton onPress={() => void signOut()}>Sign out and use my own email</PrimaryButton>}>
        <YStack gap="$4" paddingTop="$8">
          <Icon name="mail-unread-outline" size={44} color="primary" />
          <Text fontSize={32} lineHeight={39} fontWeight="700" accessibilityRole="header">Use your own email</Text>
          <Text fontSize="$4" color="$textMuted" lineHeight={24}>
            {email} is a temporary inbox. To keep fake accounts out, Paire needs an email you'll keep. Sign out and create your account with your own email, or continue with Google.
          </Text>
        </YStack>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      testID="verify-email-screen"
      footer={
        <YStack gap="$2">
          {error ? <Text color="$error" textAlign="center" fontSize="$2" accessibilityLiveRegion="polite">{error}</Text> : null}
          {inbox ? <PrimaryButton testID="verify-email-open-inbox" onPress={() => void Linking.openURL(inbox.url).catch(() => setError(`Open ${inbox.name} yourself and look for the email from Paire.`))}>{`Open ${inbox.name}`}</PrimaryButton> : null}
          {inbox
            ? <SecondaryButton testID="verify-email-check" loading={checking} onPress={() => void check(true)}>I've confirmed my email</SecondaryButton>
            : <PrimaryButton testID="verify-email-check" loading={checking} onPress={() => void check(true)}>I've confirmed my email</PrimaryButton>}
          <SecondaryButton testID="verify-email-resend" loading={resending} disabled={wait > 0} onPress={() => void resend()}>
            {wait > 0 ? `Resend email in ${wait}s` : "Resend email"}
          </SecondaryButton>
          <GhostButton testID="verify-email-signout" onPress={() => void signOut()}>Wrong email? Sign out</GhostButton>
        </YStack>
      }
    >
      <YStack gap="$5" paddingTop="$8">
        <YStack width={76} height={76} borderRadius={26} alignItems="center" justifyContent="center" backgroundColor="$primarySoft">
          <Icon name="mail-unread-outline" size={38} color="primary" />
        </YStack>
        <YStack gap="$2">
          <Text color="$primary" fontWeight="700" fontSize="$2" letterSpacing={2}>ONE LAST STEP</Text>
          <Text fontSize={32} lineHeight={39} fontWeight="700" accessibilityRole="header">Check your inbox</Text>
          <Text fontSize="$4" color="$textMuted" lineHeight={24}>
            We sent a link to <Text fontWeight="700" color="$text">{email}</Text>. Open it to confirm it's really you, and this screen moves on by itself.
          </Text>
        </YStack>
        <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor="$backgroundStrong" borderWidth={1} borderColor="$border">
          <Text fontWeight="700">Why we ask</Text>
          <Text color="$textMuted" fontSize="$2" lineHeight={21}>
            Every person on Paire has a real email, so fake and spam accounts don't get in. Can't find it? Look in Spam or Promotions for an email from Paire.
          </Text>
        </YStack>
      </YStack>
    </Screen>
  );
}
