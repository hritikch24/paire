import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { Keyboard, Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Checkbox } from "../components/Checkbox";
import { Icon } from "../components/Icon";
import { PrimaryButton } from "../components/MuseButton";
import { TextField } from "../components/MuseInput";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { showToast } from "../components/Toast";
import { friendlyError } from "../services/errors";
import { blockUser, createReportId, reportUser } from "../services/safetyService";
import { queryClient } from "../services/queryClient";
import { useAuthStore } from "../store/authStore";
import { REPORT_REASONS, ReportReason } from "../types/models";
import type { AppStackParamList } from "../navigation/types";

export function ReportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Report">>();
  const { targetUid, name = "this person", matchId, messageId } = route.params;
  const uid = useAuthStore((state) => state.user?.uid);
  const [reason, setReason] = useState<ReportReason | null>(route.params.reason ?? null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reportId] = useState(createReportId);
  const [sent, setSent] = useState(false);
  const needsDetails = reason === "other" && details.trim().length < 5;
  const canSubmit = Boolean(reason) && !needsDetails;

  const handleSubmit = async () => {
    if (!uid || !reason || !canSubmit || submitting) return;
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      if (!sent) {
        await reportUser({ reportId, targetUid, reason, details, matchId, messageId });
        setSent(true);
        void queryClient.invalidateQueries({ queryKey: ["my-reports", uid] });
      }
      if (alsoBlock) await blockUser(targetUid);
      navigation.reset({
        index: 1,
        routes: [
          { name: "Tabs", params: { screen: matchId ? "Matches" : "Discover" } },
          { name: "MyReports", params: { blocked: alsoBlock } }
        ]
      });
    } catch (error) {
      setSubmitting(false);
      showToast(friendlyError(error, "We couldn't complete this. Please try again."), "error");
    }
  };

  return (
    <Screen
      scroll
      footer={
        <PrimaryButton testID="report-submit" onPress={handleSubmit} disabled={!canSubmit} loading={submitting}>
          {sent ? "Retry block" : alsoBlock ? "Report and block" : "Send report"}
        </PrimaryButton>
      }
    >
      <ScreenHeader title={`Report ${name}`} back="close" />
      {sent ? <Text color="$primary" testID="report-received">Your report was received. Blocking hasn't completed yet. Retry below, or close this screen and check My reports.</Text> : null}
      <YStack gap="$5">
        <Text color="$textMuted">
          Reports are confidential: {name} won't know it was you. If you're in immediate danger, call 112.
        </Text>
        <YStack gap="$2">
          <Text fontWeight="700">What happened?</Text>
          {REPORT_REASONS.map((option) => {
            const selected = reason === option.id;
            return (
              <Pressable
                key={option.id}
                testID={`report-reason-${option.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                disabled={sent || submitting}
                onPress={() => setReason(option.id)}
              >
                <XStack
                  padding="$3"
                  gap="$3"
                  alignItems="center"
                  borderRadius="$4"
                  borderWidth={selected ? 2 : 1}
                  borderColor={selected ? "$primary" : "$border"}
                  backgroundColor={selected ? "$primarySoft" : "$backgroundStrong"}
                >
                  <Icon name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? "primary" : "textMuted"} />
                  <Text flex={1}>{option.label}</Text>
                </XStack>
              </Pressable>
            );
          })}
        </YStack>
        <TextField
          testID="report-details"
          label={reason === "other" ? "Tell us more" : "Anything else we should know? (optional)"}
          placeholder="What happened, and when"
          multiline
          textAlignVertical="top"
          minHeight={100}
          paddingTop="$3"
          maxLength={1000}
          showCount
          value={details}
          editable={!sent && !submitting}
          onChangeText={setDetails}
          error={reason === "other" && details.length > 0 && needsDetails ? "Please add a few details." : null}
        />
        <Checkbox checked={alsoBlock} onChange={(value) => { if (!sent && !submitting) setAlsoBlock(value); }} accessibilityLabel={`Also block ${name}`}>
          <Text fontWeight="600">Also block {name}</Text>
          <Text color="$textMuted" fontSize="$2">
            Ends any match and stops them seeing or messaging you.
          </Text>
        </Checkbox>
      </YStack>
    </Screen>
  );
}
