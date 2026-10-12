import type { ReactNode } from "react";
import { useCallback } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Text, YStack } from "tamagui";
import { fetchVerificationStatus } from "../services/verificationService";
import { useAuthStore } from "../store/authStore";
import type { AppStackParamList } from "../navigation/types";
import { Icon } from "./Icon";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { Screen } from "./Screen";
import { LoadingView } from "./States";

/** An understandable entry point; Cloud Functions and rules enforce the same policy. */
export function VerificationGate({ children }: { children: ReactNode }) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  const photos = useAuthStore((state) => JSON.stringify(state.profile?.photoUrls ?? []));
  const status = useQuery({ queryKey: ["verification", uid, photos], queryFn: fetchVerificationStatus, enabled: Boolean(uid), staleTime: 0, retry: 1, refetchInterval: 60_000 });
  const refetch = status.refetch;
  useFocusEffect(useCallback(() => { if (uid) void refetch(); }, [uid, refetch]));
  if (status.isPending) return <Screen><LoadingView label="Checking your profile…" /></Screen>;
  if (!status.isError && status.data && (!status.data.required || status.data.state === "verified")) return children;
  return <Screen scroll testID="verification-required"><YStack flex={1} justifyContent="center" gap="$4">
    <Icon name="shield-checkmark-outline" size={44} color="primary" />
    <Text fontSize={32} lineHeight={39} fontWeight="700">A real person.{"\n"}A better beginning.</Text>
    <Text color="$textMuted" lineHeight={24}>{status.isError ? "We couldn’t check your verification. Try again to continue." : "Verify your photos before meeting people on Paire. The check is free, and helps every member start with more trust."}</Text>
    <PrimaryButton testID="gate-verify" onPress={() => navigation.navigate("Verification")}>Verify my photos</PrimaryButton>
    <SecondaryButton loading={status.isFetching} onPress={() => void status.refetch()}>Check again</SecondaryButton>
    <SecondaryButton testID="gate-safety" onPress={() => navigation.navigate("SafetyCenter")}>Open safety tools</SecondaryButton>
  </YStack></Screen>;
}
