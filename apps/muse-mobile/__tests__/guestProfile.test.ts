import { createGuestProfile } from "../src/utils/guestProfile";

describe("createGuestProfile", () => {
  it("creates a safe guest profile for local exploration", () => {
    const profile = createGuestProfile();

    expect(profile.uid.startsWith("guest_")).toBe(true);
    expect(profile.onboardingComplete).toBe(true);
    expect(profile.safetyConfirmed).toBe(true);
    expect(profile.isDiscoverable).toBe(false);
  });
});
