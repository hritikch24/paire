import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { useSendPolicy } from "../hooks/useSendPolicy";
import { fetchPremiumStatus } from "../services/billingService";
import { useAuthStore } from "../store/authStore";
import { dismissOffer, offerDismissed } from "../utils/offerDismissal";
import { Icon } from "./Icon";
import type { AppStackParamList } from "../navigation/types";

/**
 * A quiet, dismissible nudge on a new match for a woman who sends free and has
 * no Plus. It never blocks the composer and carries no price: the Premium
 * screen shows the plans. Remembered per match in this browser.
 */
export function WomanPlusOffer({ matchId }: { matchId: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const policy = useSendPolicy().data ?? undefined;
  const freeSender = policy?.freeSender === true;
  // Same query (and cache) the rest of the app uses for Plus status.
  const premium = useQuery({ queryKey: ["premium", uid], queryFn: fetchPremiumStatus, enabled: Boolean(uid) && freeSender, retry: 1, staleTime: 5 * 60_000 });
  const [gone, setGone] = useState(() => offerDismissed(matchId));
  if (!freeSender || premium.data?.active !== false || gone) return null;
  return (
    <XStack
      testID="woman-plus-offer"
      marginHorizontal="$4"
      padding="$3"
      gap="$3"
      borderRadius={18}
      backgroundColor="$primarySoft"
      alignItems="center"
    >
      <Pressable
        testID="woman-plus-offer-open"
        accessibilityRole="button"
        accessibilityLabel="See who likes you and be seen first with Paire Plus. Open Paire Plus"
        onPress={() => navigation.navigate("Premium")}
        style={{ flex: 1 }}
      >
        <YStack gap={2}>
          <Text fontSize="$3" fontWeight="700" color="$primary">
            See who likes you and be seen first with Paire Plus
          </Text>
          <Text fontSize="$2" color="$textMuted">
            You can keep chatting here either way.
          </Text>
        </YStack>
      </Pressable>
      <Pressable
        testID="woman-plus-offer-dismiss"
        accessibilityRole="button"
        accessibilityLabel="Dismiss this offer"
        hitSlop={10}
        onPress={() => { dismissOffer(matchId); setGone(true); }}
      >
        <Icon name="close" size={18} color="textMuted" />
      </Pressable>
    </XStack>
  );
}
