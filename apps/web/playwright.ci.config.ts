import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// These suites supply API fixtures. The full retained-data release suite is separate.
export default defineConfig({
  ...base,
  testMatch: [
    "account-onboarding.spec.ts", "credential-entry.spec.ts", "ai-visibility.spec.ts",
    "aircraft-showroom-refinement.spec.ts", "assistant-stream.spec.ts",
    "import-validation.spec.ts", "trial-unavailable.spec.ts",
  ],
  workers: 1,
  retries: 0,
  use: { ...base.use, baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "corepack pnpm dev --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
});
