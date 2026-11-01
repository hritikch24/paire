import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { callFunction } from "../services/firebase";
import { useAuthStore } from "../store/authStore";
import type { MemberOffer } from "../config/member-offer";
import { OfferPlan } from "../config/launch-offer";
export type LaunchQuote = { personalized?: MemberOffer | null; active: boolean; endsAt: number; remaining: number; couponAvailable: boolean; code: string | null; plans: Record<OfferPlan, { regular: number; amount: number; offer: number; coupon: number }> };
export function useLaunchOffer() {
  const uid = useAuthStore(state => state.user?.uid);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const quote = useQuery({ queryKey: ["launch-offer", uid, code], queryFn: () => callFunction<LaunchQuote>("getLaunchOffer", { code }), enabled: Platform.OS === "web" && Boolean(uid), staleTime: 30_000, refetchInterval: 60_000, retry: false });
  const expiresAt = quote.data?.personalized?.expiresAt;
  const refetch = quote.refetch;
  useEffect(() => {
    if (!expiresAt) return;
    const delay = expiresAt - Date.now() + 100;
    if (delay <= 0 || delay > 2147483647) return;
    const timer = setTimeout(() => void refetch(), delay);
    return () => clearTimeout(timer);
  }, [expiresAt, refetch]);
  return { input, setInput, code, quote, apply: () => setCode(input.trim().toUpperCase()), remove: () => { setCode(""); setInput(""); } };
}
