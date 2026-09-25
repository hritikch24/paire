module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["babel-jest", { configFile: "./babel.config.js" }]
  },
  moduleNameMapper: {
    "\\.(png|jpg|jpeg|gif|svg)$": "<rootDir>/__mocks__/fileMock.js",
    "^@firebase/firestore/dist/index.cjs.js$": "<rootDir>/__mocks__/firebaseFirestore.js"
  },
  testMatch: ["**/__tests__/**/*.test.ts?(x)"]
};
