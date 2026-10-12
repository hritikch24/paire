/**
 * Test-server builds send Firebase traffic to this placeholder origin and the app
 * points it at the current tunnel address as each request goes out (see
 * services/testServer.ts). Photo URLs are stored with it too, so they keep
 * working when the address changes. `.invalid` never resolves, so a request that
 * somehow isn't rewritten fails instead of going anywhere else.
 */
export const PLACEHOLDER_HOST = "muse-test-server.invalid";
export const PLACEHOLDER_ORIGIN = `https://${PLACEHOLDER_HOST}`;

const CONNECT_LINK = /^[a-z][a-z0-9+.-]*:\/\/connect\/?\?(.*)$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

function queryParam(query: string, name: string): string | null {
  for (const part of query.split("&")) {
    const [key, ...rest] = part.split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("=").replace(/\+/g, " "));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** True for the app's own connect links (musetest://connect?server=…). */
export function isConnectLink(url: string | null | undefined): boolean {
  return Boolean(url && CONNECT_LINK.test(url.trim()));
}

/**
 * Reads what a tester pastes or taps: an invite link, a bare address, or a
 * connect link. Returns the server origin, or null if it isn't one. Plain http
 * is accepted only for addresses on the local network.
 */
export function parseServerAddress(input: string | null | undefined): string | null {
  let text = (input ?? "").trim();
  if (!text) return null;

  const connect = text.match(CONNECT_LINK);
  if (connect) {
    const server = queryParam(connect[1], "server");
    return server && !isConnectLink(server) ? parseServerAddress(server) : null;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  const match = text.match(/^(https?):\/\/([a-z0-9.-]+?)\.?(:\d{1,5})?(?:[/?#].*)?$/i);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const port = match[3] ?? "";
  if (host === PLACEHOLDER_HOST || host.split(".").some((label) => !label)) return null;
  if (!host.includes(".") && host !== "localhost") return null;
  if (scheme === "http" && !LOCAL_HOST.test(host)) return null;
  return `${scheme}://${host}${port}`;
}

/** Points a placeholder URL at a server; any other URL is returned unchanged. */
export function rewriteToServer(url: string, origin: string | null): string {
  if (!origin || !url.startsWith(PLACEHOLDER_ORIGIN)) return url;
  const rest = url.slice(PLACEHOLDER_ORIGIN.length);
  // Only the exact origin: not e.g. "https://muse-test-server.invalid.example.com".
  if (rest && !/^[/?#]/.test(rest)) return url;
  return origin + rest;
}

/** The host part of a server origin, for showing to people. */
export function serverLabel(origin: string | null): string {
  return origin ? origin.replace(/^https?:\/\//, "") : "";
}
