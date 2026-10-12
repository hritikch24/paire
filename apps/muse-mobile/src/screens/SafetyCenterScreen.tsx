import { Alert } from "../services/dialog";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Linking, Share, Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Chip } from "../components/Chip";
import { Icon } from "../components/Icon";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { TextField } from "../components/MuseInput";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { SettingsRow, SettingsSection } from "../components/SettingsRow";
import { showToast } from "../components/Toast";
import { legal } from "../config/legal";
import { friendlyError } from "../services/errors";
import { cancelScheduledNotification, requestPushPermission, scheduleCheckIn } from "../services/notificationService";
import { loadSafetyPlan, saveSafetyPlan } from "../services/profileService";
import { useAuthStore } from "../store/authStore";
import type { AppStackParamList } from "../navigation/types";

const CHECK_IN_KEY = "muse.safety.checkIn";
const CHECK_IN_OPTIONS = [30, 60, 90, 120];

type ActiveCheckIn = { id: string; endsAt: number };

const EMERGENCY_NUMBERS = [
  { label: "Emergency (Police, Fire, Ambulance)", number: "112" },
  { label: "Women Helpline", number: "181" },
  { label: "Cyber fraud helpline", number: "1930" }
];

function call(number: string) {
  Linking.openURL(`tel:${number}`).catch(() => Alert.alert("Couldn't start the call", `Please dial ${number} from your phone app.`));
}

export function SafetyCenterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const [plan, setPlan] = useState({ dateLocation: "", dateTime: "", notes: "" });
  const [savingPlan, setSavingPlan] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [checkIn, setCheckIn] = useState<ActiveCheckIn | null>(null);

  useEffect(() => {
    if (!uid) return;
    loadSafetyPlan(uid)
      .then((saved) => saved && setPlan(saved))
      .catch(() => undefined);
    AsyncStorage.getItem(CHECK_IN_KEY)
      .then((raw) => {
        const stored = raw ? (JSON.parse(raw) as ActiveCheckIn) : null;
        setCheckIn(stored && stored.endsAt > Date.now() ? stored : null);
      })
      .catch(() => undefined);
  }, [uid]);

  const savePlan = async () => {
    if (!uid) return;
    setSavingPlan(true);
    try {
      await saveSafetyPlan(uid, plan);
      showToast("Date plan saved. Only you can see it.", "success");
    } catch (error) {
      showToast(friendlyError(error, "Couldn't save your plan."), "error");
    } finally {
      setSavingPlan(false);
    }
  };

  const sharePlan = async () => {
    const lines = [
      plan.dateLocation && `Where: ${plan.dateLocation}`,
      plan.dateTime && `When: ${plan.dateTime}`,
      plan.notes && `Notes: ${plan.notes}`
    ].filter(Boolean);
    if (!lines.length) {
      showToast("Add where and when first, then share.");
      return;
    }
    await Share.share({ message: `I'm going on a date. Here's my plan:\n${lines.join("\n")}` });
  };

  const startCheckIn = async () => {
    const permission = await requestPushPermission();
    if (permission !== "granted") {
      Alert.alert("Notifications are off", "Allow notifications for Paire so we can remind you to check in.", [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => void Linking.openSettings() }
      ]);
      return;
    }
    try {
      if (checkIn) await cancelScheduledNotification(checkIn.id).catch(() => undefined);
      const id = await scheduleCheckIn(minutes);
      const next = { id, endsAt: Date.now() + minutes * 60 * 1000 };
      setCheckIn(next);
      await AsyncStorage.setItem(CHECK_IN_KEY, JSON.stringify(next));
      showToast(`We'll check in with you in ${minutes} minutes.`, "success");
    } catch (error) {
      showToast(friendlyError(error, "Couldn't set the reminder."), "error");
    }
  };

  const stopCheckIn = async () => {
    if (checkIn) await cancelScheduledNotification(checkIn.id).catch(() => undefined);
    setCheckIn(null);
    await AsyncStorage.removeItem(CHECK_IN_KEY).catch(() => undefined);
    showToast("Check-in cancelled.");
  };

  const endsAtLabel = checkIn
    ? new Date(checkIn.endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <Screen scroll>
      <ScreenHeader title="Safety center" subtitle="Your comfort comes first" />
      <YStack gap="$6">
        <YStack padding="$5" gap="$3" borderRadius={24} backgroundColor="$primarySoft">
          <Icon name="heart-outline" size={28} color="primary" />
          <Text fontSize={28} lineHeight={35} fontWeight="700">At your pace.{"\n"}On your terms.</Text>
          <Text color="$textMuted" fontSize="$3" lineHeight={23}>You never owe anyone a reply, a number or a date. Report or block from their profile or chat whenever you need to.</Text>
          <SecondaryButton onPress={() => navigation.navigate("Settings")}>Manage my visibility</SecondaryButton>
        </YStack>
        <SettingsSection title="Trust and privacy">
          <SettingsRow icon="scan-outline" label="Photo verification" value="Your status" showDivider={false} onPress={() => navigation.navigate("Verification")} />
          <SettingsRow testID="safety-my-reports" icon="flag-outline" label="My reports" description="Check the progress of a safety report." onPress={() => navigation.navigate("MyReports")} />
          <SettingsRow icon="eye-off-outline" label="Discovery and location controls" onPress={() => navigation.navigate("Settings")} />
        </SettingsSection>
        <SettingsSection title="In an emergency" footer="Calls go through your phone's dialer.">
          {EMERGENCY_NUMBERS.map((item, index) => (
            <SettingsRow
              key={item.number}
              icon="call-outline"
              label={item.label}
              value={item.number}
              showDivider={index > 0}
              onPress={() => call(item.number)}
            />
          ))}
        </SettingsSection>

        {Platform.OS === "web" ? <Text color="$textMuted">Check-in reminders are available in the mobile app. In your browser, save and share your date plan below.</Text> : <YStack gap="$3">
          <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase">
            Check-in reminder
          </Text>
          <Text color="$textMuted">
            Heading out on a date? Set a reminder on this phone to check in. It won’t alert a friend or emergency services automatically.
          </Text>
          {checkIn ? (
            <YStack gap="$3" padding="$4" borderRadius="$5" backgroundColor="$primarySoft">
              <Text fontWeight="700">Check-in set for {endsAtLabel}</Text>
              <SecondaryButton onPress={() => void stopCheckIn()}>I'm safe, cancel reminder</SecondaryButton>
            </YStack>
          ) : (
            <YStack gap="$3">
              <XStack gap="$2" flexWrap="wrap">
                {CHECK_IN_OPTIONS.map((option) => (
                  <Chip key={option} label={`${option} min`} selected={minutes === option} onPress={() => setMinutes(option)} />
                ))}
              </XStack>
              <PrimaryButton testID="safety-checkin" onPress={() => void startCheckIn()}>
                Start check-in
              </PrimaryButton>
            </YStack>
          )}
        </YStack>}

        <YStack gap="$3">
          <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase">
            Date plan
          </Text>
          <Text color="$textMuted">Save where and when you're meeting, then share it with a friend you trust.</Text>
          <TextField label="Where" placeholder="Café name and area" maxLength={200} value={plan.dateLocation} onChangeText={(value) => setPlan((p) => ({ ...p, dateLocation: value }))} />
          <TextField label="When" placeholder="Saturday, 6 pm" maxLength={100} value={plan.dateTime} onChangeText={(value) => setPlan((p) => ({ ...p, dateTime: value }))} />
          <TextField label="Notes" placeholder="Their first name, how you're getting there…" maxLength={500} multiline textAlignVertical="top" minHeight={80} paddingTop="$3" value={plan.notes} onChangeText={(value) => setPlan((p) => ({ ...p, notes: value }))} />
          <XStack gap="$3">
            <YStack flex={1}>
              <SecondaryButton onPress={() => void savePlan()} loading={savingPlan}>
                Save
              </SecondaryButton>
            </YStack>
            <YStack flex={1}>
              <PrimaryButton onPress={() => void sharePlan()}>Share</PrimaryButton>
            </YStack>
          </XStack>
        </YStack>

        <YStack gap="$3" padding="$4" borderRadius="$5" backgroundColor="$primarySoft">
          <XStack gap="$2" alignItems="center">
            <Icon name="sparkles" size={18} color="primary" />
            <Text fontWeight="700" fontSize="$4" flex={1}>
              Paire AI chat safety
            </Text>
          </XStack>
          <Text color="$textMuted" fontSize="$2">
            Paire AI checks messages for scams, abuse, threats and signs of underage users. If something looks off,
            you'll see a warning under the message and abusive messages are hidden until you tap. Only flagged
            messages are kept, for our safety team to review.
          </Text>
          <Text color="$primary" fontWeight="700" fontSize="$2" onPress={() => void Linking.openURL(`${legal.privacyUrl}#muse-ai`)}>
            How it works
          </Text>
        </YStack>

        <SettingsSection title="Learn more">
          <SettingsRow icon="book-outline" label="Dating safety tips" showDivider={false} onPress={() => void Linking.openURL(legal.safetyUrl)} />
          <SettingsRow icon="people-outline" label="Community guidelines" onPress={() => void Linking.openURL(legal.guidelinesUrl)} />
        </SettingsSection>
      </YStack>
    </Screen>
  );
}
