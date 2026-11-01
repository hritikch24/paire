import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { callFunction } from "../services/firebase";
import { useAuthStore } from "../store/authStore";
import type { MemberOffer } from "../config/member-offer";
import { OfferPlan } from "../config/launch-offer";
import { useWebScreenActive } from "./useWebScreenActive";
export type LaunchQuote = { personalized?: MemberOffer | null; active: boolean; endsAt: number; remaining: number; couponAvailable: boolean; code: string | null; plans: Record<OfferPlan, { regular: number; amount: number; offer: number; coupon: number }> };
export function useLaunchOffer() {
  const uid = useAuthStore(state => state.user?.uid);
  const active = useWebScreenActive();
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const quote = useQuery({ queryKey: ["launch-offer", uid, code], queryFn: () => callFunction<LaunchQuote>("getLaunchOffer", { code }), enabled: Platform.OS === "web" && Boolean(uid) && active, staleTime: 5 * 60_000, refetchInterval: query => query.state.data?.personalized ? 5 * 60_000 : query.state.data?.active ? 60_000 : false, retry: false });
  const expiresAt = quote.data?.personalized?.expiresAt;
  const refetch = quote.refetch;
  useEffect(() => {
    if (!active || !expiresAt) return;
    const delay = expiresAt - Date.now() + 100;
    if (delay <= 0) { void refetch(); return; }
    if (delay > 2147483647) return;
    const timer = setTimeout(() => {
      // A visibility event can arrive just before React cleans up this timer.
      if (typeof document === "undefined" || document.visibilityState !== "hidden") void refetch();
    }, delay);
    return () => clearTimeout(timer);
  }, [active, expiresAt, refetch]);
  return { input, setInput, code, quote, apply: () => setCode(input.trim().toUpperCase()), remove: () => { setCode(""); setInput(""); } };
}
