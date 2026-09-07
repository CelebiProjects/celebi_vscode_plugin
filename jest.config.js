/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/out/",
    "src/test/extension.test.ts",
    "src/test/messagePanel.test.ts",
  ],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { types: ["node", "jest"] } }],
  },
};
