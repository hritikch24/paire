import { Alert } from "../services/dialog";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Application from "expo-application";
import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { Text, YStack } from "tamagui";
import { ChipGroup } from "../components/Chip";
import { DeleteAccountSheet } from "../components/DeleteAccountSheet";
import { RangeSlider } from "../components/RangeSlider";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { SettingsRow, SettingsSection, ToggleRow } from "../components/SettingsRow";
import { showToast } from "../components/Toast";
import { env } from "../config/env";
import { features } from "../config/features";
import { legal } from "../config/legal";
import { testServerPasswordHelp } from "../config/testServer";
import { sendPasswordReset, signOut } from "../services/accountService";
import { friendlyError } from "../services/errors";
import { usePresenceEnabled } from "../hooks/usePresence";
import { hasPasswordLogin } from "../services/googleAuth";
import { requestApproximateLocation } from "../services/locationService";
import {
  getPushPermission,
  PushPermission,
  registerPushToken,
  requestPushPermission
} from "../services/notificationService";
import { updateProfile, updateSettings } from "../services/profileService";
import { useAppearanceStore } from "../store/appearanceStore";
import { useAuthStore } from "../store/authStore";
import { useTestServerStore } from "../store/testServerStore";
import { AGE_GAP_OLDER_MIN_AGE } from "../data/ageGap";
import { activeGarbaSeason, myUpcomingNights } from "../data/garba";
import { GARBA_PRIVACY_NOTE, GarbaNightPicker, toggleNight } from "../components/GarbaNights";
import { AgeGapSide, UserSettings } from "../types/models";
import { MAX_AGE, MIN_AGE } from "../utils/age";
import {
  CASUAL_DESCRIPTION,
  CASUAL_LABEL,
  gendersForShowMe,
  SHOW_ME_OPTIONS,
  showMeOptionFor,
  withSettingsDefaults
} from "../utils/profile";
import { serverLabel } from "../utils/serverAddress";
import { PALETTES } from "../theme/palettes";
import type { AppStackParamList } from "../navigation/types";

const DISTANCE_MAX = 200;

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const email = useAuthStore((state) => state.info?.email ?? state.user?.email ?? "");
  const profile = useAuthStore((state) => state.profile);
  const settings = withSettingsDefaults(useAuthStore((state) => state.settings));
  const [pushPermission, setPushPermission] = useState<PushPermission>("undetermined");
  const [locating, setLocating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const testServerOrigin = useTestServerStore((state) => state.origin);
  const themeName = useAppearanceStore((state) => PALETTES[state.palette].name);
  const presenceEnabled = usePresenceEnabled();

  useFocusEffect(
    useCallback(() => {
      void getPushPermission().then(setPushPermission).catch(() => undefined);
    }, [])
  );

  const save = async (edits: Partial<UserSettings>) => {
    if (!uid) return;
    try {
      await updateSettings(uid, edits);
    } catch (error) {
      showToast(friendlyError(error, "Couldn't save that setting."), "error");
    }
  };

  const toggleLocation = async (enable: boolean) => {
    if (!uid) return;
    if (!enable) {
      await save({ locationEnabled: false, location: null });
      return;
    }
    setLocating(true);
    try {
      const result = await requestApproximateLocation();
      if (result.status === "granted") {
        await save({ locationEnabled: true, location: result.location });
      } else if (result.status === "denied") {
        Alert.alert("Location is off", "Allow location for Paire in your phone settings to see distances.", [
          { text: "Not now", style: "cancel" },
          { text: "Open settings", onPress: () => void Linking.openSettings() }
        ]);
      } else {
        showToast("We couldn't get your location right now. Try again later.");
      }
    } finally {
      setLocating(false);
    }
  };

  const enableNotifications = async () => {
    const permission = await requestPushPermission();
    setPushPermission(permission);
    if (permission === "granted" && uid) {
      void registerPushToken(uid);
    } else if (permission === "denied") {
      void Linking.openSettings();
    }
  };

  const confirmSignOut = () =>
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() }
    ]);

  const resetPassword = async () => {
    if (!email) return;
    if (env.testServer) {
      Alert.alert(testServerPasswordHelp.title, testServerPasswordHelp.message);
      return;
    }
    try {
      await sendPasswordReset(email);
      showToast(`We sent a password reset link to ${email}.`, "success");
    } catch (error) {
      showToast(friendlyError(error), "error");
    }
  };

  const distance = settings.maxDistanceKm ?? DISTANCE_MAX;
  const version = `${Application.nativeApplicationVersion ?? "1.0.0"} (${Application.nativeBuildVersion ?? "dev"})`;

  return (
    <Screen scroll>
      <ScreenHeader title="Settings" />
      <YStack gap="$6">
        <SettingsSection title="Discovery">
          <YStack padding="$4" gap="$2">
            <Text fontSize="$4">Show me</Text>
            <ChipGroup
              testIDPrefix="settings-showme"
              options={SHOW_ME_OPTIONS}
              selected={[showMeOptionFor(settings.showMe)]}
              onToggle={(id) => void save({ showMe: gendersForShowMe(id) })}
            />
          </YStack>
          <RangeSlider
            testID="settings-age"
            label="Age range"
            min={MIN_AGE}
            max={MAX_AGE}
            value={[settings.ageMin, settings.ageMax]}
            format={([low, high]) => `${low} – ${high === MAX_AGE ? `${MAX_AGE}+` : high}`}
            onCommit={([low, high]) => void save({ ageMin: low, ageMax: high })}
          />
          <RangeSlider
            testID="settings-distance"
            label="Maximum distance"
            min={5}
            max={DISTANCE_MAX}
            step={5}
            value={[distance]}
            disabled={!settings.locationEnabled}
            format={([km]) => (km >= DISTANCE_MAX ? "Anywhere" : `${km} km`)}
            onCommit={([km]) => void save({ maxDistanceKm: km >= DISTANCE_MAX ? null : km })}
          />
          <ToggleRow
            icon="location-outline"
            label="Use my approximate location"
            description="Shows distances. Your exact location is never shared."
            value={settings.locationEnabled}
            disabled={locating}
            onValueChange={(value) => void toggleLocation(value)}
            testID="settings-location"
          />
          <ToggleRow
            testID="settings-same-intent"
            icon="heart-circle-outline"
            label="Same intentions only"
            description="Only see, and be seen by, people looking for what you want (marriage, long-term…)."
            value={settings.sameIntentOnly === true}
            onValueChange={(value) => void save({ sameIntentOnly: value })}
          />
          <ToggleRow
            testID="settings-shared-language"
            icon="language-outline"
            label="Speaks my language"
            description={
              profile?.languages?.length
                ? "Only people who share a language with you."
                : "Add your languages in Edit profile first."
            }
            value={settings.sharedLanguageOnly === true}
            disabled={!profile?.languages?.length && settings.sharedLanguageOnly !== true}
            onValueChange={(value) => void save({ sharedLanguageOnly: value })}
          />
          <ToggleRow
            icon="sparkles-outline"
            label="Only people who share my vibe"
            value={settings.sharedVibesOnly}
            onValueChange={(value) => void save({ sharedVibesOnly: value })}
          />
          <ToggleRow
            icon="sparkles-outline"
            label="AI vibe matching"
            description="Optional. Let Paire AI compare your selected interests, vibes and dating intentions with people who also opt in. No names, photos, messages, location or free text are sent. Turn off anytime."
            value={settings.aiVibeMatching === true}
            onValueChange={(value) => void save({ aiVibeMatching: value })}
            testID="settings-ai-vibe"
          />
          <ToggleRow
            icon="moon-outline"
            label={CASUAL_LABEL}
            description={CASUAL_DESCRIPTION}
            value={settings.openToCasual}
            onValueChange={(value) => void save({ openToCasual: value })}
            testID="settings-casual"
          />
          <ToggleRow
            icon="eye-outline"
            label="Show me on Paire"
            description="Turn off to hide your profile from new people. Your matches can still chat with you."
            value={profile?.isDiscoverable !== false}
            onValueChange={(value) =>
              uid &&
              void updateProfile(uid, { isDiscoverable: value }).catch((error) =>
                showToast(friendlyError(error, "Couldn't save that setting."), "error")
              )
            }
            testID="settings-discoverable"
          />
        </SettingsSection>

        {activeGarbaSeason() ? (
          <SettingsSection title="🪔 Garba Nights" footer={GARBA_PRIVACY_NOTE}>
            <YStack padding="$4" gap="$2">
              <Text fontSize="$4">Nights I'm going</Text>
              <GarbaNightPicker
                selected={myUpcomingNights(settings.garbaNights)}
                onToggle={(date) => void save({ garbaNights: toggleNight(myUpcomingNights(settings.garbaNights), date) })}
              />
            </YStack>
          </SettingsSection>
        ) : settings.garbaNights?.length ? (
          // After Navratri, past nights can still be cleared.
          <SettingsSection title="🪔 Garba Nights" footer="Garba Nights is closed until next Navratri.">
            <SettingsRow testID="settings-garba-clear" icon="trash-outline" label="Clear my Garba nights" onPress={() => void save({ garbaNights: null })} />
          </SettingsSection>
        ) : null}

        <SettingsSection
          title="Age-gap dating"
          footer="Only Paire Plus members see your side or can filter by it. Paire is for dating only: offering or asking for money, gifts or an allowance gets an account removed."
        >
          <YStack padding="$4" gap="$2">
            <Text fontSize="$4">Your side</Text>
            <ChipGroup
              testIDPrefix="settings-agegap"
              options={[
                { id: "off", label: "Not for me" },
                { id: "older", label: profile?.gender === "woman" ? "I'm a Cougar (35+)" : "I'm a Silver Fox (35+)", emoji: "🦊" },
                { id: "intoOlder", label: "I'm into someone older", emoji: "✨" }
              ]}
              // The server drops the older side under 35, so show what actually applies.
              selected={[settings.ageGap === "older" && (profile?.age ?? 0) < AGE_GAP_OLDER_MIN_AGE ? "off" : settings.ageGap ?? "off"]}
              onToggle={(id) => {
                if (id === "older" && (profile?.age ?? 0) < AGE_GAP_OLDER_MIN_AGE) {
                  showToast(`Silver Foxes and Cougars are ${AGE_GAP_OLDER_MIN_AGE} or older.`);
                  return;
                }
                void save({ ageGap: id === "off" ? null : (id as AgeGapSide) });
              }}
            />
          </YStack>
        </SettingsSection>

        <SettingsSection
          title="Privacy & control"
          footer="Free for everyone, always. These are built so women can date on their own terms, and anyone can use them."
        >
          <ToggleRow
            testID="settings-require-note"
            icon="chatbubble-ellipses-outline"
            label="Likes with a note only"
            description="People must write you a note to like you. No more low-effort likes."
            value={settings.requireNote === true}
            showDivider={false}
            onValueChange={(value) => void save({ requireNote: value })}
          />
          <ToggleRow
            testID="settings-first-move"
            icon="hand-left-outline"
            label="I'll message first"
            description="After you match, only you can send the first message. If they chose this too, either of you can."
            value={settings.firstMove === true}
            onValueChange={(value) => void save({ firstMove: value })}
          />
          <ToggleRow
            testID="settings-private-photos"
            icon="lock-closed-outline"
            label="Private photos"
            description="Your photos stay hidden in discovery and likes until you match. People see your vibe and basics first."
            value={settings.privatePhotos === true}
            onValueChange={(value) => void save({ privatePhotos: value })}
          />
          <ToggleRow
            testID="settings-incognito"
            icon="glasses-outline"
            label="Incognito"
            description="Only people you like can see you. Nobody browsing (a cousin, a colleague) will come across your profile."
            value={settings.incognito === true}
            onValueChange={(value) => void save({ incognito: value })}
          />
          {presenceEnabled || settings.showPresence === false ? (
            <ToggleRow
              testID="settings-show-presence"
              icon="radio-button-on-outline"
              label="Show when I'm active"
              description="Your matches can see when you're online and roughly when you were last active. Turn it off and nobody sees either. It never shows what you do, and it doesn't mean you've read a message."
              value={settings.showPresence !== false}
              onValueChange={(value) => void save({ showPresence: value })}
            />
          ) : null}
        </SettingsSection>

        {features.notifications ? (
          <SettingsSection
            title="Notifications"
            footer={pushPermission === "denied" ? "Notifications are turned off for Paire in your phone settings." : undefined}
          >
            {pushPermission !== "granted" ? (
              <SettingsRow
                icon="notifications-off-outline"
                label="Turn on notifications"
                description="Know the moment you match or get a message."
                showDivider={false}
                onPress={() => void enableNotifications()}
              />
            ) : null}
            <ToggleRow
              icon="heart-outline"
              label="New matches"
              value={settings.notifications.matches}
              showDivider={pushPermission !== "granted"}
              onValueChange={(value) => void save({ notifications: { ...settings.notifications, matches: value } })}
            />
            <ToggleRow
              icon="chatbubble-outline"
              label="Messages"
              value={settings.notifications.messages}
              onValueChange={(value) => void save({ notifications: { ...settings.notifications, messages: value } })}
            />
            <ToggleRow
              testID="settings-notification-previews"
              icon="eye-outline"
              label="Names and message previews"
              description="Off by default. Turn on to show personal details in notifications."
              value={settings.notifications.previews === true}
              onValueChange={(value) => void save({ notifications: { ...settings.notifications, previews: value } })}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title="Appearance">
          <SettingsRow
            testID="settings-appearance"
            icon="color-palette-outline"
            label="Theme and dark mode"
            value={themeName}
            showDivider={false}
            onPress={() => navigation.navigate("Appearance")}
          />
        </SettingsSection>

        <SettingsSection title="Safety">
          <SettingsRow icon="shield-checkmark-outline" label="Safety center" showDivider={false} onPress={() => navigation.navigate("SafetyCenter")} />
          <SettingsRow testID="settings-my-reports" icon="flag-outline" label="My reports" onPress={() => navigation.navigate("MyReports")} />
          <SettingsRow icon="people-outline" label="Community guidelines" onPress={() => void Linking.openURL(legal.guidelinesUrl)} />
        </SettingsSection>

        <SettingsSection title="Account">
          <SettingsRow icon="mail-outline" label="Email" value={email} showDivider={false} />
          {hasPasswordLogin() ? <SettingsRow
            icon="key-outline"
            label="Change password"
            description={env.testServer ? "The host can set a new one for you." : "We'll email you a secure link."}
            onPress={() => void resetPassword()}
          /> : <SettingsRow icon="logo-google" label="Signed in with Google" />}
          <SettingsRow testID="settings-signout" icon="log-out-outline" label="Sign out" onPress={confirmSignOut} />
          <SettingsRow testID="settings-delete" icon="trash-outline" label="Delete account" destructive onPress={() => setDeleteOpen(true)} />
        </SettingsSection>

        {env.testServer ? (
          <SettingsSection title="Test server" footer="Paire Test uses a test server on the host's computer. Opening a new invite link also switches servers.">
            <SettingsRow icon="server-outline" label="Server" description={serverLabel(testServerOrigin)} showDivider={false} />
            <SettingsRow
              icon="swap-horizontal-outline"
              label="Change test server"
              onPress={() => useTestServerStore.getState().change()}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title="About">
          <SettingsRow icon="document-text-outline" label="Privacy policy" showDivider={false} onPress={() => void Linking.openURL(legal.privacyUrl)} />
          <SettingsRow icon="document-text-outline" label="Terms of service" onPress={() => void Linking.openURL(legal.termsUrl)} />
          {legal.supportEmail ? (
            <SettingsRow icon="help-circle-outline" label="Contact support" value={legal.supportEmail} onPress={() => void Linking.openURL(`mailto:${legal.supportEmail}?subject=Paire%20support`)} />
          ) : null}
          <SettingsRow icon="information-circle-outline" label="Version" value={version} />
        </SettingsSection>
      </YStack>

      <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </Screen>
  );
}
