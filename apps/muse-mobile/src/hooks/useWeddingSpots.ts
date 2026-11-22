import { useEffect, useState } from "react";
import { subscribeWeddingSpots, type WeddingSpot } from "../services/weddingService";
import { useAuthStore } from "../store/authStore";

/** The member's own weddings, live. `null` until the first answer. */
export function useWeddingSpots(): { spots: WeddingSpot[] | null; failed: boolean } {
  const uid = useAuthStore((state) => state.user?.uid);
  const [spots, setSpots] = useState<WeddingSpot[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!uid) return;
    return subscribeWeddingSpots(uid, (next) => { setSpots(next); setFailed(false); }, () => setFailed(true));
  }, [uid]);
  return { spots, failed };
}
