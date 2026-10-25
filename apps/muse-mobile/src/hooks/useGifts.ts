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
    staleTime: 30_000,
    retry: 1
  });
}
