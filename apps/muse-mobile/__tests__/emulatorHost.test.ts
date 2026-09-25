import { resolveEmulatorHost } from "../src/utils/emulatorHost";

describe("resolveEmulatorHost", () => {
  it("uses 10.0.2.2 for Android emulator when script host is emulator", () => {
    const host = resolveEmulatorHost("127.0.0.1", "android", "http://10.0.2.2:8081");
    expect(host).toBe("10.0.2.2");
  });

  it("uses localhost for physical Android when script host is LAN", () => {
    const host = resolveEmulatorHost("127.0.0.1", "android", "http://192.168.31.42:8081");
    expect(host).toBe("127.0.0.1");
  });

  it("uses device loopback when Android script host is localhost", () => {
    const host = resolveEmulatorHost("127.0.0.1", "android", "http://localhost:8081");
    expect(host).toBe("10.0.2.2");
  });

  it("uses script host for iOS when loopback is configured", () => {
    const host = resolveEmulatorHost("127.0.0.1", "ios", "http://192.168.31.42:8081");
    expect(host).toBe("192.168.31.42");
  });

  it("keeps non-loopback host", () => {
    const host = resolveEmulatorHost("192.168.31.10", "android", "http://10.0.2.2:8081");
    expect(host).toBe("192.168.31.10");
  });

  it("falls back to emulator host for Android when script host missing", () => {
    const host = resolveEmulatorHost("127.0.0.1", "android", "");
    expect(host).toBe("10.0.2.2");
  });
});
