import { collection, getDocs, limit, query, where, orderBy } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "./firebase";
import { UserLocation, UserProfile } from "../types/models";
import { scoreInterests } from "../utils/scoreInterests";
import { distanceKm } from "../utils/distance";
import { demoProfiles } from "../data/demoProfiles";

type DiscoveryOptions = {
  vibePreference?: "any" | "shared";
  maxDistanceKm?: number;
  location?: UserLocation | null;
  shareLocation?: boolean;
};

export async function fetchDiscoverProfiles(
  uid: string,
  interests: string[],
  vibes: string[],
  options: DiscoveryOptions = {}
) {
  const usersQuery = query(
    collection(db, "users"),
    where("uid", "!=", uid),
    orderBy("uid"),
    limit(50)
  );

  const reportsPromise = getDocs(query(collection(db, "reports"), where("reporterId", "==", uid))).catch(() => ({
    docs: []
  }));

  const [usersSnapshot, swipesSnapshot, blocksSnapshot, reportsSnapshot] = await Promise.all([
    getDocs(usersQuery),
    getDocs(collection(db, "swipes", uid, "outgoing")),
    getDocs(collection(db, "blocks", uid, "blocked")),
    reportsPromise
  ]);

  const swipedIds = new Set(swipesSnapshot.docs.map((doc: any) => doc.id));
  const blockedIds = new Set(blocksSnapshot.docs.map((doc: any) => doc.id));
  const reportedIds = new Set(reportsSnapshot.docs.map((doc: any) => doc.data().targetId as string));

  const candidates: UserProfile[] = [];
  usersSnapshot.forEach((doc: any) => {
    const data = doc.data() as UserProfile;
    if (!data.isDiscoverable) return;
    if (blockedIds.has(data.uid)) return;
    if (swipedIds.has(data.uid)) return;
    if (reportedIds.has(data.uid)) return;
    candidates.push(data);
  });

  const filtered = candidates.filter((profile) => {
    const sharedVibes = vibes.filter((vibe) => profile.vibes?.includes(vibe));
    if (options.vibePreference === "shared" && !sharedVibes.length) {
      return false;
    }
    if (options.shareLocation && options.location && options.maxDistanceKm) {
      if (!profile.shareLocation || !profile.location) {
        return false;
      }
      const km = distanceKm(
        { lat: options.location.lat, lng: options.location.lng },
        { lat: profile.location.lat, lng: profile.location.lng }
      );
      if (km > options.maxDistanceKm) {
        return false;
      }
    }
    return true;
  });

  const ranked = filtered
    .map((profile) => {
      const interestScore = scoreInterests(interests, profile.interests);
      const vibeScore = scoreInterests(vibes, profile.vibes ?? []);
      return {
        profile,
        score: interestScore * 0.7 + vibeScore * 0.3
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.profile);

  if (!ranked.length && __DEV__) {
    return demoProfiles.filter((profile) => profile.uid !== uid);
  }

  return ranked;
}
