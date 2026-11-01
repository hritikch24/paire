import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { fetchLikesYou, LikesYouResult } from "../services/discoveryService";
import { useAuthStore } from "../store/authStore";
import { useWebScreenActive } from "./useWebScreenActive";

export const LIKES_YOU_KEY = ["likes-you"] as const;

/** People waiting for your answer; refreshed whenever the screen comes into view. */
export function useLikesYou(poll = false) {
  const uid = useAuthStore((state) => state.user?.uid);
  const active = useWebScreenActive();
  const client = useQueryClient();
  const query = useQuery({ queryKey: [...LIKES_YOU_KEY, uid], queryFn: fetchLikesYou, enabled: Boolean(uid) && active, staleTime: Platform.OS === "web" ? 30_000 : 15_000, refetchOnWindowFocus: true, refetchInterval: poll ? Platform.OS === "web" ? 120_000 : 60_000 : false });
  const { refetch } = query;
  const expiresAt = query.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt || query.data?.locked) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (Date.now() < expiresAt) { schedule(); return; }
        client.setQueryData<LikesYouResult>([...LIKES_YOU_KEY, uid], (data) => data ? { ...data, profiles: [], locked: true, expiresAt: null } : data);
        if (active) void refetch();
      }, Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now() + 10)));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [expiresAt, query.data?.locked, uid, client, refetch, active]);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web") void refetch();
    }, [refetch])
  );
  return query;
}
