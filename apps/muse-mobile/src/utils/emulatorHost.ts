const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ANDROID_EMULATOR_HOSTS = new Set(["10.0.2.2", "10.0.3.2", "127.0.0.1", "localhost"]);

export function resolveEmulatorHost(rawHost: string, platform: string, scriptURL: string) {
  if (!rawHost) {
    return rawHost;
  }
  if (!LOOPBACK_HOSTS.has(rawHost)) {
    return rawHost;
  }
  const scriptHostMatch = scriptURL.match(/^https?:\/\/([^:/]+)/i);
  const scriptHost = scriptHostMatch ? scriptHostMatch[1] : undefined;
  if (platform === "android") {
    if (scriptHost) {
      if (ANDROID_EMULATOR_HOSTS.has(scriptHost)) {
        return "10.0.2.2";
      }
      return "127.0.0.1";
    }
    return "10.0.2.2";
  }
  if (scriptHost) {
    return scriptHost;
  }
  return rawHost;
}
