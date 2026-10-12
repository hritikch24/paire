import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchLikesYou } from "../services/discoveryService";

export const LIKES_YOU_KEY = ["likes-you"] as const;

/** People waiting for your answer; refreshed whenever the screen comes into view. */
export function useLikesYou() {
  const query = useQuery({ queryKey: LIKES_YOU_KEY, queryFn: fetchLikesYou, staleTime: 15_000 });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );
  return query;
}
