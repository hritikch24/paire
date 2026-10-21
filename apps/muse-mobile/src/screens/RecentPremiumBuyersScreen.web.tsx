import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Text, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { SecondaryButton } from "../components/MuseButton";
import { EmptyState, LoadingView } from "../components/States";
import { auth, callFunction } from "../services/firebase";
import { friendlyError } from "../services/errors";
import type { AppStackParamList } from "../navigation/types";

type Purchases = { buyers: number; orders: number; rupees: number; unassignedOrders: number; windowStart: number; windowEnd: number; hasMore: boolean; members: Array<{ uid: string; name: string; email: string | null; available: boolean; orders: number; amountInr: number; payments: Array<{ orderId: string; amountInr: number; at: number; source: string; confirmation: string }> }> };
const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export function RecentPremiumBuyersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { void auth.currentUser?.getIdTokenResult().then(({ claims }) => setAllowed(claims.moderator === true && claims.supportAccess === true)).catch(() => setAllowed(false)); }, []);
  const query = useQuery({ queryKey: ["admin-premium-buyers-24h", auth.currentUser?.uid], queryFn: () => callFunction<Purchases>("adminGetRecentPremiumBuyers", undefined, 60_000), enabled: allowed === true, staleTime: 60_000, retry: false });
  const data = query.data;
  return <Screen scroll header={<ScreenHeader title="Premium buyers · 24h" />}>
    {allowed === null ? <LoadingView /> : !allowed ? <EmptyState icon="lock-closed-outline" title="Owner access required" message="Sign in with your owner account to see buyer details." /> : <YStack gap="$3" paddingVertical="$3">
      <Text color="$textMuted" lineHeight={22}>Confirmed Plus purchases in the rolling last 24 hours, including renewals and owner-confirmed receipts. Gifts, test accounts and reversed payments are excluded.</Text>
      {query.isLoading ? <LoadingView /> : null}
      {data ? <>
        <YStack testID="recent-premium-summary" padding="$3" gap="$2" borderRadius={18} backgroundColor="$primarySoft">
          <Text fontSize="$6" fontWeight="700">{data.buyers} buyer{data.buyers === 1 ? "" : "s"} · {data.orders} purchase{data.orders === 1 ? "" : "s"}</Text><Text fontSize="$5">{money(data.rupees)} received</Text>
          <Text fontSize="$2" color="$textMuted">{when(data.windowStart)} → {when(data.windowEnd)} IST</Text>
        </YStack>
        {data.members.map(member => <YStack key={member.uid} testID={`premium-buyer-${member.uid}`} padding="$3" gap="$2" borderWidth={1} borderColor="$border" borderRadius={18}>
          <Text fontWeight="700">{member.name}</Text>{member.email ? <Text selectable fontSize="$2" color="$textMuted">{member.email}</Text> : null}
          <Text>{member.orders} purchase{member.orders === 1 ? "" : "s"} · {money(member.amountInr)}</Text>
          {member.payments.map((payment, i) => <YStack key={`${payment.source}-${payment.orderId}-${i}`} gap={2} paddingVertical={5}><Text fontSize="$2">{money(payment.amountInr)} · {when(payment.at)} IST</Text><Text fontSize="$1" color="$textMuted">{payment.source === "razorpay" ? "Razorpay" : payment.source === "ccavenue" ? "CCAvenue" : "UPI"} · {payment.confirmation}</Text></YStack>)}
          {member.orders > member.payments.length ? <Text fontSize="$2" color="$textMuted">Latest {member.payments.length} payments shown.</Text> : null}
          {member.available ? <SecondaryButton onPress={() => navigation.navigate("MemberAdminDetail", { uid: member.uid, name: member.name })}>Open member & payments</SecondaryButton> : null}
        </YStack>)}
        {!data.orders ? <Text testID="recent-premium-empty">No paid Premium purchases were confirmed in the last 24 hours.</Text> : null}
        {data.unassignedOrders ? <Text color="$textMuted">{data.unassignedOrders} payments have no usable member reference.</Text> : null}
        {data.hasMore ? <Text color="$textMuted">Showing the 100 most recent buyers. Use Member admin to look up additional members.</Text> : null}
      </> : null}
      {query.error ? <Text color="$error">{friendlyError(query.error, "Couldn't load recent purchases.")}</Text> : null}
      <SecondaryButton testID="recent-premium-refresh" disabled={query.isFetching} onPress={() => void query.refetch()}>Refresh</SecondaryButton>
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>Times use payment confirmation or UPI approval. Owner receipts use their original recorded confirmation time, retained when a gateway later reconciles them. Orders with no known confirmation time stay out of this window.</Text>
    </YStack>}
  </Screen>;
}
