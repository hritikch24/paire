import { useQuery } from "@tanstack/react-query";
import { fetchGifts, type GiftList } from "../services/giftService";
import { useAuthStore } from "../store/authStore";

/**
 * Gifts sent and received. Not tied to the giftSales switch: a gift already
 * paid for stays claimable (and visible) even if sales are paused. A failed
 * call just leaves `data` empty; nothing else in the app depends on it.
 */
export function useGifts() {
  const uid = useAuthStore((state) => state.user?.uid);
  return useQuery<GiftList>({
    queryKey: ["gifts", uid],
    queryFn: fetchGifts,
    enabled: Boolean(uid),
    // Shown on every Matches visit, so it costs at most one call every few minutes; actions refresh it by invalidation.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1
  });
}
