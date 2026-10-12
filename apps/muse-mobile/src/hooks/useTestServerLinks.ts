import { useEffect } from "react";
import { Linking } from "react-native";
import { showToast } from "../components/Toast";
import { env } from "../config/env";
import { useTestServerStore } from "../store/testServerStore";
import { isConnectLink, parseServerAddress, serverLabel } from "../utils/serverAddress";

/**
 * Test-server builds: connects using the link that opened the app, and switches
 * servers when an invite's "Open in Paire Test" link arrives while it's open.
 */
export function useTestServerLinks() {
  useEffect(() => {
    if (!env.testServer) return;
    void Linking.getInitialURL()
      .catch(() => null)
      .then((url) => useTestServerStore.getState().start(url));

    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!isConnectLink(url)) return;
      const store = useTestServerStore.getState();
      const origin = parseServerAddress(url);
      if (origin && origin === store.origin && store.status === "ready") return;
      void store.connect(url).then((connected) => {
        const state = useTestServerStore.getState();
        // The connect screen shows its own errors; toasts cover the running app.
        if (connected) showToast(`Connected to ${serverLabel(state.origin)}`, "success");
        else if (state.status === "ready" && state.error) showToast(state.error, "error");
      });
    });
    return () => subscription.remove();
  }, []);
}
