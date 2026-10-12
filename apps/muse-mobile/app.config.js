const fs = require("fs");
const path = require("path");

/**
 * Single source of truth for native configuration. The android/ and ios/
 * folders are generated from this file (`npx expo prebuild`), so never edit
 * them by hand — change this file or a config plugin instead.
 *
 * Release checklist: bump VERSION for user-visible releases and ANDROID_VERSION_CODE
 * for every upload to Google Play (it must always increase).
 */
const VERSION = "1.0.0";
const ANDROID_VERSION_CODE = 4;

const BRAND_COLOR = "#B83A5E";
const SPLASH_BACKGROUND = "#FBF8F6";

// In-app calls (src/config/features.ts) need camera + microphone; they stay
// blocked unless a real call provider is configured.
const callDomain = (process.env.EXPO_PUBLIC_CALL_DOMAIN || "").trim().replace(/^https?:\/\//, "");
const callsEnabled = callDomain === "8x8.vc";

// "Paire Test" (scripts/android/build-test-apk.sh): talks to the test server on a
// developer's computer instead of production, and installs beside the Play app.
const isTestServerBuild = process.env.EXPO_PUBLIC_TEST_SERVER === "true";
const APP_ID = isTestServerBuild ? "com.muse.app.test" : "com.muse.app";

// Firebase Cloud Messaging config for push notifications. Download it from the
// Firebase console (Project settings → Your apps). Register both Android apps,
// com.muse.app and com.muse.app.test: one file then serves both builds. It's used
// only if it includes this build's package, since the build fails otherwise.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
function googleServicesIncludes(packageName) {
  try {
    const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, googleServicesFile), "utf8"));
    return (json.client || []).some((client) => client?.client_info?.android_client_info?.package_name === packageName);
  } catch {
    return false;
  }
}
const hasGoogleServices = googleServicesIncludes(APP_ID);

module.exports = ({ config }) => ({
  ...config,
  name: isTestServerBuild ? "Paire Test" : "Paire",
  slug: "muse",
  version: VERSION,
  scheme: isTestServerBuild ? "musetest" : "muse",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  // Transparent, so each screen's own (themed) background shows behind the
  // buttons instead of a white scrim; the app sets the button colour (MainApp).
  androidNavigationBar: { enforceContrast: false },
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: SPLASH_BACKGROUND
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: APP_ID,
    infoPlist: {
      NSPhotoLibraryUsageDescription: "Paire uses your photos so you can add them to your profile.",
      NSLocationWhenInUseUsageDescription:
        "Paire uses your approximate location to show how far away people are. Your exact location is never shown.",
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    package: APP_ID,
    versionCode: ANDROID_VERSION_CODE,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundImage: "./assets/adaptive-background.png",
      backgroundColor: "#9A2C5A",
      monochromeImage: "./assets/adaptive-monochrome.png"
    },
    // Auth tokens live in app storage; keep them out of device backups.
    allowBackup: false,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.VIBRATE",
      ...(callsEnabled ? ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"] : [])
    ],
    // Libraries declare more than Muse needs. Photos use the system photo picker
    // (no media permission, per Google Play's photo & video permissions policy),
    // location is approximate only, and there is no camera/microphone feature.
    blockedPermissions: [
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      ...(callsEnabled ? [] : ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"])
    ],
    ...(hasGoogleServices ? { googleServicesFile } : {})
  },
  web: {
    favicon: "./assets/favicon.png"
  },
  plugins: [
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Paire uses your approximate location to show how far away people are. Your exact location is never shown.",
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false
      }
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Paire uses your photos so you can add them to your profile.",
        ...(callsEnabled ? {} : { cameraPermission: false, microphonePermission: false })
      }
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: BRAND_COLOR
      }
    ],
    "./plugins/withAndroidReleaseSigning"
  ],
  extra: {
    ...(config.extra || {}),
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
    pushEnabled: hasGoogleServices,
    // Read by src/config/env.ts; the build scripts check it in the built app.
    testServer: isTestServerBuild
  }
});
