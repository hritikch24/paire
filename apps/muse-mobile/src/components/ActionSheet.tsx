import { Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Separator, Text, XStack, YStack } from "tamagui";
import { Icon, IconName } from "./Icon";

export type ActionSheetOption = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
  testID?: string;
};

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  onClose: () => void;
};

export function ActionSheet({ visible, title, options, onClose }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close menu">
        <YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end">
          <Pressable onPress={() => undefined}>
            <YStack
              backgroundColor="$backgroundStrong"
              borderTopLeftRadius="$6"
              borderTopRightRadius="$6"
              paddingTop="$3"
              paddingBottom={insets.bottom + 12}
            >
              {title ? (
                <Text textAlign="center" color="$textMuted" fontSize="$2" paddingBottom="$2">
                  {title}
                </Text>
              ) : null}
              {options.map((option, index) => (
                <YStack key={option.label}>
                  {index > 0 ? <Separator borderColor="$border" /> : null}
                  <Pressable
                    testID={option.testID}
                    accessibilityRole="button"
                    onPress={() => {
                      onClose();
                      option.onPress();
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <XStack paddingHorizontal="$5" paddingVertical="$4" gap="$3" alignItems="center">
                      {option.icon ? (
                        <Icon name={option.icon} size={22} color={option.destructive ? "error" : "text"} />
                      ) : null}
                      <Text fontSize="$4" color={option.destructive ? "$error" : "$text"} fontWeight="600">
                        {option.label}
                      </Text>
                    </XStack>
                  </Pressable>
                </YStack>
              ))}
              <Separator borderColor="$border" />
              <Pressable accessibilityRole="button" onPress={onClose}>
                <Text textAlign="center" paddingVertical="$4" fontSize="$4" color="$textMuted">
                  Cancel
                </Text>
              </Pressable>
            </YStack>
          </Pressable>
        </YStack>
      </Pressable>
    </Modal>
  );
}
