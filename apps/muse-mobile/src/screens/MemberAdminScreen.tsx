import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { FlatList, Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Avatar } from "../components/Avatar";
import { TextField } from "../components/MuseInput";
import { getMember } from "../services/adminService";
import { PrimaryButton } from "../components/MuseButton";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState, LoadingView } from "../components/States";
import { listMembers, MemberRow } from "../services/adminService";
import { friendlyError } from "../services/errors";
import type { AppStackParamList } from "../navigation/types";

const day = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function Badge({ label, tone = "muted" }: { label: string; tone?: "muted" | "primary" | "error" }) {
  return (
    <YStack paddingHorizontal={7} paddingVertical={2} borderRadius={999} backgroundColor={tone === "primary" ? "$primarySoft" : tone === "error" ? "$warningSoft" : "$backgroundSoft"}>
      <Text fontSize={11} fontWeight="700" color={tone === "primary" ? "$primary" : tone === "error" ? "$error" : "$textMuted"}>{label}</Text>
    </YStack>
  );
}

/** Moderators only: every member, women and men in separate lists, newest first. */
export function MemberAdminScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [lookup, setLookup] = useState("");
  const [finding, setFinding] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const findMember = async () => {
    setFinding(true); setLookupError("");
    try {
      const member = await getMember(lookup.trim());
      navigation.navigate("MemberAdminDetail", { uid: member.uid, name: member.profile.name ?? undefined });
    } catch (error) { setLookupError(friendlyError(error, "Couldn't find that member.")); }
    finally { setFinding(false); }
  };
  const [gender, setGender] = useState<"woman" | "man">("woman");
  const query = useInfiniteQuery({
    queryKey: ["admin-members", gender],
    queryFn: ({ pageParam }) => listMembers(gender, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor
  });
  const members = query.data?.pages.flatMap((page) => page.members) ?? [];
  const total = query.data?.pages[0]?.total;

  const row = ({ item }: { item: MemberRow }) => (
    <Pressable testID={`admin-member-${item.uid}`} onPress={() => navigation.navigate("MemberAdminDetail", { uid: item.uid, name: item.name })} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack paddingHorizontal="$4" paddingVertical="$3" gap="$3" alignItems="center" borderBottomWidth={1} borderBottomColor="$border">
        <Avatar uri={item.photoUrl} name={item.name} size={56} />
        <YStack flex={1} gap={3}>
          <Text fontWeight="700" numberOfLines={1}>{item.name}{item.age ? `, ${item.age}` : ""}{item.city ? ` · ${item.city}` : ""}</Text>
          <Text fontSize="$1" color="$textMuted">Joined {day(item.joinedAt)} · active {day(item.lastActiveAt)} · {item.photoCount} photo{item.photoCount === 1 ? "" : "s"}</Text>
          <XStack gap="$1" flexWrap="wrap">
            {item.plus ? <Badge label="PLUS" tone="primary" /> : null}
            {item.unlimitedChat ? <Badge label="UNLIMITED CHAT" tone="primary" /> : null}
            {item.verified ? <Badge label="VERIFIED" /> : null}
            {item.testAccount ? <Badge label="TEST" /> : null}
            {item.status !== "ok" ? <Badge label={item.status.toUpperCase()} tone="error" /> : null}
          </XStack>
        </YStack>
      </XStack>
    </Pressable>
  );

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScreenHeader title="Member admin" />
      <YStack paddingHorizontal="$4" paddingBottom="$3" gap="$2">
        <TextField testID="admin-member-lookup" label="Find member by email or user ID" value={lookup} onChangeText={setLookup} autoCapitalize="none" onSubmitEditing={() => { if (lookup.trim()) void findMember(); }} error={lookupError} />
        <PrimaryButton disabled={!lookup.trim()} loading={finding} onPress={() => void findMember()}>Find member</PrimaryButton>
      </YStack>
      <XStack paddingHorizontal="$4" paddingBottom="$3" gap="$2">
        {(["woman", "man"] as const).map((value) => (
          <Pressable key={value} testID={`admin-tab-${value}`} accessibilityRole="tab" accessibilityState={{ selected: gender === value }} onPress={() => setGender(value)} style={{ flex: 1 }}>
            <YStack paddingVertical="$2" borderRadius={999} alignItems="center" backgroundColor={gender === value ? "$primary" : "$backgroundSoft"}>
              <Text fontWeight="700" color={gender === value ? "$primaryForeground" : "$text"}>{value === "woman" ? "Women" : "Men"}{gender === value && typeof total === "number" ? ` (${total})` : ""}</Text>
            </YStack>
          </Pressable>
        ))}
      </XStack>
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <EmptyState icon="alert-circle-outline" title="Couldn't load members" message={friendlyError(query.error, "Only moderator accounts can open this.")}>
          <PrimaryButton onPress={() => void query.refetch()}>Try again</PrimaryButton>
        </EmptyState>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.uid}
          renderItem={row}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyState icon="people-outline" title="Nobody here yet" message="Members appear here once they create a profile." />}
          ListFooterComponent={query.isFetchingNextPage ? <LoadingView /> : null}
        />
      )}
    </YStack>
  );
}
