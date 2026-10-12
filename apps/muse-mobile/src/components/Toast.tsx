import { useEffect, useRef } from "react";
import { Animated, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack } from "tamagui";
import { create } from "zustand";
import { Icon } from "./Icon";

type Tone = "info" | "success" | "error";
type ToastState = { id: number; message: string; tone: Tone } | null;

const useToastStore = create<{ toast: ToastState; show: (message: string, tone: Tone) => void; hide: () => void }>(
  (set) => ({
    toast: null,
    show: (message, tone) => set({ toast: { id: Date.now(), message, tone } }),
    hide: () => set({ toast: null })
  })
);

/** Brief, non-blocking feedback (instead of blocking alerts). */
export function showToast(message: string, tone: Tone = "info") {
  useToastStore.getState().show(message, tone);
}

const ICONS = { info: "information-circle", success: "checkmark-circle", error: "alert-circle" } as const;

export function ToastHost() {
  const toast = useToastStore((state) => state.toast);
  const hide = useToastStore((state) => state.hide);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => hide());
    }, 3500);
    return () => clearTimeout(timer);
  }, [hide, opacity, toast]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, opacity, zIndex: 1000 }}
    >
      <Pressable onPress={hide} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <XStack
          backgroundColor="$text"
          borderRadius="$4"
          paddingHorizontal="$4"
          paddingVertical="$3"
          gap="$2"
          alignItems="center"
          shadowColor="#000"
          shadowOpacity={0.2}
          shadowRadius={12}
          shadowOffset={{ width: 0, height: 6 }}
          elevation={6}
        >
          <Icon
            name={ICONS[toast.tone]}
            size={20}
            color={toast.tone === "error" ? "nope" : toast.tone === "success" ? "like" : "background"}
          />
          <Text color="$background" flex={1} fontSize="$3">
            {toast.message}
          </Text>
        </XStack>
      </Pressable>
    </Animated.View>
  );
}
