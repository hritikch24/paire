import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { diwaliOpen, normalizeDiwaliPlan } from "../data/diwali";
import type { RootStackParamList } from "../navigation/types";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";
import { Icon } from "./Icon";
import { notificationPromptShowing } from "./NotificationPrompt.web";

const USE_MS = 45_000;
const RETRY_MS = 10_000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_SHOWS = 3;
const key = (uid: string) => `paire.diwaliPromo.${uid}`;
const read = (uid: string): { at?: number; count?: number } => { try { return JSON.parse(localStorage.getItem(key(uid)) || "{}") || {}; } catch { return {}; } };
const write = (uid: string, value: { at: number; count: number }) => { try { localStorage.setItem(key(uid), JSON.stringify(value)); } catch { /* private mode: showing again is harmless */ } };

/**
 * A warm, closable invitation to Diwali Together. It waits until the member has actually used the app
 * for a bit (and never overlaps the notification prompt or a half-typed message), shows at most three
 * times a day apart, and goes away for good once they join, tap "Don't show again" or the campaign ends.
 */
export function DiwaliPromo() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const loaded = useAuthStore((state) => state.settingsLoaded);
  const rawPlan = useAuthStore((state) => state.settings?.diwaliPlan);
  const joined = useMemo(() => Boolean(normalizeDiwaliPlan(rawPlan)), [rawPlan]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Automated browsers (our acceptance runs) are never interrupted; tests that cover this say otherwise.
    if (!uid || !loaded || joined || isSupportView || navigator.webdriver || !diwaliOpen()) return;
    const { at = 0, count = 0 } = read(uid);
    if (count >= MAX_SHOWS || Date.now() - at < COOLDOWN_MS) return;
    let used = 0, cancelled = false;
    // Count time only while Paire is in front of the member.
    const tick = setInterval(() => { if (document.visibilityState === "visible") used += 1_000; }, 1_000);
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (cancelled) return;
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "");
      if (used < USE_MS || typing || notificationPromptShowing() || document.visibilityState !== "visible") { timer = setTimeout(attempt, used < USE_MS ? 1_000 : RETRY_MS); return; }
      write(uid, { at: Date.now(), count: count + 1 });
      setOpen(true);
    };
    timer = setTimeout(attempt, 1_000);
    return () => { cancelled = true; clearInterval(tick); clearTimeout(timer); };
  }, [uid, loaded, joined]);

  if (!uid || !open) return null;
  const close = () => setOpen(false);
  const never = () => { write(uid, { at: Date.now(), count: MAX_SHOWS }); setOpen(false); };
  const join = () => {
    // Opening the sheet is the member's own choice: nothing is saved until they confirm there.
    write(uid, { at: Date.now(), count: MAX_SHOWS });
    setOpen(false);
    navigation.navigate("App", { screen: "Tabs", params: { screen: "Discover", params: { intent: { edition: "diwali", nonce: Date.now() } } } });
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <YStack flex={1} backgroundColor="$overlay" justifyContent="center" alignItems="center" padding="$3">
        <YStack testID="diwali-promo" width="100%" maxWidth={400} maxHeight="94%" borderRadius="$6" overflow="hidden" backgroundColor="#1B1020" accessibilityRole="alert">
          {/* Pinned outside the scrolling content so it is always reachable on short screens. */}
          <XStack position="absolute" top={6} right={6} zIndex={2}>
            <Pressable testID="diwali-promo-close" accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#1B1020" }}>
              <Icon name="close" size={22} color="textMuted" />
            </Pressable>
          </XStack>
          <ScrollView>
          <YStack padding="$5" paddingTop="$6" gap="$3" backgroundColor="#1B1020">
            <XStack alignItems="center" gap="$2" paddingRight={36}>
              <Text fontSize={34}>🪔</Text>
              <Text fontSize={11} fontWeight="700" letterSpacing={1.6} color="#F0B04A">DIWALI TOGETHER · OPEN TILL 10 NOV</Text>
            </XStack>
            <Text accessibilityRole="header" fontSize={26} lineHeight={32} fontWeight="700" color="#FBF3E6">Away from home this Diwali?</Text>
            <Text fontSize="$3" lineHeight={22} color="#CBB9CF">
              Share chai and mithai, a mela stroll or a walk to see the lights with someone nearby who'd enjoy it too. Pick your days and plans, and you'll only meet people who pick the same and say yes back.
            </Text>
            <YStack gap={6} paddingVertical="$1">
              {["Free and completely optional", "Public places, mutual yes only", "Leave anytime. Paire never asks where you live"].map((line) => (
                <XStack key={line} gap="$2" alignItems="center">
                  <Text color="#F0B04A">✦</Text>
                  <Text fontSize="$2" color="#FBF3E6" flex={1}>{line}</Text>
                </XStack>
              ))}
            </YStack>
            <Pressable testID="diwali-promo-join" accessibilityRole="button" onPress={join} style={{ minHeight: 52, borderRadius: 999, backgroundColor: "#F0B04A", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
              <Text fontSize="$4" fontWeight="700" color="#1B1020">See Diwali Together</Text>
            </Pressable>
            <Pressable testID="diwali-promo-later" accessibilityRole="button" onPress={close} style={{ minHeight: 48, borderRadius: 999, borderWidth: 1.5, borderColor: "#FBF3E6", alignItems: "center", justifyContent: "center" }}>
              <Text fontSize="$3" fontWeight="600" color="#FBF3E6">Maybe later</Text>
            </Pressable>
            <Pressable testID="diwali-promo-never" accessibilityRole="button" onPress={never} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Text fontSize="$2" color="#CBB9CF" textDecorationLine="underline">Don't show this again</Text>
            </Pressable>
            <Text fontSize={11} color="#CBB9CF" textAlign="center">18+ · Paire doesn't host events or promise matches</Text>
          </YStack>
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  );
}
