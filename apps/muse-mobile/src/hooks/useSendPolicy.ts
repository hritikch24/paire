import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { fetchSendPolicy, type SendPolicy } from "../services/sendPolicyService";
import { useAuthStore } from "../store/authStore";

/**
 * The accept-flow and free-sending switches from the server. `data` is
 * undefined while loading and null if the call failed: nothing changes then
 * (the app behaves as with the switches off, and the rules decide anyway).
 * Never throws into the UI. Refreshed whenever the screen comes into view.
 */
export function useSendPolicy() {
  const uid = useAuthStore((state) => state.user?.uid);
  const query = useQuery<SendPolicy | null>({
    queryKey: ["send-policy", uid],
    queryFn: async () => {
      try {
        return await fetchSendPolicy();
      } catch {
        return null;
      }
    },
    enabled: Boolean(uid),
    staleTime: 30_000,
    refetchOnWindowFocus: true
  });
  const { refetch } = query;
  // Several screens mount this hook: on focus only refresh what has gone stale (read through a ref, so staleness itself never re-runs the effect).
  const stale = useRef(query.isStale);
  stale.current = query.isStale;
  useFocusEffect(
    useCallback(() => {
      if (stale.current) void refetch();
    }, [refetch])
  );
  return query;
}
