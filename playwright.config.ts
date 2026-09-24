import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // The unit specs run under playwright.unit.config.ts with no browser and no
  // server. Ignoring them here keeps `npm run e2e` from starting one for them.
  testIgnore: ["**/unit/**"],
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
