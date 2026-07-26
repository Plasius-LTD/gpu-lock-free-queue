import { defineConfig } from "@playwright/test";
import { CHROMIUM_SWIFTSHADER_ARGS } from "./scripts/swiftshader-qualification.mjs";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      args: CHROMIUM_SWIFTSHADER_ARGS,
    },
  },
});
