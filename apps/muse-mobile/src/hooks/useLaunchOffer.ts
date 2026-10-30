import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { callFunction } from "../services/firebase";
import { useAuthStore } from "../store/authStore";
import { OfferPlan } from "../config/launch-offer";
export type LaunchQuote = { active: boolean; endsAt: number; remaining: number; couponAvailable: boolean; code: string | null; plans: Record<OfferPlan, { regular: number; amount: number; offer: number; coupon: number }> };
export function useLaunchOffer() {
  const uid = useAuthStore(state => state.user?.uid);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const quote = useQuery({ queryKey: ["launch-offer", uid, code], queryFn: () => callFunction<LaunchQuote>("getLaunchOffer", { code }), enabled: Platform.OS === "web" && Boolean(uid), staleTime: 0, refetchInterval: 30_000, retry: false });
  return { input, setInput, code, quote, apply: () => setCode(input.trim().toUpperCase()), remove: () => { setCode(""); setInput(""); } };
}
