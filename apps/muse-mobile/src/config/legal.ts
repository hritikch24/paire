import { Platform } from "react-native";
import { getServerOrigin } from "../services/testServer";
import { env } from "./env";

const hostingUrl = (process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.trim() || "https://muse-352ba.web.app").replace(
  /\/+$/,
  ""
);

/** Test builds use the pages the test server serves, so links work before Hosting is deployed. */
const base = () => (env.testServer ? getServerOrigin() ?? hostingUrl : hostingUrl);

export const legal = {
  get websiteUrl() {
    return base();
  },
  get privacyUrl() {
    return `${base()}/privacy`;
  },
  get termsUrl() {
    return `${base()}/terms`;
  },
  get guidelinesUrl() {
    return `${base()}/community-guidelines`;
  },
  get safetyUrl() {
    return `${base()}/safety`;
  },
  get refundsUrl() {
    return `${base()}/refunds`;
  },
  get contactUrl() {
    return `${base()}/contact`;
  },
  get deleteAccountUrl() {
    return `${base()}/delete-account`;
  },
  /** Set EXPO_PUBLIC_SUPPORT_EMAIL for release builds (checked by scripts/release-preflight.sh). */
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || "",
  /** Bump when the Terms or Privacy Policy change materially. */
  termsVersion: Platform.OS === "web" ? "2026-10-17-support-v1" : "2026-10-12"
};
