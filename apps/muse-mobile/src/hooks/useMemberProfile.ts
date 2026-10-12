import { doc, getDoc } from "@firebase/firestore/dist/index.cjs.js";
import { useQuery } from "@tanstack/react-query";
import { db } from "../services/firebase";
import { UserProfile } from "../types/models";

/**
 * Another member's public profile. Readable only while you have an active
 * match with them; resolves to null once the match ends or they leave.
 */
export function useMemberProfile(uid: string | undefined) {
  return useQuery({
    queryKey: ["member-profile", uid],
    enabled: Boolean(uid),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const snapshot = await getDoc(doc(db, "users", uid!));
        return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
      } catch {
        return null;
      }
    }
  });
}
