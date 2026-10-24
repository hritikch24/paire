import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Platform, Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { features } from "../config/features";
import { requestApproximateLocation } from "../services/locationService";
import { getPushPermission, isPushRegistered, registerPushToken, requestPushPermission } from "../services/notificationService";
import { updateProfile, updateSettings } from "../services/profileService";
import { useAuthStore } from "../store/authStore";
import type { AppStackParamList } from "../navigation/types";
import { Icon, IconName } from "./Icon";
import { showToast } from "./Toast";

type Nudge = { id: "photo" | "notifications" | "location"; icon: IconName; title: string; body: string; action: string };

const NUDGES: Record<Nudge["id"], Nudge> = {
  photo: {
    id: "photo",
    icon: "camera-outline",
    title: "Add a photo",
    body: "People are far more likely to like you back when they can see you.",
    action: "Add"
  },
  notifications: {
    id: "notifications",
    icon: "notifications-outline",
    title: "Never miss a match",
    body: "Get a heads-up when someone likes you back or messages you.",
    action: "Turn on"
  },
  location: {
    id: "location",
    icon: "location-outline",
    title: "See people near you",
    body: "Share your approximate location. Your exact spot is never shown.",
    action: "Share"
  }
};

/**
 * Sign-up skips everything optional; this finishes the job one tap at a time,
 * showing only the most useful missing step.
 */
export function SetupNudge() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const photos = useAuthStore((state) => state.profile?.photoUrls?.length ?? 0);
  const city = useAuthStore((state) => state.profile?.city);
  const locationEnabled = useAuthStore((state) => Boolean(state.settings?.locationEnabled));
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!features.notifications && Platform.OS !== "web") return;
    const update = () => void getPushPermission()
      .then((permission) => setNotificationsOn(Platform.OS === "web" ? isPushRegistered() : permission === "granted"))
      .catch(() => undefined);
    update();
    if (Platform.OS === "web") {
      window.addEventListener("paire-push-change", update);
      return () => window.removeEventListener("paire-push-change", update);
    }
  }, []);

  const pending = [
    photos === 0 ? NUDGES.photo : null,
    !notificationsOn ? NUDGES.notifications : null,
    !locationEnabled ? NUDGES.location : null
  ].filter((nudge): nudge is Nudge => nudge !== null && !dismissed.includes(nudge.id));
  const nudge = pending[0];
  if (!nudge || !uid) return null;

  const act = async () => {
    if (nudge.id === "photo") {
      navigation.navigate("EditPhotos");
      return;
    }
    if (nudge.id === "notifications" && Platform.OS === "web") {
      // Same friendly prompt as after sign-in (it explains when this browser can't do Web Push).
      window.dispatchEvent(new Event("paire-open-notification-prompt"));
      return;
    }
    setBusy(true);
    try {
      if (nudge.id === "notifications") {
        const permission = await requestPushPermission();
        setNotificationsOn(permission === "granted");
        if (permission === "granted") void registerPushToken(uid);
        else {
          showToast("Notifications are off. You can turn them on in your phone's settings.");
          setDismissed((list) => [...list, nudge.id]);
        }
      } else {
        const result = await requestApproximateLocation();
        if (result.status === "granted") {
          await updateSettings(uid, { locationEnabled: true, location: result.location });
          if (!city && result.city) await updateProfile(uid, { city: result.city });
        } else {
          showToast("Location is off. You can turn it on later in Settings.");
          setDismissed((list) => [...list, nudge.id]);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <XStack
      testID={`nudge-${nudge.id}`}
      marginHorizontal="$3"
      marginBottom="$2"
      padding="$3"
      gap="$3"
      alignItems="center"
      borderRadius="$4"
      backgroundColor="$primarySoft"
    >
      <Icon name={nudge.icon} size={22} color="primary" />
      <YStack flex={1} gap={1}>
        <Text fontSize={Platform.OS === "web" ? 12 : "$3"} fontWeight="700">
          {nudge.title}
        </Text>
        <Text fontSize={Platform.OS === "web" ? 11 : "$2"} color="$textMuted" numberOfLines={Platform.OS === "web" ? 1 : undefined}>
          {Platform.OS === "web" ? nudge.id === "photo" ? "Let them see the real you." : nudge.id === "location" ? "Share your approximate location." : "Keep up with new connections." : nudge.body}
        </Text>
      </YStack>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void act()}
        style={({ pressed }) => ({ opacity: pressed || busy ? 0.6 : 1, ...(Platform.OS === "web" ? { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" } : {}) })}
      >
        <Text fontSize="$3" fontWeight="700" color="$primary">
          {nudge.action}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Dismiss: ${nudge.title}`}
        hitSlop={10}
        style={Platform.OS === "web" ? { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" } : undefined}
        onPress={() => setDismissed((list) => [...list, nudge.id])}
      >
        <Icon name="close" size={18} color="textMuted" />
      </Pressable>
    </XStack>
  );
}
