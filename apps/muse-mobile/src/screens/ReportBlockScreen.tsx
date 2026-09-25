import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Text, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { MuseInput } from "../components/MuseInput";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { useAuthStore } from "../store/authStore";
import { RouteProp, useRoute } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/RootNavigator";
import { doc, setDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { useNavigation } from "@react-navigation/native";

export function ReportBlockScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "ReportBlock">>();
  const { targetUid } = route.params;
  const user = useAuthStore((state) => state.user);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReport = async () => {
    if (!user) return;
    setLoading(true);
    const reportId = `${user.uid}_${targetUid}_${Date.now()}`;
    await setDoc(doc(db, "reports", reportId), {
      id: reportId,
      reporterId: user.uid,
      targetId: targetUid,
      reason,
      createdAt: Date.now()
    });
    setLoading(false);
    navigation.goBack();
  };

  const handleBlock = async () => {
    if (!user) return;
    setLoading(true);
    await setDoc(doc(db, "blocks", user.uid, "blocked", targetUid), {
      id: targetUid,
      blockedAt: Date.now()
    });
    setLoading(false);
    navigation.goBack();
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 96 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$4">
            <Text fontSize="$7" fontWeight="700">
              Report or block
            </Text>
            <MuseInput
              placeholder="Tell us what happened"
              value={reason}
              onChangeText={setReason}
            />
            <PrimaryButton onPress={handleReport} disabled={loading || !reason}>
              Submit report
            </PrimaryButton>
            <SecondaryButton onPress={handleBlock} disabled={loading}>
              Block user
            </SecondaryButton>
            <SecondaryButton onPress={() => navigation.goBack()}>Cancel</SecondaryButton>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
