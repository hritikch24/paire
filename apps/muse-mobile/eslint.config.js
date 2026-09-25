const js = require("@eslint/js");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const reactNative = require("eslint-plugin-react-native");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    ignores: [
      "**/.tamagui/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/android/**/build/**",
      "**/ios/**/build/**"
    ]
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: "readonly"
      }
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-native": reactNative,
      "@typescript-eslint": tsPlugin
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      "no-unused-vars": "off",
      "react/react-in-jsx-scope": "off",
      "react-native/no-inline-styles": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["**/__tests__/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    }
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
