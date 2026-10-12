import { useState } from "react";
import { Linking, Modal } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, YStack } from "tamagui";
import { legal } from "../config/legal";
import { deleteAccount } from "../services/accountService";
import { friendlyError, isCancelledPopup } from "../services/errors";
import { hasPasswordLogin } from "../services/googleAuth";
import { GhostButton, PrimaryButton, SecondaryButton } from "./MuseButton";
import { PasswordField } from "./MuseInput";
import { showToast } from "./Toast";

type DeleteAccountSheetProps = { visible: boolean; onClose: () => void };

/** Permanent account deletion, confirmed with the member's password. */
export function DeleteAccountSheet({ visible, onClose }: DeleteAccountSheetProps) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    if (deleting) return;
    setPassword("");
    setError(null);
    onClose();
  };

  // Google accounts have no password: they confirm with a fresh Google sign-in instead.
  const usesPassword = hasPasswordLogin();

  const handleDelete = async () => {
    if ((usesPassword && !password) || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(usesPassword ? password : null);
      showToast("Your account and data have been deleted.", "success");
    } catch (err) {
      if (!isCancelledPopup(err)) setError(friendlyError(err, "We couldn't delete your account. Please try again."));
      setDeleting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end">
          <YStack
            backgroundColor="$background"
            borderTopLeftRadius="$6"
            borderTopRightRadius="$6"
            padding="$5"
            paddingBottom={Math.max(insets.bottom, 16) + 8}
            gap="$4"
          >
            <Text fontSize="$7" fontWeight="700" accessibilityRole="header">
              Delete your account?
            </Text>
            <Text color="$textMuted">
              This permanently deletes your profile, photos, matches and messages. It can't be undone. Reports made for
              safety may be kept as described in our Privacy Policy.
            </Text>
            {usesPassword ? (
              <PasswordField
                testID="delete-password"
                label="Enter your password to confirm"
                placeholder="Password"
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                error={error}
              />
            ) : (
              <YStack gap="$1">
                <Text color="$textMuted" fontSize="$2">
                  You'll confirm with Google before anything is deleted.
                </Text>
                {error ? <Text color="$error" fontSize="$2">{error}</Text> : null}
              </YStack>
            )}
            <PrimaryButton
              testID="delete-confirm"
              backgroundColor="$error"
              pressStyle={{ backgroundColor: "$error", opacity: 0.9 }}
              onPress={handleDelete}
              disabled={usesPassword && !password}
              loading={deleting}
            >
              {usesPassword ? "Delete my account" : "Confirm with Google and delete"}
            </PrimaryButton>
            <SecondaryButton onPress={close} disabled={deleting}>
              Cancel
            </SecondaryButton>
            <GhostButton onPress={() => void Linking.openURL(legal.deleteAccountUrl)}>
              What gets deleted?
            </GhostButton>
          </YStack>
        </YStack>
      </KeyboardAvoidingView>
    </Modal>
  );
}
