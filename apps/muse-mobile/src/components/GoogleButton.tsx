import { useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";
import { Text, XStack } from "tamagui";
import { friendlyError, isCancelledPopup } from "../services/errors";
import { googleSignInAvailable, signInWithGoogle } from "../services/googleAuth";
import { Icon } from "./Icon";

/**
 * "Continue with Google" (web). Renders nothing where Google sign-in isn't
 * available. The session listener routes new members to the 18+ basics step.
 */
export function GoogleButton({
  onError,
  disabled = false,
  testID = "google-signin"
}: {
  onError: (message: string | null) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const [busy, setBusy] = useState(false);
  if (!googleSignInAvailable) return null;

  const handlePress = async () => {
    if (busy || disabled) return;
    setBusy(true);
    onError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      if (!isCancelledPopup(error)) onError(friendlyError(error, "Google sign-in didn't work. Please try again or use email."));
      setBusy(false);
    }
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ busy, disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={() => void handlePress()}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed || busy ? 0.75 : 1 })}
    >
      <XStack
        minHeight={52}
        borderRadius={999}
        borderWidth={1}
        borderColor="$border"
        backgroundColor="$backgroundStrong"
        alignItems="center"
        justifyContent="center"
        gap="$2"
        paddingHorizontal="$4"
      >
        {busy ? <ActivityIndicator /> : <Icon name="logo-google" size={20} color="#4285F4" />}
        <Text fontSize="$4" fontWeight="700">
          Continue with Google
        </Text>
      </XStack>
    </Pressable>
  );
}
