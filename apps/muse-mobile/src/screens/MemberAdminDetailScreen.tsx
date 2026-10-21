import { RouteProp, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { LoadingView } from "../components/States";
import { MemberSupportTools } from "../components/MemberSupportTools";
import { getMember } from "../services/adminService";
import { friendlyError } from "../services/errors";
import { resolveServerUrl } from "../services/testServer";
import type { AppStackParamList } from "../navigation/types";

const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

function Row({ label, value }: { label: string; value: string }) {
  return (
    <XStack justifyContent="space-between" gap="$3" paddingVertical={6} borderBottomWidth={1} borderBottomColor="$border">
      <Text color="$textMuted" fontSize="$2">{label}</Text>
      <Text fontSize="$2" fontWeight="600" flexShrink={1} textAlign="right" selectable>{value}</Text>
    </XStack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack gap="$1" padding="$3" borderRadius="$4" borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong">
      <Text fontWeight="700" marginBottom="$1">{title}</Text>
      {children}
    </YStack>
  );
}

/** Moderators only: one member's photos, profile, account, moderation state and payments. */
export function MemberAdminDetailScreen() {
  const route = useRoute<RouteProp<AppStackParamList, "MemberAdminDetail">>();
  const member = useQuery({ queryKey: ["admin-member", route.params.uid], queryFn: () => getMember(route.params.uid) });
  const data = member.data;
  const list = (value: unknown) => (Array.isArray(value) && value.length ? value.join(", ") : "—");

  return (
    <Screen scroll header={<ScreenHeader title={route.params.name || "Member"} />}>
      {member.isLoading ? <LoadingView /> : null}
      {member.isError ? <Text color="$error" paddingTop="$4">{friendlyError(member.error, "Couldn't load this member.")}</Text> : null}
      {data ? (
        <YStack gap="$3" paddingTop="$3" paddingBottom="$6">
          <MemberSupportTools uid={route.params.uid} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {data.profile.photoUrls.length ? (
              data.profile.photoUrls.map((url) => (
                <Image key={url} source={{ uri: resolveServerUrl(url) }} style={{ width: 160, height: 213, borderRadius: 14 }} contentFit="cover" />
              ))
            ) : (
              <Text color="$textMuted">No photos</Text>
            )}
          </ScrollView>
          <Section title="Profile">
            <Row label="Name" value={`${data.profile.name ?? "—"}${data.profile.age ? `, ${data.profile.age}` : ""}`} />
            <Row label="Gender" value={data.profile.gender === "woman" ? "Woman" : data.profile.gender === "man" ? "Man" : "—"} />
            <Row label="City" value={data.profile.city ?? "—"} />
            <Row label="Looking for" value={list(data.profile.intentions)} />
            <Row label="Interests" value={list(data.profile.interests)} />
            <Row label="Languages" value={list(data.profile.languages)} />
            {Object.entries(data.profile.basics).map(([key, value]) => <Row key={key} label={key} value={String(value)} />)}
            <Row label="In discovery" value={data.profile.discoverable ? "Yes" : "Hidden by them"} />
            <Row label="Joined" value={when(data.profile.joinedAt)} />
            <Row label="Last active" value={when(data.profile.lastActiveAt)} />
            {data.profile.bio ? <Text fontSize="$2" lineHeight={20} marginTop="$2" selectable>{data.profile.bio}</Text> : null}
          </Section>
          <Section title="Account">
            <Row label="Email" value={data.account?.email ?? "—"} />
            <Row label="Email confirmed" value={data.account?.emailVerified ? "Yes" : "No"} />
            <Row label="Signs in with" value={list(data.account?.signInMethods)} />
            <Row label="Last sign-in" value={when(data.account?.lastSignInAt)} />
            <Row label="Status" value={`${data.moderation.status}${data.moderation.reason ? ` (${data.moderation.reason})` : ""}`} />
            <Row label="Photo check" value={data.moderation.verification} />
            <Row label="Account type" value={data.moderation.cohort === "test" ? "Test account" : "Member"} />
            <Row label="Matches" value={String(data.activity.matches)} />
            <Row label="Reports against" value={String(data.activity.reportsAgainst)} />
          </Section>
          <Section title="Payments">
            <Row label="Paire Plus" value={data.plusUntil ? `Active until ${when(data.plusUntil)}` : "No"} />
            <Row label="Unlimited Chat" value={data.unlimitedChat ? "Owned" : "No"} />
            {data.payments.length ? (
              data.payments.map((payment, index) => (
                <YStack key={`${payment.source}-${index}`} paddingVertical={6} borderBottomWidth={1} borderBottomColor="$border" gap={2}>
                  <XStack justifyContent="space-between" flexWrap="wrap" gap="$1">
                    <Text fontSize="$2" fontWeight="700">{payment.product} · ₹{payment.amountInr}</Text>
                    <Text fontSize="$2" maxWidth="100%" color={payment.status === "paid" || payment.status === "approved" ? "$primary" : "$textMuted"}>{payment.status}</Text>
                  </XStack>
                  <Text fontSize="$1" color="$textMuted">{payment.source === "upi" ? "UPI" : payment.source === "ccavenue" ? "CCAvenue" : payment.source === "support" ? "Owner recovery" : payment.source === "gift" ? "Complimentary" : "Razorpay"} · {when(payment.at)}{payment.utr ? ` · UTR ${payment.utr}` : ""}{payment.expiresAt ? ` · until ${when(payment.expiresAt)}` : ""}</Text>
                </YStack>
              ))
            ) : (
              <Text fontSize="$2" color="$textMuted">No payments or checkouts.</Text>
            )}
          </Section>
        </YStack>
      ) : null}
    </Screen>
  );
}
