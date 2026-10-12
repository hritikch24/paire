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
      "android/**",
      "ios/**",
      "coverage/**"
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
      "no-undef": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "react-native/no-inline-styles": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      // Runtime Firebase imports must use the CJS builds (see src/services/firebase.ts).
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            "@firebase/app",
            "@firebase/auth",
            "@firebase/firestore",
            "@firebase/functions",
            "@firebase/storage",
            "firebase/app",
            "firebase/auth",
            "firebase/firestore",
            "firebase/functions",
            "firebase/storage"
          ].map((name) => ({
            name,
            allowTypeImports: true,
            message: "Import Firebase from its CJS build path (e.g. @firebase/firestore/dist/index.cjs.js) to avoid duplicate SDK instances."
          }))
        }
      ]
    }
  },
  {
    // Type declarations only map module names to typings.
    files: ["**/*.d.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" }
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
