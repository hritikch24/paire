import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Linking, Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "../components/Icon";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { ToggleRow } from "../components/SettingsRow";
import { friendlyError } from "../services/errors";
import { legal } from "../config/legal";
import { beginPhotoVerification, fetchVerificationStatus, VerificationState } from "../services/verificationService";
import { useAuthStore } from "../store/authStore";

const STATES: Record<VerificationState, { title: string; text: string }> = {
  unverified: { title: "Let’s build a little trust.", text: "Photo verification will help confirm you match your profile photos." },
  pending: { title: "Your check is in review.", text: "You’ll see the result here once your photo check is complete." },
  verified: { title: "Your photos are verified.", text: "Your current profile photos have a valid photo-verification approval." },
  rejected: { title: "Your check needs another look.", text: "This check wasn’t approved. You can contact support for a review." },
  needs_recheck: { title: "Time for a fresh check.", text: "Your photos have changed or your approval has expired. Verification needs to be repeated." }
};

export function VerificationScreen() {
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useAuthStore((state) => state.user?.uid);
  const photosKey = useAuthStore((state) => JSON.stringify(state.profile?.photoUrls ?? []));
  const status = useQuery({ queryKey: ["verification", uid, photosKey], queryFn: fetchVerificationStatus, enabled: Boolean(uid), staleTime: 0, retry: 1 });
  const refetch = status.refetch;
  useFocusEffect(useCallback(() => { if (uid) void refetch(); }, [uid, refetch]));
  const verified = status.data?.state === "verified" && !status.isError && !status.isFetching;
  const copy = status.isError
    ? { title: "We couldn’t check your status.", text: "Check your connection and try again. We can’t confirm verification right now." }
    : status.isPending || status.isFetching
      ? { title: "Checking your status…", text: "Fetching the latest photo-verification result." }
      : STATES[status.data?.state ?? "unverified"];
  const available = status.data?.captureAvailable === true && !status.isError;
  const begin = async () => {
    if (!consent) return;
    setStarting(true); setError(null);
    try {
      const result = await beginPhotoVerification();
      if (Platform.OS === "web") window.location.assign(result.url);
      else { await Linking.openURL(result.url); await status.refetch(); }
    }
    catch (error) { setError(friendlyError(error, "We couldn’t open your photo check. Please try again.")); }
    finally { setStarting(false); }
  };
  return (
    <Screen scroll testID="verification-screen" header={<ScreenHeader title="Photo verification" />}>
      <YStack gap="$5" paddingTop="$4">
        <YStack width={76} height={76} borderRadius={26} alignItems="center" justifyContent="center" backgroundColor="$primarySoft">
          <Icon name={verified ? "shield-checkmark" : "scan-outline"} size={38} color="primary" />
        </YStack>
        <YStack gap="$2" accessibilityLiveRegion="polite">
          <Text color="$primary" fontWeight="700" fontSize="$2" letterSpacing={2}>REAL PEOPLE. A BETTER START.</Text>
          <Text fontSize={32} lineHeight={39} fontWeight="700" accessibilityRole="header">{copy.title}</Text>
          <Text fontSize="$4" color="$textMuted" lineHeight={24}>{copy.text}</Text>
        </YStack>
        <YStack borderRadius={24} backgroundColor="$backgroundStrong" borderWidth={1} borderColor="$border" padding="$4" gap="$4">
          <Text fontSize="$5" fontWeight="700">How the photo check works</Text>
          {[
            ["01", "A live selfie", "A short camera check, rather than an uploaded picture."],
            ["02", "A match to your photos", "A live face match to your first photo, followed by review of every profile photo."],
            ["03", "A badge that stays honest", "Changing your photos or an expired approval means a fresh check."]
          ].map(([step, title, description]) => (
            <XStack key={step} gap="$3"><Text fontSize="$2" color="$primary" fontWeight="700" paddingTop={3}>{step}</Text><YStack flex={1} gap={3}><Text fontWeight="700">{title}</Text><Text color="$textMuted" fontSize="$2" lineHeight={21}>{description}</Text></YStack></XStack>
          ))}
        </YStack>
        <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor="$primarySoft">
          <Text fontWeight="700">{available ? "A free check, with your permission" : "Photo verification is coming soon"}</Text>
          <Text color="$textMuted" fontSize="$2" lineHeight={21}>{available ? "Didit handles the live camera check. Paire reviews your profile photos before approval. Only the result and checked profile photos are kept in Paire; we don’t store your selfie or identity document. Your photo badge expires after 90 days." : "Live photo checks aren’t available yet. You can’t submit a selfie or receive a new badge here. Verification will be free for everyone."}</Text>
        </YStack>
        {available && !verified ? <ToggleRow testID="verification-consent" icon="shield-outline" label="I agree to the live photo check" description="Didit will process my selfie and profile photo for liveness and face matching. Paire will review all my checked profile photos. I can decline and still use account settings and safety tools." value={consent} onValueChange={setConsent} /> : null}
        {error ? <Text color="$error" accessibilityLiveRegion="polite">{error}</Text> : null}
        <PrimaryButton testID="verification-start" loading={starting} disabled={!available || !consent || verified || status.isFetching} onPress={() => void begin()}>{verified ? "Current photos verified" : available ? "Open my live photo check" : "Live photo check coming soon"}</PrimaryButton>
        <SecondaryButton testID="verification-refresh" loading={status.isFetching} onPress={() => void status.refetch()}>Refresh my status</SecondaryButton>
        <Text color="$textMuted" fontSize="$2" lineHeight={21}>A photo badge confirms a photo check. It doesn’t guarantee someone’s intentions or safety. Generated or face-altered profile photos won’t be allowed; suspicious checks will need review.</Text>
        {legal.supportEmail ? <SecondaryButton onPress={() => void Linking.openURL(`mailto:${legal.supportEmail}?subject=Photo%20verification%20review`)}>Contact support for a review</SecondaryButton> : null}
      </YStack>
    </Screen>
  );
}
