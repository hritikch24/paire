import { DIWALI_VIBES } from "../data/diwali";
import { workCircle } from "../data/workCircles";
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
      const circle = workCircle(url.searchParams.get("circle"));
      let navigate: () => void;
      let event = url.searchParams.get("event");
      try {
        const intent = JSON.parse(sessionStorage.getItem("paire.eventIntent") ?? "null");
        if (!event && !url.searchParams.size && intent && !intent.opened && Date.now()-intent.at < 86400000) event=intent.id;
        if (event && intent?.id===event) sessionStorage.setItem("paire.eventIntent",JSON.stringify({...intent,opened:true}));
      } catch { /* Storage is optional. */ }
      if (event && /^[A-Za-z0-9]{20}$/.test(event)) {
        try {
          const deck=url.searchParams.get("deck"),slot=url.searchParams.get("slot");
          if(deck && /^[a-f0-9-]{36}$/.test(deck) && slot && /^(?:[0-9]|1[01])$/.test(slot)) {
            sessionStorage.setItem("paire.eventIntent",JSON.stringify({id:event,deck,slot:Number(slot),campaign:url.search,opened:true,at:Date.now()}));
          }
          url.searchParams.delete("deck");url.searchParams.delete("slot");
          const session=sessionStorage.getItem("paire.preview."+event);
          if(session) void callFunction("attributeEventVisit",{id:event,session}).catch(()=>undefined);
        } catch { /* Storage may be disabled in an in-app browser. */ }
        const id=event;
        navigate = () => navigation.navigate("App",{screen:"EventRoom",params:{id}});
        url.searchParams.delete("event");
      } else if (url.searchParams.get("admin") === "events") {
        navigate = () => navigation.navigate("App",{screen:"EventAdmin"});
        url.searchParams.delete("admin");
      } else if (url.searchParams.get("admin") === "premium-buyers") {
        navigate = () => navigation.navigate("App", { screen: "RecentPremiumBuyers" });
        url.searchParams.delete("admin");
      } else if (url.searchParams.get("admin") === "signup-funnel") {
        navigate = () => navigation.navigate("App", { screen: "SignupFunnel" });
        url.searchParams.delete("admin");
      } else if (url.searchParams.get("admin") === "notifications") {
        navigate = () => navigation.navigate("App", { screen: "AdminNotifications" });
        url.searchParams.delete("admin");
      } else if (url.searchParams.get("admin") === "grant-plus") {
        navigate = () => navigation.navigate("App", { screen: "AdminPremium" });
        url.searchParams.delete("admin");
      } else if (circle) {
        navigate = () => navigation.navigate("App", { screen: "WorkCircle", params: { circle: circle.id } });
        url.searchParams.delete("circle");
      } else if (url.searchParams.get("circles") === "1") {
        navigate = () => navigation.navigate("App", { screen: "WorkCircles" });
        url.searchParams.delete("circles");
      } else if (url.searchParams.get("wedding") === "1") {
        navigate = () => navigation.navigate("App", { screen: "WeddingNods" });
        url.searchParams.delete("wedding");
      } else if (valid(profile)) {
        navigate = () => navigation.navigate("App", { screen: "ProfileView", params: { source: profile === uid ? "self" : "shared", uid: profile! } });
        url.searchParams.delete("profile");
      } else if (valid(chat) && url.searchParams.get("for") === uid) {
        navigate = () => navigation.navigate("App", { screen: "Chat", params: { matchId: chat! } });
        url.searchParams.delete("chat"); url.searchParams.delete("for");
      } else if (url.searchParams.get("duo") === "1" && url.searchParams.get("for") === uid) {
        navigate = () => navigation.navigate("App", { screen: "Duo" });
        url.searchParams.delete("duo"); url.searchParams.delete("for");
      } else if (url.searchParams.get("edition") === "diwali") {
        // A public campaign link only opens the edition; joining is always the member's own choice.
        const vibe = DIWALI_VIBES.find((item) => item === url.searchParams.get("vibe"));
        navigate = () => navigation.navigate("App", { screen: "Tabs", params: { screen: "Discover", params: { intent: { edition: "diwali", vibe, nonce: Date.now() } } } });
        url.searchParams.delete("edition"); url.searchParams.delete("vibe");
      } else if (["people", "garba", "diwali"].includes(url.searchParams.get("discover") || "") && url.searchParams.get("for") === uid) {
        const edition = url.searchParams.get("discover") as "people" | "garba" | "diwali";
        navigate = () => navigation.navigate("App", { screen: "Tabs", params: { screen: "Discover", params: { intent: { edition, nonce: Date.now() } } } });
        const id = url.searchParams.get("reminder");
        if (id && /^[a-f0-9-]{36}$/.test(id)) void callFunction("recordReminderOpen", { id }).catch(() => undefined);
        url.searchParams.delete("discover"); url.searchParams.delete("reminder"); url.searchParams.delete("for");
      } else return;
      // Consume before pushing the destination so Back cannot reopen the link.
      window.history.replaceState(window.history.state, "", `/app/${url.search}${url.hash}`);
      navigate();
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
