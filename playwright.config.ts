import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * The suite runs against a production build on a dedicated namespace so it
 * cannot touch the teaching data in the local demo namespace.
 */
const PORT = Number(process.env.E2E_PORT ?? 3101);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // One retry: the first request after a cold start can arrive before the
  // server finishes warming its route cache.
  retries: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-report", open: "never" }]],
  outputDir: "artifacts/test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    // /login answers before the E2E namespace has data; health needs an index.
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ENV: "local",
      DATA_NAMESPACE: "aipass-e2e",
      DEMO_CONTROLS_ENABLED: "true",
      AI_MODE: "fixture",
      APP_VERSION: "1.0.0",
    },
  },
});
