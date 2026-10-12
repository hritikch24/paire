import { RouteProp, useFocusEffect, useRoute } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Linking, RefreshControl } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "../components/Icon";
import { SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState, LoadingView } from "../components/States";
import { legal } from "../config/legal";
import { friendlyError } from "../services/errors";
import { getMyReports, ReportCursor, ReportProgress } from "../services/safetyService";
import { useAuthStore } from "../store/authStore";
import { REPORT_REASONS } from "../types/models";
import type { AppStackParamList } from "../navigation/types";

const STATUS = { received: "Received", reviewing: "In review", closed: "Review complete" };
const OUTCOME = {
  action_taken: "Action was taken under our community guidelines. We keep the other person's account details private.",
  no_violation_found: "The review did not find a violation in the available information. You can still block this person.",
  insufficient_information: "The available information wasn't enough to reach a decision. If you have new details, send a new report."
};

function ProgressCard({ report }: { report: ReportProgress }) {
  return (
    <YStack testID={`my-report-${report.id}`} gap="$3" padding="$4" backgroundColor="$backgroundStrong" borderRadius={20} borderWidth={1} borderColor="$border">
      <XStack alignItems="center" gap="$2">
        <Icon name={report.status === "closed" ? "checkmark-circle-outline" : "time-outline"} color="primary" size={20} />
        <Text color="$primary" fontWeight="700">{STATUS[report.status] ?? "Received"}</Text>
      </XStack>
      <Text fontSize="$4" fontWeight="700">{REPORT_REASONS.find((reason) => reason.id === report.reason)?.label ?? "Safety report"}</Text>
      <Text color="$textMuted">About {report.targetName} · {new Date(report.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
      <Text color="$textMuted" lineHeight={23}>
        {report.status === "closed" && report.outcome ? OUTCOME[report.outcome] : report.status === "reviewing" ? "A moderator has started reviewing your report." : "Your report is saved and waiting for review. Blocking works immediately and doesn't depend on the review."}
      </Text>
      <Text selectable color="$textMuted" fontSize="$1">Reference: {report.id}</Text>
    </YStack>
  );
}

export function MyReportsScreen() {
  const route = useRoute<RouteProp<AppStackParamList, "MyReports">>();
  const uid = useAuthStore((state) => state.user?.uid);
  const query = useInfiniteQuery({
    queryKey: ["my-reports", uid],
    initialPageParam: null as ReportCursor | null,
    queryFn: ({ pageParam }) => getMyReports(pageParam),
    getNextPageParam: (page) => page.cursor ?? undefined,
    enabled: Boolean(uid),
    retry: 1
  });
  const { refetch } = query;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const reports = query.data?.pages.flatMap((page) => page.reports) ?? [];
  return (
    <Screen scroll header={<ScreenHeader title="My reports" />} testID="my-reports" refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void refetch()} />}>
      <YStack gap="$4">
        {route.params?.blocked ? <YStack testID="report-block-confirmed" padding="$4" backgroundColor="$primarySoft" borderRadius={20} gap="$2"><Text fontWeight="700">Blocked on Paire</Text><Text color="$textMuted">This account can no longer match or message you.</Text></YStack> : null}
        <YStack padding="$4" backgroundColor="$primarySoft" borderRadius={20} gap="$2">
          <Text fontWeight="700">You deserve to feel comfortable.</Text>
          <Text color="$textMuted" lineHeight={23}>Only you can see this progress. Reports are confidential and aren't emergency assistance. If you're in immediate danger, call 112.</Text>
        </YStack>
        {query.isPending ? <LoadingView label="Loading your reports" /> : query.isError && reports.length === 0 ? (
          <EmptyState icon="cloud-offline-outline" title="Reports couldn't load" message={friendlyError(query.error)}>
            <SecondaryButton onPress={() => void refetch()}>Try again</SecondaryButton>
          </EmptyState>
        ) : reports.length === 0 ? (
          <EmptyState icon="shield-checkmark-outline" title="No reports yet" message="Report from a person's profile or chat whenever you need to. You can check its progress here." />
        ) : reports.map((report) => <ProgressCard key={report.id} report={report} />)}
        {query.isError && reports.length > 0 ? <YStack gap="$2"><Text color="$textMuted">Updates couldn't load. Saved progress may have changed.</Text><SecondaryButton onPress={() => void refetch()}>Refresh reports</SecondaryButton></YStack> : null}
        {query.hasNextPage ? <SecondaryButton testID="reports-load-more" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>Earlier reports</SecondaryButton> : null}
        {legal.supportEmail ? <SecondaryButton onPress={() => void Linking.openURL(`mailto:${legal.supportEmail}?subject=Paire%20report%20support`)}>Contact support</SecondaryButton> : null}
      </YStack>
    </Screen>
  );
}
