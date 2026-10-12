import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { Text, YStack } from "tamagui";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { LoadingView } from "../components/States";
import { callFunction } from "../services/firebase";
import { friendlyError } from "../services/errors";
import { useAuthStore } from "../store/authStore";
import type { AppStackParamList } from "../navigation/types";

/**
 * In-app call between matches over a Jitsi deployment (self-hosted or 8x8 JaaS).
 * Only registered when EXPO_PUBLIC_CALL_DOMAIN is set; see src/config/features.ts.
 */
async function requestMediaPermissions(video: boolean) {
  if (Platform.OS !== "android") return true;
  const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, ...(video ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
  const results = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED);
}

export function CallScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<AppStackParamList, "Call">>();
  const { matchId, video } = route.params;
  const name = useAuthStore((state) => state.profile?.displayName ?? "Paire member");
  const [joined, setJoined] = useState(false);
  const [denied, setDenied] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setJoining(true); setError(null);
    try {
      const session = await callFunction<{ url: string }>("createCallSession", { matchId });
      const granted = await requestMediaPermissions(video);
      setDenied(!granted);
      if (granted) {
        setUrl(`${session.url}#userInfo.displayName=${encodeURIComponent(JSON.stringify(name))}&config.prejoinConfig.enabled=false&config.disableDeepLinking=true&config.startWithVideoMuted=${!video}&config.startWithAudioMuted=false`);
        setJoined(true);
      }
    } catch (error) { setError(friendlyError(error, "We couldn’t connect this call. Please try again.")); }
    finally { setJoining(false); }
  };

  return (
    <Screen padded={!joined}>
      <ScreenHeader title={video ? "Video call" : "Voice call"} back="close" />
      {joined && url ? (
        <WebView
          source={{ uri: url }}
          style={{ flex: 1 }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          startInLoadingState
          renderLoading={() => <LoadingView label="Connecting…" />}
        />
      ) : (
        <YStack flex={1} justifyContent="center" gap="$4" padding="$4">
          <Text fontSize="$6" fontWeight="700" textAlign="center">
            Ready to call?
          </Text>
          <Text color="$textMuted" textAlign="center">
            Join through our call provider, 8x8. Recording controls are disabled in Paire. Be respectful, and end the call any time you feel uncomfortable.
          </Text>
          {denied ? (
            <Text color="$error" textAlign="center">
              Microphone{video ? " and camera" : ""} access is needed. Allow it in your phone settings.
            </Text>
          ) : null}
          {error ? <Text color="$error" accessibilityLiveRegion="polite">{error}</Text> : null}
          <PrimaryButton loading={joining} onPress={() => void join()}>Join call</PrimaryButton>
          <SecondaryButton onPress={() => navigation.goBack()}>Cancel</SecondaryButton>
        </YStack>
      )}
    </Screen>
  );
}
