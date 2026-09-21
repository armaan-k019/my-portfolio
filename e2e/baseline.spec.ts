import { test, expect, type Page, type Response } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { testSites } from "./fixtures/sites";

const OUT_DIR = path.join(__dirname, "..", "docs", "datum", "baseline");

interface ApiCall {
  url: string;
  status: number;
  durationMs: number;
}

function recordApiResponses(page: Page, calls: ApiCall[]) {
  const startTimes = new WeakMap<object, number>();
  page.on("request", (request) => {
    if (request.url().includes("/api/")) {
      startTimes.set(request, Date.now());
    }
  });
  page.on("response", (response: Response) => {
    const url = response.url();
    if (!url.includes("/api/")) return;
    const request = response.request();
    // Prefer Chromium's own resource timing; it is reliable for these
    // same-origin fetch() calls. Fall back to a wall clock measurement
    // (request seen to response seen) if the browser reports it unavailable.
    let durationMs = -1;
    try {
      const timing = request.timing();
      if (timing.responseEnd >= 0) durationMs = Math.round(timing.responseEnd);
    } catch {
      durationMs = -1;
    }
    if (durationMs < 0) {
      const start = startTimes.get(request);
      durationMs = start ? Date.now() - start : -1;
    }
    calls.push({ url, status: response.status(), durationMs });
  });
}

for (const site of testSites) {
  test(`baseline: ${site.slug}`, async ({ page }) => {
    const apiCalls: ApiCall[] = [];
    recordApiResponses(page, apiCalls);

    await page.goto("/projects/datum");

    const addressInput = page.getByPlaceholder("e.g. 123 Peachtree St NE, Atlanta, GA");
    await addressInput.fill(site.query);
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    // The page has no Escape handler on the address field (verified in
    // src/app/projects/datum/page.tsx), so the suggestion list stays open
    // and can intercept clicks on "Analyze Site" below it. Click a neutral
    // point on the page to blur the field instead; this closes the list via
    // its onBlur handler without picking a suggestion.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);

    const analyzeButton = page.getByRole("button", { name: /Analyze Site/ });

    const clickTime = Date.now();
    await analyzeButton.click();

    // Wait for the loading state to start, then for it to clear (result or error).
    await expect(analyzeButton).toHaveText("Analyzing site…", { timeout: 15_000 }).catch(() => {
      // If the request is fast enough that we miss the loading frame, that's fine;
      // the next wait still holds.
    });
    await expect(analyzeButton).toHaveText("Analyze Site", { timeout: 120_000 });
    const resultsOrErrorTime = Date.now();
    const totalTimeMs = resultsOrErrorTime - clickTime;

    // Settle time for flood, heat, and zoning panels.
    await page.waitForTimeout(20_000);

    const demographicsTab = page.getByRole("button", { name: "Demographics", exact: true });
    const hasResults = await demographicsTab.isVisible().catch(() => false);

    const tabs: { key: string; label: string }[] = [
      { key: "demographics", label: "Demographics" },
      { key: "flood", label: "Flood" },
      { key: "heat", label: "Heat" },
      { key: "zoning", label: "Zoning" },
    ];

    let resultsText = "";

    if (hasResults) {
      for (const tab of tabs) {
        const tabButton = page.getByRole("button", { name: tab.label, exact: true });
        await tabButton.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(OUT_DIR, `${site.slug}-${tab.key}.png`),
          fullPage: true,
        });
      }

      // Grab the dashboard column's text for the record. Demographics tab last active.
      await page.getByRole("button", { name: "Demographics", exact: true }).click();
      await page.waitForTimeout(300);
      resultsText = (await page.locator("body").innerText()).trim();
    } else {
      // Error path: still take four identical screenshots so the file count matches,
      // and record the error text.
      for (const tab of tabs) {
        await page.screenshot({
          path: path.join(OUT_DIR, `${site.slug}-${tab.key}.png`),
          fullPage: true,
        });
      }
      resultsText = (await page.locator("body").innerText()).trim();
    }

    fs.writeFileSync(
      path.join(OUT_DIR, `${site.slug}.text.txt`),
      resultsText,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(OUT_DIR, `${site.slug}.network.json`),
      JSON.stringify({ slug: site.slug, totalTimeMs, calls: apiCalls }, null, 2),
      "utf-8"
    );

    // No hard assertion on success/failure here; Phase 0 records the true state
    // of the current page, including known-broken external dependencies.
    if (apiCalls.length === 0) {
      console.warn(`baseline: ${site.slug} made no /api/ calls (see .text.txt for the error shown)`);
    }
  });
}
