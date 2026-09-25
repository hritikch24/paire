module.exports = function (api) {
  const isTest = api.env("test");
  api.cache.using(() => isTest);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      !isTest && [
        "@tamagui/babel-plugin",
        {
          config: "./tamagui.config.ts",
          components: ["tamagui"],
          logTimings: false
        }
      ],
      !isTest && "react-native-reanimated/plugin"
    ].filter(Boolean)
  };
};
