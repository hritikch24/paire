import { ScrollView, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { YStack } from "tamagui";
import { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  scrollEnabled?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, "contentContainerStyle">;
  extraBottomPadding?: number;
};

export function Screen({
  children,
  scrollable = false,
  scrollEnabled,
  contentContainerStyle,
  scrollViewProps,
  extraBottomPadding = 0
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = Math.max(insets.top, 16);
  const resolvedExtra = Math.max(0, extraBottomPadding);
  const paddingBottom = Math.max(insets.bottom, 16) + resolvedExtra;

  return (
    <YStack flex={1} backgroundColor="$background">
      {scrollable ? (
        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled={scrollEnabled}
          contentContainerStyle={[
            {
              paddingHorizontal: 16,
              paddingTop,
              paddingBottom
            },
            contentContainerStyle
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      ) : (
        <YStack flex={1} padding="$4" paddingTop={paddingTop} paddingBottom={paddingBottom}>
          {children}
        </YStack>
      )}
    </YStack>
  );
}
