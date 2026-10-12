import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Keyboard } from "react-native";
import { Text, YStack } from "tamagui";
import { Icon } from "../components/Icon";
import { GhostButton, PrimaryButton } from "../components/MuseButton";
import { TextField } from "../components/MuseInput";
import { Screen } from "../components/Screen";
import { useScheme } from "../store/appearanceStore";
import { useTestServerStore } from "../store/testServerStore";
import { serverLabel } from "../utils/serverAddress";

/** Test-server builds: connect to the host's test server, or reconnect to it. */
export function TestServerScreen() {
  const scheme = useScheme();
  const status = useTestServerStore((state) => state.status);
  const origin = useTestServerStore((state) => state.origin);
  const busy = useTestServerStore((state) => state.busy);
  const cancellable = useTestServerStore((state) => state.cancellable);
  const error = useTestServerStore((state) => state.error);
  const [address, setAddress] = useState("");
  const offline = status === "offline";
  const hasAddress = address.trim().length > 0;

  const submit = () => {
    if (busy) return;
    Keyboard.dismiss();
    const store = useTestServerStore.getState();
    if (hasAddress) void store.connect(address);
    else if (offline) void store.retry();
  };

  return (
    <Screen
      scroll
      footer={
        <YStack gap="$2">
          <PrimaryButton testID="test-server-connect" onPress={submit} disabled={!hasAddress && !offline} loading={busy}>
            {hasAddress || !offline ? "Connect" : "Try again"}
          </PrimaryButton>
          {cancellable ? <GhostButton onPress={() => useTestServerStore.getState().cancel()}>Cancel</GhostButton> : null}
        </YStack>
      }
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <YStack alignItems="center" gap="$3" marginTop="$8" marginBottom="$6">
        <YStack
          width={72}
          height={72}
          borderRadius={36}
          backgroundColor="$primarySoft"
          alignItems="center"
          justifyContent="center"
        >
          <Icon name={offline ? "cloud-offline-outline" : "link-outline"} size={34} color="primary" />
        </YStack>
        <Text fontSize="$8" fontWeight="700" textAlign="center" accessibilityRole="header">
          {offline ? "Can't reach the test server" : "Connect to the test server"}
        </Text>
        <Text color="$textMuted" fontSize="$4" textAlign="center">
          {offline
            ? `${serverLabel(origin)} isn't answering. The host's computer may be off or offline, or there may be a new invite link.`
            : 'Paire Test runs on a test server on the host\'s computer. Open the invite link you were sent and tap "Open in Paire Test", or paste the link here.'}
        </Text>
      </YStack>
      <TextField
        testID="test-server-address"
        label={offline ? "New invite link (optional)" : "Invite link"}
        placeholder="https://….trycloudflare.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        value={address}
        onChangeText={setAddress}
        onSubmitEditing={submit}
        error={error}
      />
    </Screen>
  );
}
