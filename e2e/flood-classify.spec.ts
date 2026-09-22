import { test, expect } from "@playwright/test";
import { testSites } from "./fixtures/sites";

test("flood-risk: Miami 0.2 PCT zone X is classified moderate", async ({ request }) => {
  const miami = testSites.find((site) => site.slug === "miami");
  expect(miami).toBeDefined();

  const response = await request.get(
    `/api/flood-risk?lat=${miami!.lat}&lng=${miami!.lng}`
  );

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.zoneAtLocation).toBe("X");
  expect(body.isModerateRisk).toBe(true);
  expect(body.isMinimalRisk).toBe(false);
  expect(body.error).toBeUndefined();
});

test.setTimeout(60 * 1000);
