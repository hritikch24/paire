import { isAppReady } from "../src/utils/appReady";

describe("isAppReady", () => {
  it("allows guest mode without waiting for profile fetch", () => {
    const ready = isAppReady({
      fontsLoaded: true,
      splashTimeout: false,
      loading: false,
      user: { uid: "guest_1" },
      profileLoading: true,
      profileFetched: false,
      isGuest: true,
      isDemo: false,
      profileLoaded: false
    });

    expect(ready).toBe(true);
  });

  it("waits for profile when signed in", () => {
    const ready = isAppReady({
      fontsLoaded: true,
      splashTimeout: false,
      loading: false,
      user: { uid: "user_1" },
      profileLoading: true,
      profileFetched: false,
      isGuest: false,
      isDemo: false,
      profileLoaded: false
    });

    expect(ready).toBe(false);
  });

  it("allows demo mode without waiting for profile fetch", () => {
    const ready = isAppReady({
      fontsLoaded: true,
      splashTimeout: false,
      loading: false,
      user: { uid: "demo_1" },
      profileLoading: true,
      profileFetched: false,
      isGuest: false,
      isDemo: true,
      profileLoaded: false
    });

    expect(ready).toBe(true);
  });

  it("allows app when profile is already loaded", () => {
    const ready = isAppReady({
      fontsLoaded: true,
      splashTimeout: false,
      loading: false,
      user: { uid: "user_2" },
      profileLoading: false,
      profileFetched: false,
      isGuest: false,
      isDemo: false,
      profileLoaded: true
    });

    expect(ready).toBe(true);
  });
});
