import type { LinkingOptions } from "@react-navigation/native";
import type { RootStackParamList } from "./types";
import { useAuthStore } from "../store/authStore";
import { needsOnboarding } from "../utils/profile";

/**
 * Record screen transitions in React Navigation's browser history, even though
 * every screen lives at /app/. Browser Back/Forward can then restore the screen
 * instead of leaving the document. Navigation state stays in memory, not URLs.
 */
export const browserLinking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  // A reload starts at the normal authenticated home. Query-link handlers own
  // shared profiles, notifications, support sessions and checkout returns.
  getStateFromPath: () => {
    const session = useAuthStore.getState();
    const name = session.status !== "signedIn" ? "Auth" : !session.emailVerified ? "VerifyEmail" : needsOnboarding(session.profile) ? "Onboarding" : "App";
    return { routes: [{ name }] };
  },
  // Preserve incoming query links until their handler consumes them.
  getPathFromState: () => `/app/${window.location.search}`
};
