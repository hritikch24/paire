import { create } from "zustand";
import { env } from "../config/env";
import { isServerReachable, loadServerOrigin, saveServerOrigin } from "../services/testServer";
import { isConnectLink, parseServerAddress, serverLabel } from "../utils/serverAddress";

/**
 * Connection to the test server, for test-server builds only. Other builds are
 * always "ready".
 *   checking: reading the saved address and checking it answers
 *   setup:    no server yet, or the member chose to switch
 *   offline:  the saved server doesn't answer (the host's computer may be off)
 */
export type TestServerStatus = "ready" | "checking" | "setup" | "offline";

type TestServerState = {
  status: TestServerStatus;
  origin: string | null;
  /** A check started from the connect screen is in progress. */
  busy: boolean;
  /** The member opened the connect screen from Settings and can go back. */
  cancellable: boolean;
  error: string | null;
  start: (launchUrl: string | null) => Promise<void>;
  connect: (input: string) => Promise<boolean>;
  retry: () => Promise<void>;
  change: () => void;
  cancel: () => void;
};

const unreachable = (origin: string) =>
  `We couldn't reach ${serverLabel(origin)}. Check the link, or ask the host whether the test server is on.`;

let started = false;

export const useTestServerStore = create<TestServerState>((set, get) => ({
  status: env.testServer ? "checking" : "ready",
  origin: null,
  busy: false,
  cancellable: false,
  error: null,

  start: async (launchUrl) => {
    if (!env.testServer || started) return;
    started = true;
    const saved = await loadServerOrigin();
    if (get().status !== "checking") return;
    const origin = (isConnectLink(launchUrl) ? parseServerAddress(launchUrl) : null) ?? saved;
    if (!origin) {
      set({ status: "setup" });
      return;
    }
    set({ status: "checking", origin });
    const reachable = await isServerReachable(origin);
    // An invite link may have connected somewhere else in the meantime.
    if (get().origin !== origin || get().status !== "checking") return;
    if (reachable) {
      await saveServerOrigin(origin);
      set({ status: "ready", error: null });
    } else {
      set({ status: "offline" });
    }
  },

  connect: async (input) => {
    const origin = parseServerAddress(input);
    if (!origin) {
      set({ error: "That doesn't look like an invite link. Copy the whole link and try again." });
      return false;
    }
    set({ busy: true, error: null });
    const reachable = await isServerReachable(origin);
    if (!reachable) {
      set({ busy: false, error: unreachable(origin) });
      return false;
    }
    await saveServerOrigin(origin);
    set({ status: "ready", origin, busy: false, cancellable: false, error: null });
    return true;
  },

  retry: async () => {
    const { origin } = get();
    if (!origin) return;
    set({ busy: true, error: null });
    if (await isServerReachable(origin)) {
      await saveServerOrigin(origin);
      set({ status: "ready", busy: false });
    } else {
      set({ busy: false, error: unreachable(origin) });
    }
  },

  change: () => set({ status: "setup", cancellable: true, error: null }),

  cancel: () => {
    if (get().cancellable) set({ status: "ready", cancellable: false, error: null });
  }
}));
