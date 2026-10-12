import AsyncStorage from "@react-native-async-storage/async-storage";
import { PLACEHOLDER_ORIGIN, rewriteToServer } from "../utils/serverAddress";

/**
 * Test-server builds (EXPO_PUBLIC_TEST_SERVER) talk to Firebase emulators on a
 * developer's computer, reached through a Cloudflare tunnel whose address changes
 * whenever the tunnel restarts (scripts/test-backend.sh). Firebase is configured
 * with a fixed placeholder origin, and each request is pointed at the current
 * address as it is sent, so switching servers needs no restart.
 */

const STORAGE_KEY = "muse.testServer.origin";

let currentOrigin: string | null = null;
let loading: Promise<string | null> | null = null;
let markLoaded: () => void = () => undefined;
const loaded = new Promise<void>((resolve) => {
  markLoaded = resolve;
});

export function getServerOrigin(): string | null {
  return currentOrigin;
}

/** Reads the saved server address once. Requests wait for it before going out. */
export function loadServerOrigin(): Promise<string | null> {
  if (!loading) {
    loading = AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null)
      .then((saved) => {
        // A connect link may have set an address while storage was being read.
        currentOrigin = currentOrigin ?? saved;
        markLoaded();
        return currentOrigin;
      });
  }
  return loading;
}

export async function saveServerOrigin(origin: string): Promise<void> {
  currentOrigin = origin;
  markLoaded();
  await AsyncStorage.setItem(STORAGE_KEY, origin).catch(() => undefined);
}

/** The real URL for a placeholder URL (photos, uploads); others are unchanged. */
export function resolveServerUrl(url: string): string {
  return rewriteToServer(url, currentOrigin);
}

/** Whether an address answers as a Paire test server. */
export async function isServerReachable(origin: string, timeoutMs = 10_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin}/healthz`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { service?: string };
    return body.service === "muse-test-server";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let routingInstalled = false;

/**
 * Sends requests for the placeholder origin to the current server. React
 * Native's fetch runs on XMLHttpRequest, so rewriting XMLHttpRequest URLs covers
 * both. The fetch wrapper only holds requests until the saved address is loaded.
 */
export function installServerRouting(): void {
  if (routingInstalled) return;
  routingInstalled = true;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith(PLACEHOLDER_ORIGIN)) return originalFetch(input, init);
    await loaded;
    // Pass Request objects (Firestore's streams) through as they are: rebuilding
    // one for a new URL drops its body in React Native's fetch polyfill.
    return originalFetch(typeof input === "string" || input instanceof URL ? resolveServerUrl(url) : input, init);
  };

  const prototype = XMLHttpRequest.prototype as unknown as { open: (...args: unknown[]) => void };
  const originalOpen = prototype.open;
  prototype.open = function open(this: XMLHttpRequest, method: unknown, url: unknown, ...rest: unknown[]) {
    return originalOpen.call(this, method, typeof url === "string" ? resolveServerUrl(url) : url, ...rest);
  };
}
