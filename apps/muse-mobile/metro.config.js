const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");
const { withTamagui } = require("@tamagui/metro-plugin");

let config = getDefaultConfig(__dirname);

config = withTamagui(config, {
  config: "./tamagui.config.ts",
  components: ["tamagui"],
  outputCSS: "./.tamagui/tamagui.css"
});

const localModule = (name) => path.dirname(require.resolve(`${name}/package.json`, {
  paths: [path.dirname(require.resolve("firebase/package.json")), __dirname]
}));

config.resolver = {
  ...config.resolver,
  resolverMainFields: ["react-native", "main", "browser"],
  resolveRequest(context, moduleName, platform) {
    if (moduleName.startsWith("@firebase/")) {
      const parts = moduleName.split("/");
      const name = parts.slice(0, 2).join("/");
      const root = localModule(name);
      // Explicit CJS imports must share the registry even if npm nests auth.
      const entry = name === "@firebase/auth"
        ? (platform === "web" ? "dist/browser-cjs/index.js" : "dist/rn/index.js")
        : name === "@firebase/firestore" && platform !== "web" ? "dist/index.rn.js"
        : JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).main;
      // RN fetch has no streaming response body. The SDK's RN entry disables
      // Fetch streams, which the browser entry enables even with long-polling.
      const subpath = name === "@firebase/firestore" && platform !== "web" && parts.slice(2).join("/") === "dist/index.cjs.js"
        ? ["dist/index.rn.js"] : parts.slice(2);
      const target = path.join(root, ...(parts.length > 2 ? subpath : [entry]));
      return context.resolveRequest(context, target, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
  // The app is a standalone npm project; never resolve from a parent node_modules.
  nodeModulesPaths: [path.resolve(__dirname, "node_modules")],
  extraNodeModules: {
    ...(config.resolver && config.resolver.extraNodeModules),
    // Pin each Firebase package to one instance so auth, firestore, storage and
    // functions share a single component registry.
    "@firebase/app": localModule("@firebase/app"),
    "@firebase/auth": localModule("@firebase/auth"),
    "@firebase/firestore": localModule("@firebase/firestore"),
    "@firebase/storage": localModule("@firebase/storage"),
    "@firebase/functions": localModule("@firebase/functions"),
    "@react-native-async-storage/async-storage": require.resolve("@react-native-async-storage/async-storage/lib/commonjs/index.js")
  }
};

module.exports = config;
