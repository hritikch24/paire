import { useMemo, useState } from "react";
import { Linking, PermissionsAndroid, Platform, Share, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { WebView } from "react-native-webview";
import { Screen } from "../components/Screen";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { RouteProp, useRoute } from "@react-navigation/native";
import { AppStackParamList } from "../navigation/stacks/AppStack";
import { buildCallUrl } from "../utils/call";
import { useAuthStore } from "../store/authStore";
import { CALL_DOMAIN } from "../config/call";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

export function CallScreen() {
  const route = useRoute<RouteProp<AppStackParamList, "Call">>();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const profile = useAuthStore((state) => state.profile);
  const { roomId, video } = route.params;
  const [loading, setLoading] = useState(true);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [webError, setWebError] = useState(false);
  const [webKey, setWebKey] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const callUrl = useMemo(
    () => buildCallUrl(roomId, profile?.displayName ?? "Muse", video),
    [roomId, profile?.displayName, video]
  );

  const handleShare = async () => {
    const url = `https://${CALL_DOMAIN}/${roomId}`;
    await Share.share({ message: `Join my Muse call: ${url}` });
  };

  const requestPermissions = async () => {
    if (process.env.NODE_ENV === "test") return true;
    if (Platform.OS !== "android") return true;
    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (video) {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const allGranted = permissions.every(
      (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED
    );
    if (!allGranted) {
      const blocked = permissions.some(
        (permission) => results[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      );
      setPermissionError(
        blocked
          ? "Permission blocked. Enable microphone/camera in Settings."
          : "Microphone/camera permission is required to start the call."
      );
    } else {
      setPermissionError(null);
    }
    return allGranted;
  };

  return (
    <Screen>
      <YStack flex={1} gap="$3">
        <XStack justifyContent="space-between" alignItems="center">
          <YStack>
            <Text fontWeight="700">{video ? "Video call" : "Audio call"}</Text>
            <Text fontSize="$2" color="$textMuted">
              Room: {roomId}
            </Text>
          </YStack>
          <XStack gap="$2">
            <SecondaryButton onPress={handleShare}>Share</SecondaryButton>
            <SecondaryButton onPress={() => navigation.goBack()}>End</SecondaryButton>
          </XStack>
        </XStack>
        <YStack
          backgroundColor="$backgroundStrong"
          padding="$3"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontSize="$2" color="$textMuted">
            Muse calls are free and never recorded. Share responsibly.
          </Text>
          <Text fontSize="$2" color="$textMuted">
            By joining you agree to be respectful and to end the call if anyone feels unsafe.
          </Text>
          {permissionError ? (
            <YStack gap="$2">
              <Text color="$textMuted" fontSize="$2">
                {permissionError}
              </Text>
              <PrimaryButton onPress={() => Linking.openSettings()}>
                Open settings
              </PrimaryButton>
              <SecondaryButton
                onPress={async () => {
                  const granted = await requestPermissions();
                  if (granted) {
                    setConsentAccepted(true);
                    setWebError(false);
                    setLoading(true);
                  }
                }}
              >
                Try again
              </SecondaryButton>
            </YStack>
          ) : !consentAccepted ? (
            <SecondaryButton
              testID="call-join"
              onPress={async () => {
                const granted = await requestPermissions();
                if (!granted) return;
                setConsentAccepted(true);
                setWebError(false);
                setLoading(true);
              }}
            >
              Join call
            </SecondaryButton>
          ) : null}
        </YStack>

        {consentAccepted ? (
          <View style={{ flex: 1, borderRadius: 18, overflow: "hidden" }}>
            {webError ? (
              <YStack
                flex={1}
                alignItems="center"
                justifyContent="center"
                backgroundColor="$backgroundSoft"
                padding="$4"
                gap="$3"
              >
                <Text fontWeight="700">We couldn’t load the call</Text>
                <Text fontSize="$2" color="$textMuted" textAlign="center">
                  Try again or open the call in your browser.
                </Text>
                <PrimaryButton onPress={() => Linking.openURL(callUrl)}>Open in browser</PrimaryButton>
                <SecondaryButton
                  onPress={() => {
                    setWebError(false);
                    setLoading(true);
                    setWebKey((prev) => prev + 1);
                  }}
                >
                  Try again
                </SecondaryButton>
              </YStack>
            ) : (
              <WebView
                key={`call-${webKey}`}
                source={{ uri: callUrl }}
                onLoadEnd={() => setLoading(false)}
                onError={() => setWebError(true)}
                onPermissionRequest={(event: { grant: () => void }) => event.grant()}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
              />
            )}
            {loading ? (
              <YStack
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                alignItems="center"
                justifyContent="center"
                backgroundColor="$backgroundSoft"
              >
                <Text color="$textMuted">Connecting call...</Text>
              </YStack>
            ) : null}
          </View>
        ) : (
          <YStack
            flex={1}
            borderRadius="$4"
            backgroundColor="$backgroundSoft"
            alignItems="center"
            justifyContent="center"
            padding="$4"
          >
            <Text fontWeight="700">Ready when you are</Text>
            <Text fontSize="$2" color="$textMuted" textAlign="center">
              Tap “Join call” to start the in-app call experience.
            </Text>
          </YStack>
        )}
      </YStack>
    </Screen>
  );
}
