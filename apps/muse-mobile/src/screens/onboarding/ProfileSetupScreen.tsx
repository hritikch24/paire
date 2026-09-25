import { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Switch } from "react-native";
import { Card, Text, XStack, YStack, styled } from "tamagui";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { Screen } from "../../components/Screen";
import { MuseInput } from "../../components/MuseInput";
import { PrimaryButton, SecondaryButton } from "../../components/MuseButton";
import { OnboardingStackParamList } from "../../navigation/stacks/OnboardingStack";
import { useAuthStore } from "../../store/authStore";
import { db } from "../../services/firebase";
import { datingIntentions } from "../../data/datingIntentions";
import { vibeOptions } from "../../data/vibes";
import { getLocationSnapshot } from "../../utils/location";
import { UserLocation } from "../../types/models";

export function ProfileSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const isFocused = useIsFocused();
  const user = useAuthStore((state) => state.user);
  const setProfile = useAuthStore((state) => state.setProfile);
  const profile = useAuthStore((state) => state.profile);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? "");
  const [age, setAge] = useState(profile?.age ? String(profile.age) : "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [intentions, setIntentions] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>(profile?.vibes ?? []);
  const [shareLocation, setShareLocation] = useState(profile?.shareLocation ?? false);
  const [location, setLocation] = useState<UserLocation | null>(profile?.location ?? null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isE2E =
    process.env.EXPO_PUBLIC_E2E === "true" ||
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true";
  const switchTrackColor = { false: "#DED7D4", true: "#0F3D52" };
  const bioMax = 160;
  const ageValue = Number(age);
  const ageValid = Boolean(age) && !Number.isNaN(ageValue);

  useEffect(() => {
    if (!isFocused) return;
    if (profile?.displayName && profile.age && !profile.onboardingComplete) {
      navigation.replace("PhotoSetup");
    }
  }, [isFocused, navigation, profile]);

  const toggleIntention = (id: string) => {
    setIntentions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleVibe = (id: string) => {
    setVibes((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleToggleLocation = async (value: boolean) => {
    if (isE2E) {
      setShareLocation(value);
      if (!value) setLocation(null);
      return;
    }
    setShareLocation(value);
    setLocationError(null);
    if (!value) {
      setLocation(null);
      return;
    }
    setLocationSaving(true);
    try {
      const snapshot = await getLocationSnapshot();
      if (snapshot.status !== "granted") {
        setShareLocation(false);
        setLocationError("Location permission denied.");
        return;
      }
      if (!snapshot.location) {
        setLocation(null);
        setLocationError("Location will update shortly.");
        return;
      }
      setLocation(snapshot.location);
      if (!city && snapshot.city) {
        setCity(snapshot.city);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to fetch your location.";
      setLocationError(message);
    } finally {
      setLocationSaving(false);
    }
  };

  const handleNext = async () => {
    if (!user) return;
    Keyboard.dismiss();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("Please add your name to continue.");
      return;
    }
    const ageValue = Number(age);
    if (!age || Number.isNaN(ageValue)) {
      setError("Please enter your age to continue.");
      return;
    }

    setError(null);
    const locationValue = shareLocation ? location : null;
    const shareLocationValue = Boolean(shareLocation);
    if (isE2E) {
      const now = Date.now();
      const nextProfile = {
        uid: user.uid,
        displayName: trimmedName,
        pronouns,
        age: ageValue,
        city,
        bio,
        photoUrls: [],
        interests: [],
        intentions,
        vibes,
        vibePreference: "any" as const,
        maxDistanceKm: 50,
        location: locationValue,
        shareLocation: shareLocationValue,
        createdAt: now,
        updatedAt: now,
        onboardingComplete: false,
        safetyConfirmed: false,
        lastActiveAt: now,
        isDiscoverable: true
      };
      setProfile(nextProfile);
      navigation.navigate("PhotoSetup");
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      const nextProfile = {
        uid: user.uid,
        displayName: trimmedName,
        pronouns,
        age: ageValue,
        city,
        bio,
        photoUrls: [],
        interests: [],
        intentions,
        vibes,
        vibePreference: "any" as const,
        maxDistanceKm: 50,
        location: locationValue,
        shareLocation: shareLocationValue,
        createdAt: now,
        updatedAt: now,
        onboardingComplete: false,
        safetyConfirmed: false,
        lastActiveAt: now,
        isDiscoverable: true
      };
      const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number) =>
        new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error("Request timed out."));
          }, timeoutMs);
          promise.then(
            (value) => {
              clearTimeout(timer);
              resolve(value);
            },
            (err) => {
              clearTimeout(timer);
              reject(err);
            }
          );
        });

      await withTimeout(setDoc(doc(db, "users", user.uid), nextProfile, { merge: true }), 15000);
      await withTimeout(
        setDoc(
          doc(db, "users", user.uid, "private", "info"),
          {
            email: user.email ?? ""
          },
          { merge: true }
        ),
        15000
      );
      setProfile(nextProfile);
      navigation.navigate("PhotoSetup");
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't save your profile. Please try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$4">
            <YStack gap="$2">
              <Text fontSize="$7" fontWeight="700">
                Introduce yourself
              </Text>
              <Text color="$textMuted">
                Give potential matches a real sense of your vibe.
              </Text>
            </YStack>

            <YStack
              gap="$3"
              backgroundColor="$backgroundStrong"
              padding="$4"
              borderRadius="$5"
              borderWidth={1}
              borderColor="$border"
            >
              <MuseInput testID="onboarding-name" placeholder="Name" value={displayName} onChangeText={setDisplayName} />
              <MuseInput testID="onboarding-pronouns" placeholder="Pronouns" value={pronouns} onChangeText={setPronouns} />
              <MuseInput testID="onboarding-age" placeholder="Age" keyboardType="number-pad" value={age} onChangeText={setAge} />
              <MuseInput testID="onboarding-city" placeholder="City" value={city} onChangeText={setCity} />
              <YStack gap="$2">
                <MuseInput
                  testID="onboarding-bio"
                  placeholder="Short bio"
                  value={bio}
                  onChangeText={setBio}
                  maxLength={bioMax}
                />
                <Text fontSize="$1" color="$textMuted" textAlign="right">
                  {bio.length}/{bioMax}
                </Text>
              </YStack>
              <YStack gap="$2">
                <Text fontWeight="700">Your vibe</Text>
                <Text color="$textMuted" fontSize="$2">
                  Choose up to three that feel like you.
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {vibeOptions.map((vibe) => {
                    const active = vibes.includes(vibe.id);
                    return (
                      <IntentPill
                        key={vibe.id}
                        onPress={() => toggleVibe(vibe.id)}
                        backgroundColor={active ? "$primarySoft" : "$backgroundSoft"}
                        borderColor={active ? "$primary" : "$border"}
                      >
                        <Text fontWeight="600" textAlign="center" flexShrink={1}>
                          {vibe.emoji} {vibe.label}
                        </Text>
                      </IntentPill>
                    );
                  })}
                </XStack>
              </YStack>
              <YStack gap="$2">
                <Text fontWeight="700">Looking for</Text>
                <Text color="$textMuted" fontSize="$2">
                  Pick one or two that feel right.
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {datingIntentions.map((intention) => {
                    const active = intentions.includes(intention.id);
                    return (
                      <IntentPill
                        key={intention.id}
                        onPress={() => toggleIntention(intention.id)}
                        backgroundColor={active ? "$primarySoft" : "$backgroundSoft"}
                        borderColor={active ? "$primary" : "$border"}
                      >
                        <Text fontWeight="600" textAlign="center" flexShrink={1}>
                          {intention.emoji} {intention.label}
                        </Text>
                      </IntentPill>
                    );
                  })}
                </XStack>
              </YStack>
              <YStack gap="$2">
                <Text fontWeight="700">Location</Text>
                <Text color="$textMuted" fontSize="$2">
                  Share your distance to unlock nearby matches.
                </Text>
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
                {locationError ? <Text color="$error">{locationError}</Text> : null}
              </YStack>
              {error ? <Text color="$error">{error}</Text> : null}
              <PrimaryButton
                testID="onboarding-continue"
                disabled={saving || !displayName.trim() || !ageValid}
                onPress={handleNext}
              >
                Continue
              </PrimaryButton>
              <SecondaryButton onPress={() => navigation.navigate("PhotoSetup")}>
                Skip for now
              </SecondaryButton>
            </YStack>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const IntentPill = styled(Card, {
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderRadius: "$5",
  borderWidth: 1,
  backgroundColor: "$backgroundSoft",
  borderColor: "$border",
  pressStyle: { opacity: 0.85, scale: 0.98 }
});
