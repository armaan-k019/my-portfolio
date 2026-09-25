import { defineConfig } from "@playwright/test";

// Unit tests for src/lib/datum. No browser, no server: the specs import the
// modules directly and use only `test` and `expect`.
export default defineConfig({
  testDir: "e2e/unit",
  timeout: 30_000,
  retries: 0,
  workers: 4,
});
