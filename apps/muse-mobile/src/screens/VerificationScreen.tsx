import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "../components/Icon";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { PhotoQuickEdit } from "../components/PhotoQuickEdit";
import { ToggleRow } from "../components/SettingsRow";
import { friendlyError } from "../services/errors";
import { legal } from "../config/legal";
import { SelfieCamera } from "../components/SelfieCamera";
import { showToast } from "../components/Toast";
import { beginPhotoVerification, fetchVerificationStatus, SelfiePose, startSelfieCheck, submitSelfieCheck, VerificationState } from "../services/verificationService";
import { useAuthStore } from "../store/authStore";

/** Rejections the member fixes by changing their profile photos, not by retaking the selfie. */
const PHOTO_PROBLEMS = new Set(["photos-required", "first-photo-face", "first-photo-match", "other-photo-match", "ai-photo"]);
const reasonOf = (error: unknown) => (error as { details?: { reason?: unknown } } | null)?.details?.reason;

const STATES: Record<VerificationState, { title: string; text: string }> = {
  unverified: { title: "Let’s build a little trust.", text: "A quick live selfie confirms you're the person in your profile photos. You'll get a verified badge." },
  pending: { title: "Your check is in review.", text: "You’ll see the result here once your photo check is complete." },
  verified: { title: "Your photos are verified.", text: "Your current profile photos have a valid photo-verification approval." },
  rejected: { title: "Your check needs another look.", text: "This check wasn’t approved. Try again, or contact support for a review." },
  needs_recheck: { title: "Time for a fresh check.", text: "Your photos have changed or your approval has expired. Verification needs to be repeated." }
};

export function VerificationScreen() {
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<{ attempt: string; pose: SelfiePose } | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Once open, the photo editor stays open (several changes, saves mid-flight) until a new check starts.
  const [editingPhotos, setEditingPhotos] = useState(false);
  const hasPhotos = useAuthStore((state) => (state.profile?.photoUrls?.length ?? 0) > 0);
  const queryClient = useQueryClient();
  const uid = useAuthStore((state) => state.user?.uid);
  const photosKey = useAuthStore((state) => JSON.stringify(state.profile?.photoUrls ?? []));
  const status = useQuery({ queryKey: ["verification", uid, photosKey], queryFn: fetchVerificationStatus, enabled: Boolean(uid), staleTime: 0, retry: 1, placeholderData: keepPreviousData });
  const refetch = status.refetch;
  useFocusEffect(useCallback(() => { if (uid) void refetch(); }, [uid, refetch]));
  const verified = status.data?.state === "verified" && !status.isError && !status.isFetching;
  const copy = status.isError
    ? { title: "We couldn’t check your status.", text: "Check your connection and try again. We can’t confirm verification right now." }
    : status.isPending || status.isFetching
      ? { title: "Checking your status…", text: "Fetching the latest photo-verification result." }
      : STATES[status.data?.state ?? "unverified"];
  const available = status.data?.captureAvailable === true && !status.isError;
  const selfieMethod = status.data?.method === "selfie";
  const begin = async () => {
    if (!consent) return;
    setStarting(true); setError(null); setProblem(null);
    try {
      if (selfieMethod) {
        setSelfie(await startSelfieCheck());
        setEditingPhotos(false);
        return;
      }
      const result = await beginPhotoVerification();
      if (Platform.OS === "web") window.location.assign(result.url);
      else { await Linking.openURL(result.url); await status.refetch(); }
    }
    catch (error) {
      if (reasonOf(error) === "photos-required") setProblem("photos-required");
      setError(friendlyError(error, "We couldn’t open your photo check. Please try again."));
    }
    finally { setStarting(false); }
  };
  const submit = async (image: string) => {
    if (!selfie || !image) return;
    setChecking(true); setError(null); setProblem(null);
    try {
      const result = await submitSelfieCheck(selfie.attempt, image);
      setSelfie(null);
      if (result.approved) {
        showToast("You're verified! Your badge is live.", "success");
        await queryClient.invalidateQueries({ queryKey: ["verification"] });
      } else {
        setError(result.reason ?? "Your check wasn't approved. Please try again.");
        setProblem(result.code ?? null);
      }
    } catch (error) {
      setSelfie(null);
      setError(friendlyError(error, "We couldn’t check your selfie. Please try again."));
    } finally {
      setChecking(false);
    }
  };
  const photosFixed = useCallback(() => {
    setProblem(null);
    setError((current) => (current ? "Photos updated. Take your selfie again when you're ready." : current));
  }, []);
  const needsPhotoFix = !verified && available && (problem ? PHOTO_PROBLEMS.has(problem) : !hasPhotos);
  useEffect(() => { if (needsPhotoFix) setEditingPhotos(true); }, [needsPhotoFix]);
  const fixPhotos = !verified && (needsPhotoFix || editingPhotos);
  if (selfie) {
    return (
      // A new key starts this step at the top, not at the previous step's scroll position.
      <Screen key="selfie-check" scroll testID="selfie-check" header={<ScreenHeader title="Photo verification" />}>
        <YStack gap="$4" paddingTop="$3">
          <XStack gap="$3" alignItems="center" padding="$4" borderRadius={24} backgroundColor="$primarySoft">
            <Text fontSize={44} lineHeight={52} accessible={false}>{selfie.pose.emoji}</Text>
            <YStack flex={1} gap={4}>
              <Text fontSize="$5" fontWeight="700" accessibilityRole="header" testID="selfie-pose">{selfie.pose.label}</Text>
              <Text color="$textMuted" fontSize="$2">Face the camera in good light. Only you in the shot.</Text>
            </YStack>
          </XStack>
          <SelfieCamera busy={checking} onCapture={(image) => void submit(image)} />
          {checking ? <Text color="$textMuted" textAlign="center" accessibilityLiveRegion="polite">Checking your selfie against your photos… this takes a few seconds.</Text> : null}
          <SecondaryButton disabled={checking} onPress={() => setSelfie(null)}>Cancel</SecondaryButton>
        </YStack>
      </Screen>
    );
  }
  return (
    <Screen scroll testID="verification-screen" header={<ScreenHeader title="Photo verification" />}>
      <YStack gap="$5" paddingTop="$4">
        {error ? (
          <YStack testID="verification-error" gap="$2" padding="$4" borderRadius={20} backgroundColor="$backgroundStrong" borderWidth={1} borderColor="$error" accessibilityLiveRegion="polite">
            <Text fontWeight="700" color="$error">Not verified yet</Text>
            <Text color="$text" lineHeight={22}>{error}</Text>
            {available && consent && !verified && hasPhotos ? <PrimaryButton testID="verification-retry" loading={starting} onPress={() => void begin()}>Try again</PrimaryButton> : null}
          </YStack>
        ) : null}
        {fixPhotos ? (
          <PhotoQuickEdit
            testID="verification-photos"
            title={hasPhotos ? "Change your photos here" : "First, add a photo of you"}
            text={hasPhotos ? "Make your first photo a clear, recent one of just you. Changes save straight away." : "Your selfie is matched to your profile photos. Add a clear, recent photo where your face shows. It saves straight away."}
            onSaved={photosFixed}
          />
        ) : null}
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
          {(selfieMethod ? [
            ["01", "A live selfie with a pose", "We'll ask for a random pose, like a thumbs-up, so it has to be you, right now."],
            ["02", "A match to your photos", "Your selfie is compared with every profile photo. Your first photo must clearly show you."],
            ["03", "A badge that stays honest", "Changing your photos or an expired approval (after 90 days) means a fresh check."]
          ] : [
            ["01", "A live selfie", "A short camera check, rather than an uploaded picture."],
            ["02", "A match to your photos", "A live face match to your first photo, followed by review of every profile photo."],
            ["03", "A badge that stays honest", "Changing your photos or an expired approval means a fresh check."]
          ]).map(([step, title, description]) => (
            <XStack key={step} gap="$3"><Text fontSize="$2" color="$primary" fontWeight="700" paddingTop={3}>{step}</Text><YStack flex={1} gap={3}><Text fontWeight="700">{title}</Text><Text color="$textMuted" fontSize="$2" lineHeight={21}>{description}</Text></YStack></XStack>
          ))}
        </YStack>
        <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor="$primarySoft">
          <Text fontWeight="700">{available ? "A free check, with your permission" : "Photo verification is coming soon"}</Text>
          <Text color="$textMuted" fontSize="$2" lineHeight={21}>{available ? (selfieMethod ? "Paire compares your selfie with your profile photos using a face-matching model, and Google's Gemini checks the pose and that it's a live photo. Your selfie is never stored: it's deleted as soon as the check ends. Only the result is kept. Your badge expires after 90 days." : "Didit handles the live camera check. Paire reviews your profile photos before approval. Only the result and checked profile photos are kept in Paire; we don’t store your selfie or identity document. Your photo badge expires after 90 days.") : "Live photo checks aren’t available yet. You can’t submit a selfie or receive a new badge here. Verification will be free for everyone."}</Text>
        </YStack>
        {available && !verified ? <ToggleRow testID="verification-consent" icon="shield-outline" label="I agree to the live photo check" description={selfieMethod ? "Paire may process my selfie and profile photos for face matching, and send them to Google Gemini to check the pose, that it's live and that my photos are real. My selfie is deleted right after. I can decline and still use account settings and safety tools." : "Didit will process my selfie and profile photo for liveness and face matching. Paire will review all my checked profile photos. I can decline and still use account settings and safety tools."} value={consent} onValueChange={setConsent} /> : null}
        <PrimaryButton testID="verification-start" loading={starting} disabled={!available || !consent || verified || !hasPhotos || status.isFetching} onPress={() => void begin()}>{verified ? "Current photos verified" : available && !hasPhotos ? "Add a photo to start" : available ? (selfieMethod ? "Start my selfie check" : "Open my live photo check") : "Live photo check coming soon"}</PrimaryButton>
        <SecondaryButton testID="verification-refresh" loading={status.isFetching} onPress={() => void status.refetch()}>Refresh my status</SecondaryButton>
        <Text color="$textMuted" fontSize="$2" lineHeight={21}>A photo badge confirms a photo check. It doesn’t guarantee someone’s intentions or safety. Generated or face-altered profile photos won’t be allowed; suspicious checks will need review.</Text>
        {legal.supportEmail ? <SecondaryButton onPress={() => void Linking.openURL(`mailto:${legal.supportEmail}?subject=Photo%20verification%20review`)}>Contact support for a review</SecondaryButton> : null}
      </YStack>
    </Screen>
  );
}
