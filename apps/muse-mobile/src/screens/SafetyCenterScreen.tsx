import { useState } from "react";
import { Alert, Linking, Share } from "react-native";
import { Card, Text, XStack, YStack, styled } from "tamagui";
import { Screen } from "../components/Screen";
import { MuseInput } from "../components/MuseInput";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { useAuthStore } from "../store/authStore";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { getLocationSnapshot } from "../utils/location";

const checkInOptions = [30, 60, 90];

export function SafetyCenterScreen() {
  const user = useAuthStore((state) => state.user);
  const [dateLocation, setDateLocation] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInMinutes, setCheckInMinutes] = useState(60);
  const [checkInActive, setCheckInActive] = useState(false);

  const handleEmergency = () => {
    Linking.openURL("tel:112").catch(() => {
      Alert.alert("Unable to call", "Please dial 112 from your phone app.");
    });
  };

  const handleShareLocation = async () => {
    try {
      const snapshot = await getLocationSnapshot();
      if (snapshot.status !== "granted" || !snapshot.location) {
        Alert.alert("Location unavailable", "Turn on location sharing to send your live spot.");
        return;
      }
      const url = `https://www.google.com/maps?q=${snapshot.location.lat},${snapshot.location.lng}`;
      await Share.share({ message: `My live location: ${url}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to fetch your location.";
      Alert.alert("Location error", message);
    }
  };

  const handleSavePlan = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        dateLocation: dateLocation.trim(),
        dateTime: dateTime.trim(),
        notes: notes.trim(),
        updatedAt: Date.now()
      };
      await setDoc(doc(db, "users", user.uid, "private", "safetyPlan"), payload, { merge: true });
      Alert.alert("Plan saved", "You can share this plan with a trusted person anytime.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save your safety plan.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSharePlan = async () => {
    const chunks = [
      dateLocation ? `Location: ${dateLocation}` : null,
      dateTime ? `Time: ${dateTime}` : null,
      notes ? `Notes: ${notes}` : null
    ].filter(Boolean);
    if (!chunks.length) {
      Alert.alert("Add details", "Fill in a plan first so we can share it.");
      return;
    }
    await Share.share({ message: `My date plan\n${chunks.join("\n")}` });
  };

  const handleStartCheckIn = () => {
    setCheckInActive(true);
    Alert.alert("Check-in started", `We’ll remind you in ${checkInMinutes} minutes.`);
  };

  const handleCancelCheckIn = () => {
    setCheckInActive(false);
    Alert.alert("Check-in stopped", "Your timer was cancelled.");
  };

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <YStack gap="$2">
          <Text fontSize="$7" fontWeight="700">
            Safety center
          </Text>
          <Text color="$textMuted">
            Tools tailored for dating safely in India — quick access, clear controls.
          </Text>
        </YStack>

        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$3"
        >
          <Text fontWeight="700">Emergency actions</Text>
          <XStack gap="$3" flexWrap="wrap">
            <PrimaryButton onPress={handleEmergency} flex={1}>
              Call 112
            </PrimaryButton>
            <SecondaryButton onPress={handleShareLocation} flex={1}>
              Share live location
            </SecondaryButton>
          </XStack>
          <Text fontSize="$2" color="$textMuted">
            112 is India’s national emergency number. Use if you feel unsafe.
          </Text>
        </YStack>

        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$3"
        >
          <Text fontWeight="700">Date plan</Text>
          <Text color="$textMuted" fontSize="$2">
            Save a quick plan and share it with a trusted contact before you go.
          </Text>
          <MuseInput placeholder="Location / venue" value={dateLocation} onChangeText={setDateLocation} />
          <MuseInput placeholder="Time / meetup window" value={dateTime} onChangeText={setDateTime} />
          <MuseInput placeholder="Notes (ride, companion, etc.)" value={notes} onChangeText={setNotes} />
          {error ? <Text color="$error">{error}</Text> : null}
          <XStack gap="$3" flexWrap="wrap">
            <PrimaryButton onPress={handleSavePlan} disabled={saving} flex={1}>
              Save plan
            </PrimaryButton>
            <SecondaryButton onPress={handleSharePlan} flex={1}>
              Share plan
            </SecondaryButton>
          </XStack>
        </YStack>

        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$3"
        >
          <Text fontWeight="700">Check-in timer</Text>
          <Text color="$textMuted" fontSize="$2">
            Set a reminder to check in after your date starts. (Local reminder stub.)
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {checkInOptions.map((option) => {
              const active = checkInMinutes === option;
              return (
                <CheckInPill
                  key={`checkin-${option}`}
                  onPress={() => setCheckInMinutes(option)}
                  backgroundColor={active ? "$primarySoft" : "$backgroundSoft"}
                  borderColor={active ? "$primary" : "$border"}
                >
                  <Text fontWeight="600">{option} min</Text>
                </CheckInPill>
              );
            })}
          </XStack>
          {checkInActive ? (
            <Text fontSize="$2" color="$textMuted">
              Check-in active: {checkInMinutes} minutes. You’ll be prompted to confirm you’re safe.
            </Text>
          ) : null}
          <XStack gap="$3" flexWrap="wrap">
            <PrimaryButton onPress={handleStartCheckIn} flex={1}>
              Start check-in
            </PrimaryButton>
            <SecondaryButton onPress={handleCancelCheckIn} flex={1} disabled={!checkInActive}>
              Cancel
            </SecondaryButton>
          </XStack>
        </YStack>

        <YStack
          backgroundColor="$backgroundSoft"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontWeight="700">Safety tips</Text>
          <Text fontSize="$2" color="$textMuted">
            • Meet in public first and prefer daytime.
          </Text>
          <Text fontSize="$2" color="$textMuted">
            • Use in-app calls until you’re comfortable.
          </Text>
          <Text fontSize="$2" color="$textMuted">
            • Share your plan with a friend or sibling.
          </Text>
        </YStack>
      </YStack>
    </Screen>
  );
}

const CheckInPill = styled(Card, {
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderRadius: "$5",
  borderWidth: 1,
  backgroundColor: "$backgroundSoft",
  borderColor: "$border",
  pressStyle: { opacity: 0.85, scale: 0.98 }
});
