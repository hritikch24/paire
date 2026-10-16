import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchChatAccess } from "../services/chatAccessService";
import { useAuthStore } from "../store/authStore";

/**
 * Your messaging access from the server. Follows the authoritative state:
 * refreshed on focus and when a Plus pass runs out, and restored on any
 * device you sign in on (it belongs to the account, not the device).
 */
export function useChatAccess() {
  const uid = useAuthStore((state) => state.user?.uid);
  const query = useQuery({ queryKey: ["chat-access", uid], queryFn: () => fetchChatAccess(), enabled: Boolean(uid), staleTime: 60_000, retry: 1 });
  const premiumUntil = query.data?.unlimited ? null : query.data?.premiumUntil;
  const { refetch } = query;
  useEffect(() => {
    if (!premiumUntil) return;
    const wait = premiumUntil - Date.now() + 1000;
    if (wait <= 0 || wait > 2 ** 31 - 1) return;
    const timer = setTimeout(() => void refetch(), wait);
    return () => clearTimeout(timer);
  }, [premiumUntil, refetch]);
  return query;
}
