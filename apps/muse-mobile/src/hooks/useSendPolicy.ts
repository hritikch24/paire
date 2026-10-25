import { useQuery } from "@tanstack/react-query";
import { fetchSendPolicy } from "../services/sendPolicyService";
import { useAuthStore } from "../store/authStore";

/** The accept-flow and free-sending switches from the server. While unknown (loading, offline) nothing changes. */
export function useSendPolicy() {
  const uid = useAuthStore((state) => state.user?.uid);
  return useQuery({ queryKey: ["send-policy", uid], queryFn: () => fetchSendPolicy(), enabled: Boolean(uid), staleTime: 60_000, retry: 1 });
}
