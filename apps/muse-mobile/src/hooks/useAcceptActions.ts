import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { showToast } from "../components/Toast";
import { acceptLike, sendSwipe, type LikesYouResult } from "../services/discoveryService";
import { errorCode, friendlyError } from "../services/errors";
import { suppressMatchAlert } from "../services/notificationService";
import { useAuthStore } from "../store/authStore";
import type { DiscoverProfile } from "../types/models";
import type { AppStackParamList } from "../navigation/types";
import { LIKES_YOU_KEY } from "./useLikesYou";

/**
 * A woman's two answers to a like: Accept (makes the match and opens the chat)
 * and Not now (an ordinary pass, which also takes the card off her list). One
 * answer at a time: a double tap on Accept never sends a second request.
 */
export function useAcceptActions() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const client = useQueryClient();
  const uid = useAuthStore((state) => state.user?.uid);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const inFlight = useRef(false);

  /** Takes the member off the cached list right away; the refetch then confirms it. */
  const removeFromList = (targetUid: string) => {
    client.setQueryData<LikesYouResult>([...LIKES_YOU_KEY, uid], (data) => {
      if (!data) return data;
      const profiles = data.profiles.filter((profile) => profile.uid !== targetUid);
      return { ...data, profiles, count: Math.max(0, data.count - (data.profiles.length - profiles.length)) };
    });
    void client.invalidateQueries({ queryKey: LIKES_YOU_KEY });
  };

  const run = async (profile: DiscoverProfile, work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingUid(profile.uid);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setPendingUid(null);
    }
  };

  const accept = (profile: DiscoverProfile) =>
    run(profile, async () => {
      try {
        const result = await acceptLike(profile.uid);
        suppressMatchAlert(result.matchId);
        removeFromList(profile.uid);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        showToast(`It's a match! You and ${profile.displayName.split(" ")[0]} can chat now.`, "success");
        navigation.navigate("Chat", {
          matchId: result.matchId,
          otherUid: profile.uid,
          name: profile.displayName,
          photoUrl: profile.photoUrls[0] ?? null
        });
      } catch (error) {
        showToast(friendlyError(error, "Couldn't accept that like. Please try again."), "error");
        // The like is gone (withdrawn, blocked, or already answered): drop the card rather than leave a dead button.
        const code = errorCode(error);
        if (code === "functions/not-found" || code === "not-found") removeFromList(profile.uid);
      }
    });

  const notNow = (profile: DiscoverProfile) =>
    run(profile, async () => {
      try {
        await sendSwipe(profile.uid, "nope");
        removeFromList(profile.uid);
      } catch (error) {
        showToast(friendlyError(error, "Couldn't do that. Please try again."), "error");
      }
    });

  return { accept, notNow, pendingUid };
}
