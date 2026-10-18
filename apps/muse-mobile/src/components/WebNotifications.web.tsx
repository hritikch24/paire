import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { SettingsSection, ToggleRow } from "./SettingsRow";
import { showToast } from "./Toast";
import { browserPushSupported, disableBrowserPush, enableBrowserPush, getPushPermission, isPushRegistered } from "../services/notificationService.web";
import { friendlyError } from "../services/errors";
import { updateSettings } from "../services/profileService";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";

export function WebNotifications() {
  const uid = useAuthStore((state) => state.user?.uid);
  const notifications = useAuthStore((state) => state.settings?.notifications);
  const [enabled, setEnabled] = useState(isPushRegistered());
  const [permission, setPermission] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => { setEnabled(isPushRegistered()); void getPushPermission().then(setPermission); };
    update();
    window.addEventListener("paire-push-change", update);
    window.addEventListener("focus", update);
    return () => { window.removeEventListener("paire-push-change", update); window.removeEventListener("focus", update); };
  }, []);
  if (isSupportView) return null;
  const supported = browserPushSupported();
  const change = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      if (enabled) await disableBrowserPush(uid);
      else {
        const registered = await enableBrowserPush(uid);
        if (!registered) showToast("Notifications are off. You can change permission in your browser's site settings.");
      }
      setEnabled(isPushRegistered());
      setPermission(await getPushPermission());
    } catch (error) { showToast(friendlyError(error, "Couldn't set up notifications. Try again."), "error"); }
    finally { setBusy(false); }
  };
  const save = async (key: "matches" | "messages" | "previews" | "reminders", value: boolean) => {
    if (!uid) return;
    try {
      await updateSettings(uid, { notifications: { matches: notifications?.matches !== false, messages: notifications?.messages !== false, previews: notifications?.previews === true, reminders: notifications?.reminders === true, [key]: value } });
      if (key === "reminders" && value && !enabled) showToast("Preference saved. Enable notifications above to receive reminders in this browser.");
    }
    catch (error) { showToast(friendlyError(error, "Couldn't save that setting."), "error"); }
  };
  return (
    <SettingsSection title="Browser notifications" footer="Names and message text stay hidden unless you enable previews. Turn off any category whenever you like.">
      <YStack testID="web-notifications" padding="$4" gap="$3">
        <Text color="$textMuted" fontSize="$2">
          {!supported ? "On iPhone or iPad, add Paire to your Home Screen, then open it there to enable notifications. Other browsers need Web Push support."
            : permission === "denied" ? "Notifications are blocked. Allow notifications for Paire in your browser's site settings."
              : enabled ? "Notifications are on for this browser, including when Paire is closed."
                : "Get a notification when someone matches with you or sends a message."}
        </Text>
        {supported && permission !== "denied" ? enabled
          ? <SecondaryButton testID="web-push-toggle" loading={busy} onPress={() => void change()}>Turn off for this browser</SecondaryButton>
          : <PrimaryButton testID="web-push-toggle" loading={busy} onPress={() => void change()}>Enable notifications</PrimaryButton> : null}
      </YStack>
      <ToggleRow testID="web-push-matches" icon="heart-outline" label="New matches" value={notifications?.matches !== false} onValueChange={(value) => void save("matches", value)} />
      <ToggleRow testID="web-push-messages" icon="chatbubble-outline" label="Messages" value={notifications?.messages !== false} onValueChange={(value) => void save("messages", value)} />
      <ToggleRow testID="web-push-reminders" icon="sparkles-outline" label="People & events" description="Optional reminders about new people and your Garba plans. Up to 2 a week at 6:30 pm India time, only when there's something relevant to open." value={notifications?.reminders === true} onValueChange={(value) => void save("reminders", value)} />
      <ToggleRow testID="web-push-previews" icon="eye-outline" label="Show notification previews" value={notifications?.previews === true} onValueChange={(value) => void save("previews", value)} />
    </SettingsSection>
  );
}
