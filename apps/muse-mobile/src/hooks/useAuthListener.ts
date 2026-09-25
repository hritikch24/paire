import { onAuthStateChanged } from "@firebase/auth/dist/rn";
import { useEffect } from "react";
import { auth } from "../services/firebase";
import { useAuthStore } from "../store/authStore";

export function useAuthListener() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const isGuest = useAuthStore((state) => state.isGuest);
  const isDemo = useAuthStore((state) => state.isDemo);

  useEffect(() => {
    if (isGuest || isDemo) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setUser(user);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [isDemo, isGuest, setLoading, setUser]);
}
