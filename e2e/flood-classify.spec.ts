import { test, expect } from "@playwright/test";
import { testSites } from "./fixtures/sites";
import { classifyZone } from "../src/app/api/flood-risk/route";

test("flood-risk: classifyZone marks a 0.2 PCT zone X as moderate (fixture)", () => {
  // this fixture is constructed from the Miami values verified by direct FEMA request on 2026-09-21
  // and recorded in docs/datum/SPEC.md section 5 (FLD_ZONE "X", ZONE_SUBTY "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", SFHA_TF "F")
  // it is not a live capture
  const miamiResult = classifyZone("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", false);
  expect(miamiResult.isModerateRisk).toBe(true);
  expect(miamiResult.isMinimalRisk).toBe(false);
  expect(miamiResult.isHighRisk).toBe(false);

  // Atlanta verified values
  const atlantaResult = classifyZone("X", "AREA OF MINIMAL FLOOD HAZARD", false);
  expect(atlantaResult.isMinimalRisk).toBe(true);
  expect(atlantaResult.isModerateRisk).toBe(false);

  // SFHA zone
  const sfhaResult = classifyZone("AE", "", true);
  expect(sfhaResult.isHighRisk).toBe(true);
});

test("flood-risk: live FEMA Miami point is classified moderate", async ({ request }) => {
  test.skip(process.env.DATUM_LIVE_FEMA !== "1", "set DATUM_LIVE_FEMA=1 to run against the live FEMA service");
  test.setTimeout(60 * 1000);

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
