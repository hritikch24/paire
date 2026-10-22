import { useState } from "react";
import { Pressable } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Text, XStack, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { Chip } from "../components/Chip";
import { PrimaryButton, SecondaryButton, GhostButton } from "../components/MuseButton";
import { LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { WORK_CIRCLES, workCircle, type WorkSector } from "../data/workCircles";
import { callFunction } from "../services/firebase";
import { type FeedPage } from "../services/discoveryService";
import { updateProfile } from "../services/profileService";
import { friendlyError } from "../services/errors";
import { isSupportView } from "../services/supportMode";
import { useAuthStore } from "../store/authStore";
import type { FeedCursor } from "../types/models";
import type { AppStackParamList } from "../navigation/types";

type Navigation = NativeStackNavigationProp<AppStackParamList>;
async function shareCircle(id: WorkSector) {
  const circle = workCircle(id)!;
  const url = new URL(`/circles/${id}/`, window.location.origin).href;
  try {
    if (navigator.share) await navigator.share({ title: `${circle.label} on Paire`, text: circle.intro, url });
    else { await navigator.clipboard.writeText(url); showToast("Circle link copied.", "success"); }
  } catch (error) { if ((error as { name?: string }).name !== "AbortError") showToast("Couldn't share the link. Please try again.", "error"); }
}

export function WorkCirclesScreen() {
  const navigation = useNavigation<Navigation>();
  const profile = useAuthStore(state => state.profile);
  const [editing, setEditing] = useState(false), [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<WorkSector | null>(profile?.workSector ?? null);
  const queryClient = useQueryClient();
  const current = workCircle(profile?.workSector);
  const save = async () => {
    if (!profile || saving || isSupportView) return;
    setSaving(true);
    try {
      await updateProfile(profile.uid, { workSector: draft });
      void queryClient.invalidateQueries({ queryKey: ["work-circle-feed"] });
      setEditing(false); showToast(draft ? "Your self-declared work badge is saved." : "Work badge removed.", "success");
    } catch (error) { showToast(friendlyError(error, "Couldn't save your badge."), "error"); }
    finally { setSaving(false); }
  };
  return <Screen scroll header={<ScreenHeader title="Work Circles" />}>
    <YStack gap="$4" paddingTop="$2">
      <YStack gap="$2"><Text fontSize="$8" fontWeight="700" lineHeight={38}>A connection beyond work.</Text><Text color="$textMuted" lineHeight={22}>Meet people by work sector. Explore any circle—you don't have to work in it to look around.</Text></YStack>
      {!isSupportView ? <YStack gap="$2" padding="$3" borderRadius={20} backgroundColor="$primarySoft">
        <Text fontWeight="700">Your work badge</Text>
        <Text testID="my-work-badge">{current ? `${current.label} · Self-declared` : "Optional. Add the sector you work in."}</Text>
        <Text fontSize="$2" color="$textMuted" lineHeight={20}>Public in Work Circles. This is your own description, not an employment check or verified badge. No work email or employer name needed.</Text>
        {editing ? <>
          <XStack gap="$2" flexWrap="wrap"><Chip label="No badge" testID="work-badge-none" selected={draft === null} disabled={saving} onPress={() => setDraft(null)} />{WORK_CIRCLES.map(circle => <Chip key={circle.id} label={circle.label} testID={`work-badge-${circle.id}`} selected={draft === circle.id} disabled={saving} onPress={() => setDraft(circle.id)} />)}</XStack>
          <PrimaryButton testID="work-badge-save" loading={saving} onPress={() => void save()}>Save badge</PrimaryButton>
          <GhostButton disabled={saving} onPress={() => setEditing(false)}>Cancel</GhostButton>
        </> : <GhostButton testID="work-badge-edit" alignSelf="flex-start" onPress={() => { setDraft(profile?.workSector ?? null); setEditing(true); }}>{current ? "Change or remove badge" : "Choose my badge"}</GhostButton>}
      </YStack> : null}
      <YStack gap="$2"><Text fontSize="$5" fontWeight="700">Who would you like to meet?</Text><Text fontSize="$2" color="$textMuted">Your usual search preferences and privacy choices apply.</Text></YStack>
      <YStack gap="$2">{WORK_CIRCLES.map(circle => <Pressable key={circle.id} testID={`work-circle-${circle.id}`} accessibilityRole="button" accessibilityLabel={`Meet people in ${circle.label}`} onPress={() => navigation.push("WorkCircle", { circle: circle.id })} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
        <XStack alignItems="center" gap="$3" padding="$3" borderRadius={18} borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong"><YStack width={42} height={42} alignItems="center" justifyContent="center" backgroundColor="$primarySoft" borderRadius={14}><Icon name={circle.icon} color="primary" size={23} /></YStack><YStack flex={1} minWidth={0} gap={3}><Text fontWeight="700">{circle.label}</Text><Text color="$textMuted" fontSize="$2">{circle.hint}</Text></YStack><Icon name="chevron-forward" size={18} color="textMuted" /></XStack>
      </Pressable>)}</YStack>
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>Everyone is here for personal connections. Circles aren't job boards, workplace directories or affiliations with employers.</Text>
    </YStack>
  </Screen>;
}

export function WorkCircleScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<RouteProp<AppStackParamList, "WorkCircle">>();
  const circle = workCircle(params.circle);
  const uid = useAuthStore(state => state.user?.uid);
  const query = useInfiniteQuery({ queryKey: ["work-circle-feed", uid, params.circle], enabled: Boolean(circle && uid), initialPageParam: null as FeedCursor | null, queryFn: ({ pageParam }) => callFunction<FeedPage>("getDiscoverFeed", { circle: params.circle, cursor: pageParam }), getNextPageParam: last => last.cursor ?? undefined, staleTime: 0, refetchOnMount: "always", retry: false });
  const profiles = [...new Map((query.data?.pages.flatMap(page => page.profiles) ?? []).map(profile => [profile.uid, profile])).values()];
  return <Screen scroll header={<ScreenHeader title={circle?.label ?? "Work Circle"} />}>
    {!circle ? <Text>Circle unavailable.</Text> : <YStack gap="$3" paddingTop="$2">
      <YStack padding="$4" gap="$2" borderRadius={22} backgroundColor="$primarySoft"><Icon name={circle.icon} size={28} color="primary" /><Text fontSize="$6" fontWeight="700">{circle.intro}</Text><Text color="$textMuted" lineHeight={21}>Work badges are self-declared. Your usual age, distance and search preferences apply. Likes use your normal daily allowance.</Text></YStack>
      <GhostButton testID="circle-share" alignSelf="flex-start" onPress={() => void shareCircle(circle.id)}>Share this circle ↗</GhostButton>
      {query.isLoading ? <LoadingView /> : null}
      {profiles.map(profile => <Pressable key={profile.uid} testID={`circle-member-${profile.uid}`} accessibilityRole="button" accessibilityLabel={`View ${profile.displayName}, ${profile.age}`} onPress={() => navigation.push("ProfileView", { source: "circle", uid: profile.uid, profile })}>
        <YStack gap="$2" padding="$3" borderRadius={20} borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong"><XStack alignItems="center" gap="$3"><Avatar uri={profile.photoUrls[0]} name={profile.displayName} size={64} /><YStack flex={1} gap={3}><Text fontSize="$5" fontWeight="700">{profile.displayName}, {profile.age}</Text><Text fontSize="$2" color="$textMuted">{[profile.city, profile.distanceKm === null ? null : `${profile.distanceKm} km away`].filter(Boolean).join(" · ")}</Text></YStack></XStack><Text color="$primary" fontSize="$2" fontWeight="600">{circle.label} · Self-declared</Text>{profile.bio ? <Text color="$textMuted" numberOfLines={2}>{profile.bio}</Text> : null}{profile.photosPrivate ? <Text color="$textMuted" fontSize="$2">Photos stay private until a match.</Text> : null}</YStack>
      </Pressable>)}
      {!query.isLoading && !query.error && !profiles.length ? <YStack gap="$2" paddingVertical="$3"><Text testID="work-circle-empty" fontSize="$5" fontWeight="700">{query.hasNextPage ? "No profiles on this page." : "You're caught up here."}</Text><Text color="$textMuted">{query.hasNextPage ? "Keep looking through this circle." : "Try another circle or adjust your search preferences."}</Text><GhostButton onPress={() => navigation.navigate("Settings")}>Edit search preferences</GhostButton></YStack> : null}
      {query.error ? <Text color="$error">{friendlyError(query.error, "Couldn't load this circle. Please try again.")}</Text> : null}
      {query.hasNextPage ? <PrimaryButton testID="circle-load-more" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>Keep looking</PrimaryButton> : null}
      <SecondaryButton testID="circle-refresh" loading={query.isRefetching} onPress={() => void query.refetch()}>Refresh</SecondaryButton>
    </YStack>}
  </Screen>;
}
