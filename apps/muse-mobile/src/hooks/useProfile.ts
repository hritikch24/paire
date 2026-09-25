import { doc, getDoc } from "@firebase/firestore/dist/index.cjs.js";
import { useQuery } from "@tanstack/react-query";
import { db } from "../services/firebase";
import { useAuthStore } from "../store/authStore";
import { UserProfile } from "../types/models";

export function useProfileQuery(uid?: string) {
  const setProfile = useAuthStore((state) => state.setProfile);
  const isGuest = useAuthStore((state) => state.isGuest);
  const isDemo = useAuthStore((state) => state.isDemo);

  return useQuery({
    queryKey: ["profile", uid],
    enabled: Boolean(uid) && !isGuest && !isDemo,
    queryFn: async () => {
      if (!uid) return null;
      const snapshot = await getDoc(doc(db, "users", uid));
      const profile = snapshot.exists() ? (snapshot.data() as UserProfile) : null;
      setProfile(profile);
      return profile;
    }
  });
}
