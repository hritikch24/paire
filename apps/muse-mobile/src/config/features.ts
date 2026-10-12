import Constants from "expo-constants";
import { Platform } from "react-native";

const callDomain = process.env.EXPO_PUBLIC_CALL_DOMAIN?.trim().replace(/^https?:\/\//, "") ?? "";

export const features = {
  /**
   * Authenticated 8x8 JaaS calls. The server must issue room-specific tokens.
   */
  calls: callDomain === "8x8.vc",
  callDomain,
  /** Push needs google-services.json at build time (see app.config.js). */
  push: Boolean(Constants.expoConfig?.extra?.pushEnabled),
  /**
   * Message and match alerts. Without push they're shown by the app itself
   * while it's running (hooks/useMatchAlerts.ts).
   */
  notifications: Platform.OS !== "web"
};
