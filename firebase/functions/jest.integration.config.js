module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/integration"],
  testMatch: ["**/*.test.ts"],
  testTimeout: 60000
};
