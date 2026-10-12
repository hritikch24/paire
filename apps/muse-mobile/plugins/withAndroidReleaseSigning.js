const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// muse-release-signing";

/**
 * Signs local release builds with your Google Play upload key.
 *
 * Put the key details in apps/muse-mobile/keystore.properties (git-ignored):
 *   storeFile=/absolute/path/to/muse-upload.jks
 *   storePassword=...
 *   keyAlias=muse-upload
 *   keyPassword=...
 * or export MUSE_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD.
 *
 * Without a key, release APKs fall back to the debug key for local testing, and
 * `bundleRelease` (the Play upload artifact) fails fast. EAS Build manages its own
 * signing, so the check is skipped there. "Muse Test" builds (for sideloading)
 * always use the debug key, so the upload key never leaves your machine.
 */
const SIGNING_BLOCK = `
${MARKER}
def museSigningProps = new Properties()
def museSigningFile = new File(rootDir.parentFile, "keystore.properties")
if (museSigningFile.exists()) {
    museSigningFile.withInputStream { museSigningProps.load(it) }
}
def museSigning = { String key, String envName -> museSigningProps.getProperty(key) ?: System.getenv(envName) }
def museStoreFile = museSigning("storeFile", "MUSE_UPLOAD_STORE_FILE")
if (museStoreFile) {
    def resolvedStoreFile = new File(museStoreFile).isAbsolute() ? new File(museStoreFile) : new File(rootDir.parentFile, museStoreFile)
    android.signingConfigs.create("museUpload") {
        storeFile resolvedStoreFile
        storePassword museSigning("storePassword", "MUSE_UPLOAD_STORE_PASSWORD")
        keyAlias museSigning("keyAlias", "MUSE_UPLOAD_KEY_ALIAS")
        keyPassword museSigning("keyPassword", "MUSE_UPLOAD_KEY_PASSWORD")
    }
    android.buildTypes.release.signingConfig android.signingConfigs.museUpload
} else if (!System.getenv("EAS_BUILD")) {
    gradle.taskGraph.whenReady { graph ->
        if (graph.allTasks.any { it.name == "bundleRelease" }) {
            throw new GradleException("Muse: release signing is not configured. Create apps/muse-mobile/keystore.properties (see docs/RELEASE.md) before building the Play bundle.")
        }
    }
}
`;

module.exports = function withAndroidReleaseSigning(config) {
  if (process.env.EXPO_PUBLIC_TEST_SERVER === "true") return config;
  return withAppBuildGradle(config, (gradleConfig) => {
    if (!gradleConfig.modResults.contents.includes(MARKER)) {
      gradleConfig.modResults.contents += SIGNING_BLOCK;
    }
    return gradleConfig;
  });
};
