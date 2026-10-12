import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pending: (() => void) | null = null;

/** Runs a navigation action now, or once the navigator is mounted (e.g. cold start from a notification). */
export function navigateWhenReady(action: () => void) {
  if (navigationRef.isReady()) {
    action();
  } else {
    pending = action;
  }
}

export function flushPendingNavigation() {
  if (pending && navigationRef.isReady()) {
    const action = pending;
    pending = null;
    action();
  }
}

export function openChat(matchId: string) {
  navigateWhenReady(() => navigationRef.navigate("App", { screen: "Chat", params: { matchId } }));
}

export function openSafetyCenter() {
  navigateWhenReady(() => navigationRef.navigate("App", { screen: "SafetyCenter" }));
}

export function openDuo() {
  navigateWhenReady(() => navigationRef.navigate("App", { screen: "Duo" }));
}
