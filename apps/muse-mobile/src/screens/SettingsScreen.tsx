import { useState } from "react";
import { Switch } from "react-native";
import { Slider, Text, XStack, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { useAuthStore } from "../store/authStore";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { signOut } from "@firebase/auth/dist/rn";
import { auth } from "../services/firebase";
import { getLocationSnapshot } from "../utils/location";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/stacks/AppStack";

export function SettingsScreen() {
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const isGuest = useAuthStore((state) => state.isGuest);
  const resetAuth = useAuthStore((state) => state.resetAuth);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [discoverable, setDiscoverable] = useState(profile?.isDiscoverable ?? true);
  const [shareLocation, setShareLocation] = useState(profile?.shareLocation ?? false);
  const [notifications, setNotifications] = useState(true);
  const [maxDistanceKm, setMaxDistanceKm] = useState(profile?.maxDistanceKm ?? 50);
  const [saving, setSaving] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const switchTrackColor = { false: "#DED7D4", true: "#0F3D52" };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const updatedAt = Date.now();
      await setDoc(
        doc(db, "users", profile.uid),
        {
          isDiscoverable: discoverable,
          maxDistanceKm,
          updatedAt
        },
        { merge: true }
      );
      setProfile({ ...profile, isDiscoverable: discoverable, maxDistanceKm, updatedAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save settings.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLocation = async (value: boolean) => {
    if (!profile) return;
    setShareLocation(value);
    setLocationSaving(value);
    setLocationError(null);
    try {
      if (value) {
        const snapshot = await getLocationSnapshot();
        if (snapshot.status !== "granted") {
          setShareLocation(false);
          setLocationError("Location permission denied.");
          return;
        }
        if (!snapshot.location) {
          const now = Date.now();
          await setDoc(
            doc(db, "users", profile.uid),
            { shareLocation: true, updatedAt: now },
            { merge: true }
          );
          setProfile({ ...profile, shareLocation: true, updatedAt: now });
          setShareLocation(true);
          setLocationError("Location will update shortly.");
          return;
        }
        const now = snapshot.location.updatedAt;
        const updates: Record<string, unknown> = {
          shareLocation: true,
          location: snapshot.location,
          updatedAt: now
        };
        if (!profile.city && snapshot.city) {
          updates.city = snapshot.city;
        }
        await setDoc(doc(db, "users", profile.uid), updates, { merge: true });
        setProfile({
          ...profile,
          shareLocation: true,
          location: snapshot.location,
          updatedAt: now,
          city: updates.city ? String(updates.city) : profile.city
        });
        setShareLocation(true);
      } else {
        const now = Date.now();
        await setDoc(
          doc(db, "users", profile.uid),
          { shareLocation: false, location: null, updatedAt: now },
          { merge: true }
        );
        setProfile({ ...profile, shareLocation: false, location: null, updatedAt: now });
        setShareLocation(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update location settings.";
      setLocationError(message);
      if (value) {
        const now = Date.now();
        try {
          await setDoc(
            doc(db, "users", profile.uid),
            { shareLocation: true, updatedAt: now },
            { merge: true }
          );
          setProfile({ ...profile, shareLocation: true, updatedAt: now });
        } catch {
          // Best-effort fallback when location lookup fails.
        }
      } else {
        setShareLocation(profile?.shareLocation ?? false);
      }
    } finally {
      setLocationSaving(false);
    }
  };

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="700">
          Settings
        </Text>
        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontWeight="700">Safety center</Text>
          <Text fontSize="$2" color="$textMuted">
            Quick access to emergency actions, live location sharing, and date plans.
          </Text>
          <SecondaryButton onPress={() => navigation.navigate("SafetyCenter")}>
            Open safety center
          </SecondaryButton>
        </YStack>
        <XStack justifyContent="space-between" alignItems="center" gap="$3">
          <Text flex={1} flexShrink={1} minWidth={0}>
            Discoverable
          </Text>
          <Switch
            value={discoverable}
            onValueChange={setDiscoverable}
            trackColor={switchTrackColor}
            thumbColor="#FFFFFF"
            ios_backgroundColor={switchTrackColor.false}
          />
        </XStack>
        <XStack justifyContent="space-between" alignItems="center" gap="$3">
          <Text flex={1} flexShrink={1} minWidth={0}>
            Share location
          </Text>
          <Switch
            value={shareLocation}
            onValueChange={handleToggleLocation}
            disabled={locationSaving}
            trackColor={switchTrackColor}
            thumbColor="#FFFFFF"
            ios_backgroundColor={switchTrackColor.false}
          />
        </XStack>
        <XStack justifyContent="space-between" alignItems="center" gap="$3">
          <Text flex={1} flexShrink={1} minWidth={0}>
            Push notifications
          </Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={switchTrackColor}
            thumbColor="#FFFFFF"
            ios_backgroundColor={switchTrackColor.false}
          />
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          Get notified for new matches and messages (device setting required).
        </Text>
        {locationError ? <Text color="$error">{locationError}</Text> : null}
        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center" gap="$3">
            <Text fontWeight="600">Distance radius</Text>
            <Text color="$textMuted">{maxDistanceKm} km</Text>
          </XStack>
          <Slider
            value={[maxDistanceKm]}
            min={5}
            max={100}
            step={5}
            onValueChange={(value) => setMaxDistanceKm(value[0] ?? 50)}
            disabled={!shareLocation}
          >
            <Slider.Track>
              <Slider.TrackActive />
            </Slider.Track>
            <Slider.Thumb index={0} />
          </Slider>
          {!shareLocation ? (
            <Text fontSize="$2" color="$textMuted">
              Turn on location sharing to adjust your radius.
            </Text>
          ) : null}
        </YStack>
        {error ? <Text color="$error">{error}</Text> : null}
        <PrimaryButton onPress={handleSave} disabled={saving}>
          Save settings
        </PrimaryButton>
        {isGuest ? (
          <SecondaryButton testID="settings-signout" onPress={resetAuth}>
            Exit guest mode
          </SecondaryButton>
        ) : (
          <SecondaryButton testID="settings-signout" onPress={() => signOut(auth)}>
            Sign out
          </SecondaryButton>
        )}
        <SecondaryButton disabled>Delete account</SecondaryButton>
      </YStack>
    </Screen>
  );
}
