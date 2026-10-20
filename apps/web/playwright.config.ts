import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "./tests/e2e",
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.FLEET_E2E_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    channel: "chrome",
  },
  webServer: process.env.FLEET_E2E_BASE_URL ? undefined : {
    command: "corepack pnpm dev --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
