import { useEffect, useState } from "react";
import { Modal } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { friendlyError } from "../services/errors";
import { browserPushSupported, enableBrowserPush, getPushPermission, isPushRegistered } from "../services/notificationService.web";
import { useAuthStore } from "../store/authStore";
import { Icon, IconName } from "./Icon";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { showToast } from "./Toast";

/** Anything can ask for the prompt again, e.g. the setup nudge. */
export const OPEN_NOTIFICATION_PROMPT = "paire-open-notification-prompt";
/** Lets other pop-ups wait their turn. */
let showing = false;
export const notificationPromptShowing = () => showing;
const DELAY_MS = 4_000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_ASKS = 5;
const key = (uid: string) => `paire.pushPrompt.${uid}`;
const read = (uid: string): { at?: number; count?: number } => { try { return JSON.parse(localStorage.getItem(key(uid)) || "{}") || {}; } catch { return {}; } };
const write = (uid: string, value: { at: number; count: number } | null) => { try { if (value) localStorage.setItem(key(uid), JSON.stringify(value)); else localStorage.removeItem(key(uid)); } catch { /* private mode: asking again is harmless */ } };

const BENEFITS: Array<{ icon: IconName; text: string }> = [
  { icon: "heart-outline", text: "Someone likes you" },
  { icon: "sparkles-outline", text: "You match with someone" },
  { icon: "chatbubble-outline", text: "A new message arrives" }
];

/**
 * A friendly ask shortly after sign-in. The browser's own permission dialog opens only from the
 * "Allow" tap (browsers require a gesture), and we stop asking after a few polite tries.
 */
export function NotificationPrompt() {
  const uid = useAuthStore((state) => state.user?.uid);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  showing = open;

  useEffect(() => {
    if (!uid) return;
    // Nudge taps ask even where we wouldn't auto-prompt, so they can explain.
    const ask = () => {
      if (!browserPushSupported()) showToast("On iPhone or iPad, add Paire to your Home Screen and open it there to turn on notifications.");
      else if (!isPushRegistered()) setOpen(true);
    };
    const registered = () => { if (isPushRegistered()) setOpen(false); };
    window.addEventListener(OPEN_NOTIFICATION_PROMPT, ask);
    window.addEventListener("paire-push-change", registered);
    const stopListening = () => {
      window.removeEventListener(OPEN_NOTIFICATION_PROMPT, ask);
      window.removeEventListener("paire-push-change", registered);
    };
    // Unsupported browsers are only explained to on request; automated browsers (our acceptance runs) are never interrupted.
    if (!browserPushSupported() || navigator.webdriver) return stopListening;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || isPushRegistered() || (await getPushPermission()) === "denied") return;
      const { at = 0, count = 0 } = read(uid);
      if (count >= MAX_ASKS || Date.now() - at < COOLDOWN_MS) return;
      write(uid, { at: Date.now(), count: count + 1 });
      if (!cancelled) setOpen(true);
    }, DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopListening();
    };
  }, [uid]);

  if (!uid || !open) return null;
  const allow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await enableBrowserPush(uid)) {
        write(uid, null);
        showToast("Notifications are on. We'll tell you about likes, matches and messages.", "success");
      } else if ((await getPushPermission()) === "denied") {
        showToast("Notifications are blocked. You can allow them in your browser's site settings.");
      }
      setOpen(false);
    } catch (error) {
      showToast(friendlyError(error, "Couldn't turn on notifications. Try again from Settings."), "error");
      setOpen(false);
    } finally { setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) setOpen(false); }} statusBarTranslucent>
      <YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end" alignItems="center" padding="$3">
        <YStack testID="notification-prompt" backgroundColor="$background" borderRadius="$6" width="100%" maxWidth={440} padding="$5" gap="$4" accessibilityRole="alert">
          <XStack alignItems="center" gap="$3">
            <YStack width={44} height={44} borderRadius={22} backgroundColor="$primarySoft" alignItems="center" justifyContent="center">
              <Icon name="notifications-outline" size={22} color="primary" />
            </YStack>
            <Text flex={1} fontSize="$6" fontWeight="700" lineHeight={28} accessibilityRole="header">Don't miss a like or a message</Text>
          </XStack>
          <Text color="$textMuted" lineHeight={22}>Allow notifications and Paire will tell you, even when it's closed, the moment:</Text>
          <YStack gap="$2">
            {BENEFITS.map((item) => (
              <XStack key={item.text} gap="$3" alignItems="center">
                <Icon name={item.icon} size={18} color="primary" />
                <Text fontSize="$3">{item.text}</Text>
              </XStack>
            ))}
          </YStack>
          <Text fontSize="$1" color="$textMuted" lineHeight={18}>Names and message text stay hidden unless you turn on previews. Turn notifications off anytime in Settings.</Text>
          <YStack gap="$2">
            <PrimaryButton testID="notification-prompt-allow" loading={busy} onPress={() => void allow()}>Allow notifications</PrimaryButton>
            <SecondaryButton testID="notification-prompt-later" disabled={busy} onPress={() => setOpen(false)}>Not now</SecondaryButton>
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
}
