import { WorkCircleBadge } from "../components/WorkCircleBadge";
import { useQuery } from "@tanstack/react-query";
import { callFunction } from "../services/firebase";
import { DiscoverProfile } from "../types/models";
import { SparkComposer } from "../components/SparkComposer";
import { Alert } from "../services/dialog";
import { useAppDimensions } from "../utils/useAppDimensions";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack, useTheme } from "tamagui";
import { ActionSheet } from "../components/ActionSheet";
import { IconButton } from "../components/IconButton";
import { PrimaryButton } from "../components/MuseButton";
import { PhotoCarousel } from "../components/PhotoCarousel";
import { ProfileDetails, ProfileHeadline, ProfileViewData } from "../components/ProfileDetails";
import { EmptyState, LoadingView } from "../components/States";
import { showToast } from "../components/Toast";
import { LIKES_YOU_KEY } from "../hooks/useLikesYou";
import { useMemberProfile } from "../hooks/useMemberProfile";
import { sendSwipe } from "../services/discoveryService";
import { suppressMatchAlert } from "../services/notificationService";
import { friendlyError } from "../services/errors";
import { offerPlusForLikeLimit } from "../services/likeLimitOffer";
import { queryClient } from "../services/queryClient";
import { blockUser } from "../services/safetyService";
import { useAuthStore } from "../store/authStore";
import { SwipeType } from "../types/models";
import type { AppStackParamList } from "../navigation/types";

export function ProfileViewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "ProfileView">>();
  const { source, profile: passed, uid, matchId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useAppDimensions();
  const me = useAuthStore((state) => state.profile);
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = useTheme();
  const background = theme.background?.val ?? "#FBF8F6";
  const fetched = useMemberProfile(source === "match" ? uid : undefined);

  const shared = useQuery({ queryKey: ["shared-profile", me?.uid, uid], enabled: source === "shared" && Boolean(uid), retry: false,
    queryFn: () => callFunction<{ profile: DiscoverProfile | null }>("getSharedProfile", { uid }) });
  const [composeShared, setComposeShared] = useState(false);
  const profile: ProfileViewData | null | undefined =
    passed ?? (source === "self" ? me : source === "match" ? (fetched.isLoading ? undefined : fetched.data) : source === "shared" ? (shared.isLoading ? undefined : shared.data?.profile ?? null) : null);

  const [answering, setAnswering] = useState(false);

  const swipe = (type: SwipeType) => {
    if (!profile) return;
    if ((source === "shared" || source === "circle") && type !== "nope") { setComposeShared(true); return; }
    if (source === "likes" || source === "shared" || source === "circle") {
      void answerLike(type);
      return;
    }
    navigation.navigate("Tabs", {
      screen: "Discover",
      params: { swipe: { uid: profile.uid, type, nonce: Date.now() } }
    });
  };

  /** Someone from "Likes you": a like back is an instant match. */
  const answerLike = async (type: SwipeType, note?: string | null) => {
    if (!profile || answering) return;
    setAnswering(true);
    try {
      const result = await sendSwipe(profile.uid, type, note);
      void queryClient.invalidateQueries({ queryKey: LIKES_YOU_KEY });
      if (source === "circle") void queryClient.invalidateQueries({ queryKey: ["work-circle-feed"] });
      if (result.matched && result.matchId) {
        suppressMatchAlert(result.matchId);
        showToast(`It's a match! You and ${profile.displayName} liked each other.`, "success");
        navigation.replace("Chat", {
          matchId: result.matchId,
          otherUid: profile.uid,
          name: profile.displayName,
          photoUrl: profile.photoUrls[0] ?? null
        });
      } else {
        navigation.goBack();
      }
    } catch (error) {
      setAnswering(false);
      if (offerPlusForLikeLimit(error, () => navigation.navigate("Premium"))) return;
      showToast(friendlyError(error, "Couldn't save that. Please try again."), "error");
    }
  };
  const showActions = source === "discover" || source === "likes" || source === "shared" || source === "circle";

  const confirmBlock = () => {
    if (!profile) return;
    Alert.alert(`Block ${profile.displayName}?`, "They won't be able to see or message you, and your match will end.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await blockUser(profile.uid);
            showToast(`${profile.displayName} is blocked.`);
            navigation.navigate("Tabs", { screen: "Matches" });
          } catch (error) {
            showToast(friendlyError(error, "Couldn't block. Please try again."), "error");
          }
        }
      }
    ]);
  };

  if (profile === undefined) {
    return (
      <YStack flex={1} backgroundColor="$background">
        <LoadingView />
      </YStack>
    );
  }

  if (!profile) {
    return (
      <YStack flex={1} backgroundColor="$background" paddingTop={insets.top}>
        <XStack padding="$2">
          <IconButton icon="close" accessibilityLabel="Close" onPress={() => navigation.goBack()} />
        </XStack>
        <EmptyState icon="person-outline" title="Profile unavailable" message="This profile is no longer available." />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: showActions ? 140 : insets.bottom + 32 }}
      >
        <PhotoCarousel photos={profile.photoUrls} width={width} height={Math.round(width * 1.25)} />
        <YStack padding="$4" gap="$4">
          <ProfileHeadline profile={profile} />
          {source === "circle" ? <WorkCircleBadge sector={passed?.workSector} /> : null}
          <ProfileDetails profile={profile} />
          {source === "self" ? (
            <PrimaryButton onPress={() => navigation.navigate("EditProfile")}>Edit profile</PrimaryButton>
          ) : null}
        </YStack>
      </ScrollView>

      <XStack position="absolute" top={insets.top + 8} left={12} right={12} justifyContent="space-between">
        <IconButton testID="profile-close" icon="close" accessibilityLabel="Close profile" variant="soft" elevated onPress={() => navigation.goBack()} />
        {source !== "self" ? (
          <IconButton icon="ellipsis-horizontal" accessibilityLabel="More options" variant="soft" elevated onPress={() => setMenuOpen(true)} />
        ) : null}
      </XStack>

      {showActions ? (
        <LinearGradient
          pointerEvents="none"
          colors={[`${background}00`, background]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: insets.bottom + 130 }}
        />
      ) : null}
      {showActions ? (
        <XStack
          position="absolute"
          bottom={insets.bottom + 16}
          left={0}
          right={0}
          justifyContent="center"
          gap="$5"
        >
          <IconButton icon="close" accessibilityLabel="Pass" variant="soft" color="nope" size={62} iconSize={32} elevated disabled={answering} onPress={() => swipe("nope")} />
          {source === "discover" ? (
            <IconButton icon="star" accessibilityLabel="Super Like" variant="soft" color="superLike" size={52} iconSize={26} elevated onPress={() => swipe("super")} />
          ) : null}
          <IconButton icon="heart" accessibilityLabel="Like" variant="soft" color="primary" size={62} iconSize={30} elevated disabled={answering} onPress={() => swipe("like")} />
        </XStack>
      ) : null}

      {(source === "shared" || source === "circle") && composeShared && (source === "circle" ? passed : shared.data?.profile) ? (
        <SparkComposer profile={(source === "circle" ? passed : shared.data?.profile) as DiscoverProfile} kind="like" onClose={() => setComposeShared(false)} onSend={(note) => { setComposeShared(false); void answerLike("like", note); }} />
      ) : null}
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[
          {
            label: `Report ${profile.displayName}`,
            icon: "flag-outline",
            destructive: true,
            onPress: () => navigation.navigate("Report", { targetUid: profile.uid, name: profile.displayName, matchId })
          },
          { label: `Block ${profile.displayName}`, icon: "ban-outline", destructive: true, onPress: confirmBlock }
        ]}
      />
    </YStack>
  );
}
