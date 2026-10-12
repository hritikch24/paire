import { AgeGapSide, DiscoverProfile, FeedCursor, SwipeResult, SwipeType } from "../types/models";
import { callFunction } from "./firebase";

export type FeedPage = { profiles: DiscoverProfile[]; cursor: FeedCursor | null };
export type DailyAllowance = { remaining: { likes: number; supers: number }; limits: { likes: number; supers: number }; resetsAt: number };

export function fetchDailyAllowance(): Promise<DailyAllowance> {
  return callFunction<DailyAllowance>("getDailyAllowance");
}

/** Next page of people who match your preferences (and whose preferences you match). */
/** One feed filter at a time: an age-gap side (Paire Plus only), or the Garba Nights edition. */
export type FeedFilter = AgeGapSide | "garba" | null;

export function fetchFeedPage(cursor: FeedCursor | null, filter: FeedFilter = null): Promise<FeedPage> {
  if (filter === "garba") return callFunction<FeedPage>("getDiscoverFeed", { cursor, garba: true });
  return callFunction<FeedPage>("getDiscoverFeed", filter ? { cursor, ageGap: filter } : { cursor });
}

/**
 * Records a like, pass or Super Like; `matched` is true only for a mutual like.
 * A like can carry a short note ("spark"), screened by the server.
 */
export function sendSwipe(targetUid: string, type: SwipeType, note?: string | null): Promise<SwipeResult> {
  return callFunction<SwipeResult>("swipe", note ? { targetUid, type, note } : { targetUid, type });
}

/** People who liked you and are waiting for your answer. */
export async function fetchLikesYou(): Promise<DiscoverProfile[]> {
  return (await callFunction<{ profiles: DiscoverProfile[] }>("getLikesYou", {})).profiles;
}

/** Brings back someone you passed on. */
export function undoPass(targetUid: string): Promise<{ ok: boolean }> {
  return callFunction<{ ok: boolean }>("undoSwipe", { targetUid });
}
