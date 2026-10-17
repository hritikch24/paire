import { isSupportView } from "../services/supportMode";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { showToast } from "../components/Toast";
import { fetchPremiumStatus } from "../services/billingService";
import { useAuthStore } from "../store/authStore";

/**
 * Members whose earlier Razorpay checkout was blocked hear once, when they open
 * the app, that nothing was charged and that Plus can now be paid by UPI.
 */
export function usePaymentNotice() {
  const uid = useAuthStore((state) => state.user?.uid);
  const premium = useQuery({ queryKey: ["premium", uid], queryFn: fetchPremiumStatus, enabled: Boolean(uid), retry: 1, staleTime: 5 * 60_000 });
  const failed = premium.data?.previousPaymentFailed === true;
  useEffect(() => {
    if (isSupportView || !uid || !failed) return;
    const key = `paire.paymentNotice.${uid}`;
    void AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen) return;
        showToast("Your earlier Paire Plus payment didn't go through, and you weren't charged. You can now pay by UPI from Paire Plus.");
        return AsyncStorage.setItem(key, String(Date.now()));
      })
      .catch(() => undefined);
  }, [failed, uid]);
}
