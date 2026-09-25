const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withTamagui } = require("@tamagui/metro-plugin");

let config = getDefaultConfig(__dirname);

config = withTamagui(config, {
  config: "./tamagui.config.ts",
  components: ["tamagui"],
  outputCSS: "./.tamagui/tamagui.css"
});

config.resolver = {
  ...config.resolver,
  resolverMainFields: ["react-native", "main", "browser"],
  nodeModulesPaths: [
    path.resolve(__dirname, "node_modules"),
    path.resolve(__dirname, "../../node_modules")
  ],
  extraNodeModules: {
    ...(config.resolver && config.resolver.extraNodeModules),
    "@firebase/app": path.resolve(__dirname, "node_modules/@firebase/app"),
    "@firebase/auth": path.resolve(__dirname, "node_modules/@firebase/auth"),
    "@firebase/firestore": path.resolve(__dirname, "node_modules/@firebase/firestore"),
    "@firebase/storage": path.resolve(__dirname, "node_modules/@firebase/storage"),
    "@firebase/functions": path.resolve(__dirname, "node_modules/@firebase/functions"),
    "@react-native-async-storage/async-storage": path.resolve(
      __dirname,
      "../../node_modules/@react-native-async-storage/async-storage/lib/commonjs/index.js"
    ),
    "tamagui": path.resolve(__dirname, "../../node_modules/tamagui"),
    "@tamagui/config": path.resolve(__dirname, "../../node_modules/@tamagui/config"),
    "@tamagui/animations-react-native": path.resolve(
      __dirname,
      "../../node_modules/@tamagui/animations-react-native"
    ),
    "@tamagui/compose-refs": path.resolve(__dirname, "../../node_modules/@tamagui/compose-refs"),
    "@tamagui/constants": path.resolve(__dirname, "../../node_modules/@tamagui/constants"),
    "@tamagui/helpers": path.resolve(__dirname, "../../node_modules/@tamagui/helpers"),
    "@tamagui/use-did-finish-ssr": path.resolve(
      __dirname,
      "../../node_modules/@tamagui/use-did-finish-ssr"
    ),
    "@tamagui/use-event": path.resolve(__dirname, "../../node_modules/@tamagui/use-event"),
    "@tamagui/use-presence": path.resolve(__dirname, "../../node_modules/@tamagui/use-presence"),
    "@tamagui/core": path.resolve(__dirname, "../../node_modules/@tamagui/core"),
    "@tamagui/web": path.resolve(__dirname, "../../node_modules/@tamagui/web")
  }
};

module.exports = config;
