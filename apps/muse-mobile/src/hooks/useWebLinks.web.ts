import { useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { isSupportView } from "../services/supportMode";
import { callFunction } from "../services/firebase";

/** Delayed until AppStack mounts, so shared links survive sign-in and onboarding. */
export function useWebLinks() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useAuthStore((state) => state.user?.uid);
  useEffect(() => {
    if (!uid || isSupportView) return;
    const open = (url: URL) => {
      if (url.origin !== window.location.origin) return;
      const profile = url.searchParams.get("profile");
      const chat = url.searchParams.get("chat");
      const valid = (value: string | null) => Boolean(value && /^[A-Za-z0-9_-]{1,256}$/.test(value));
      if (url.searchParams.get("admin") === "grant-plus") {
        navigation.navigate("App", { screen: "AdminPremium" });
        url.searchParams.delete("admin");
      } else if (valid(profile)) {
        navigation.navigate("App", { screen: "ProfileView", params: { source: profile === uid ? "self" : "shared", uid: profile! } });
        url.searchParams.delete("profile");
      } else if (valid(chat) && url.searchParams.get("for") === uid) {
        navigation.navigate("App", { screen: "Chat", params: { matchId: chat! } });
        url.searchParams.delete("chat"); url.searchParams.delete("for");
      } else if (url.searchParams.get("duo") === "1" && url.searchParams.get("for") === uid) {
        navigation.navigate("App", { screen: "Duo" });
        url.searchParams.delete("duo"); url.searchParams.delete("for");
      } else if (["people", "garba"].includes(url.searchParams.get("discover") || "") && url.searchParams.get("for") === uid) {
        const edition = url.searchParams.get("discover") as "people" | "garba";
        navigation.navigate("App", { screen: "Tabs", params: { screen: "Discover", params: { intent: { edition, nonce: Date.now() } } } });
        const id = url.searchParams.get("reminder");
        if (id && /^[a-f0-9-]{36}$/.test(id)) void callFunction("recordReminderOpen", { id }).catch(() => undefined);
        url.searchParams.delete("discover"); url.searchParams.delete("reminder"); url.searchParams.delete("for");
      } else return;
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    };
    // Let the nested stack mount before applying a cold-start destination.
    const timer = setTimeout(() => open(new URL(window.location.href)), 0);
    const message = (event: MessageEvent) => {
      if (event.data?.type === "paire-push-open" && typeof event.data.url === "string") {
        try { open(new URL(event.data.url)); } catch { return; }
      }
    };
    navigator.serviceWorker?.addEventListener("message", message);
    return () => { clearTimeout(timer); navigator.serviceWorker?.removeEventListener("message", message); };
  }, [uid, navigation]);
}
