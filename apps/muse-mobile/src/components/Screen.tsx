import type { ReactElement, ReactNode } from "react";
import { ScrollView, type RefreshControlProps, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";

type Edge = "top" | "bottom";

type ScreenProps = {
  children: ReactNode;
  /** Scrollable content (forms, long pages). */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens omit "bottom": the tab bar covers it. */
  edges?: Edge[];
  padded?: boolean;
  /** Pinned bottom area (e.g. the primary action); stays above the keyboard. */
  footer?: ReactNode;
  /** Pinned navigation above long scrollable content. */
  header?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
  testID?: string;
};

/**
 * Screen layout with safe areas. The whole screen avoids the keyboard, so the
 * scroll area shrinks and the footer sits on top of the keyboard instead of
 * floating over form fields. Android scrolls a focused input into view.
 */
export function Screen({
  children,
  scroll,
  edges = ["top", "bottom"],
  padded = true,
  footer,
  header,
  contentContainerStyle,
  refreshControl,
  testID
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const top = edges.includes("top") ? insets.top : 0;
  const bottom = edges.includes("bottom") && !keyboardVisible ? insets.bottom : 0;
  const horizontal = padded ? 16 : 0;

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      contentContainerStyle={[
        {
          flexGrow: 1,
          paddingHorizontal: horizontal,
          paddingTop: 8,
          paddingBottom: footer ? 16 : bottom + 24
        },
        contentContainerStyle
      ]}
    >
      {children}
    </ScrollView>
  ) : (
    <YStack flex={1} paddingHorizontal={horizontal} paddingTop={8} paddingBottom={footer ? 0 : bottom}>
      {children}
    </YStack>
  );

  const content = (
    <>
      {body}
      {footer ? (
        <YStack paddingHorizontal={16} paddingTop="$3" paddingBottom={bottom ? bottom + 8 : 12} gap="$2" backgroundColor="$background">
          {footer}
        </YStack>
      ) : null}
    </>
  );

  return (
    // Top inset lives outside the scroll view so content never slides under the status bar.
    <YStack flex={1} backgroundColor="$background" paddingTop={top} testID={testID}>
      {header ? <YStack flexShrink={0} paddingHorizontal={horizontal} paddingTop={8}>{header}</YStack> : null}
      {scroll || footer ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </YStack>
  );
}
