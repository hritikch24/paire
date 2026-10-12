import { Platform } from "react-native";

type MetaEvent = "CompleteRegistration" | "Purchase";

/**
 * Ad conversions for the Meta Pixel, on the web only and only when the site was
 * built with PAIRE_META_PIXEL_ID (apps/web/scripts/build.mjs loads the pixel).
 * Never sends profile details: just the event, and the amount for a purchase.
 */
export function trackConversion(event: MetaEvent, params?: { value: number; currency: "INR" }): void {
  if (Platform.OS !== "web") return;
  try {
    const fbq = (globalThis as { fbq?: (...args: unknown[]) => void }).fbq;
    fbq?.("track", event, params);
  } catch {
    // Analytics must never break the app.
  }
}
