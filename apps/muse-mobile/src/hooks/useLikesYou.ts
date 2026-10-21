import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { fetchLikesYou, LikesYouResult } from "../services/discoveryService";
import { useAuthStore } from "../store/authStore";

export const LIKES_YOU_KEY = ["likes-you"] as const;

/** People waiting for your answer; refreshed whenever the screen comes into view. */
export function useLikesYou(poll = false) {
  const uid = useAuthStore((state) => state.user?.uid);
  const client = useQueryClient();
  const query = useQuery({ queryKey: [...LIKES_YOU_KEY, uid], queryFn: fetchLikesYou, enabled: Boolean(uid), staleTime: 15_000, refetchOnWindowFocus: true, refetchInterval: poll ? 60_000 : false });
  const { refetch } = query;
  const expiresAt = query.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt || query.data?.locked) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (Date.now() < expiresAt) { schedule(); return; }
        client.setQueryData<LikesYouResult>([...LIKES_YOU_KEY, uid], (data) => data ? { ...data, profiles: [], locked: true, expiresAt: null } : data);
        void refetch();
      }, Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now() + 10)));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [expiresAt, query.data?.locked, uid, client, refetch]);
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );
  return query;
}
