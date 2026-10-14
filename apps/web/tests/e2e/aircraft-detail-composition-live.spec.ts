import { expect, test } from "@playwright/test";
import { airframeInfo } from "../../src/features/ops/airframeInfo";

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("failed aircraft exposes recorded agency work separately from zero findings", async ({ page }) => {
  await page.goto("/aircraft/AC-014");
  const status = page.getByRole("region", { name: "Operational status summary" });
  await expect(status).toContainText("Awaiting agency");
  await expect(status).toContainText("Turbine");
  await expect(status).toContainText("agency queue");
  await expect(status).toContainText("AG-DEPOT");
  await expect(status).toContainText("Not established");
  await expect(status.getByRole("link", { name: "View maintenance work" })).toHaveAttribute("href", "/maintenance/work/WO-01097");
  await expect(page.getByRole("region", { name: "Findings summary" })).toContainText("No open findings");
  await expect(page.getByRole("region", { name: "Maintenance summary" })).toContainText("WO-01097");
  const stats = page.getByRole("region", { name: "Aircraft statistics" });
  await expect(stats).toContainText("7,723 h");
  await expect(stats).toContainText("94 / 100");
  await expect(stats.locator("abbr")).toHaveAttribute("title", /not an aircraft clearance/);
  await page.getByRole("tab", { name: "Maintenance", exact: true }).click();
  await expect(page.getByRole("link", { name: "WO-01097", exact: true })).toBeVisible();
});

test("record switching clears selected case and component and disables boundary navigation", async ({ page }) => {
  await page.goto("/aircraft/AC-001?tab=summary&case=previous-case&component=previous-component");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.getByRole("button", { name: "Previous aircraft" })).toBeDisabled();
  await stage.getByRole("button", { name: "Component condition", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Component condition" })).toContainText("AC-001");
  await page.keyboard.press("Escape");
  await stage.getByRole("button", { name: "Next aircraft" }).click();
  await expect(page).toHaveURL(/aircraft\/AC-002\?tab=summary$/);
  await expect(page.locator(".aircraft-record-identity h1")).toContainText("AC-002");
  await expect(stage).toContainText("Aircraft 2 of 40");
  await stage.getByRole("button", { name: "Component condition", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Component condition" });
  await expect(drawer).toContainText("AC-002");
  for (const link of await drawer.locator(".twin-component").all()) await expect(link).toHaveAttribute("href", /^\/health\/AC-002-/);
  await page.keyboard.press("Escape");
  await page.goto("/aircraft/AC-040");
  await expect(stage.getByRole("button", { name: "Next aircraft" })).toBeDisabled();
});

test("inspection selection survives reload and only its selected 3D viewer mounts", async ({ page }) => {
  await page.goto("/aircraft/AC-014");
  await expect(page.locator(".twin-scene canvas")).toBeVisible();
  await page.getByRole("button", { name: "Open visual inspection" }).click();
  await expect(page).toHaveURL(/tab=visual/);
  await expect(page.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeVisible();
  await expect(page.locator(".twin-scene canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Aircraft model", exact: true }).click();
  await expect(page.locator(".twin-scene canvas")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".aircraft-viewer-large")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeVisible();
  await expect(page.locator(".twin-scene canvas")).toHaveCount(0);
});

test("model failure is local and retains operational records", async ({ page }) => {
  await page.route("**/*.glb", route => route.abort());
  await page.goto("/aircraft/AC-014");
  await expect(page.getByText(/3D view unavailable/)).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole("region", { name: "Operational status summary" })).toContainText("WO-01097");
  await expect(page.getByRole("region", { name: "Aircraft statistics" })).toContainText("7,723");
  await page.getByRole("tab", { name: "Components", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System and component records" })).toBeVisible();
});

test("all five families fit contained controls at requested viewport sizes", async ({ page, request }, info) => {
  test.setTimeout(180000);
  const response = await request.get("/api/fleet-health/aircraft");
  const rows = await response.json() as { id: string; type: string }[];
  const families = [...new Map(rows.map(row => [airframeInfo(row).id, row])).values()];
  expect(families).toHaveLength(5);
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const row of families) {
      await page.goto(`/aircraft/${row.id}`);
      const viewer = page.getByRole("region", { name: "Aircraft digital twin showcase" });
      await expect(viewer.locator(".twin-scene canvas")).toBeVisible();
      await expect(page.getByText("Loading aircraft model…")).toHaveCount(0, { timeout: 25000 });
      await expect(page.getByText(/3D view unavailable/)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const scene = (await viewer.locator(".twin-scene").boundingBox())!;
      const controls = (await viewer.locator(".aircraft-camera-controls").boundingBox())!;
      const browse = (await viewer.locator(".twin-browse").boundingBox())!;
      expect(controls.y + controls.height).toBeLessThanOrEqual(scene.y);
      expect(scene.y + scene.height).toBeLessThanOrEqual(browse.y);
      const viewerHeight = (await viewer.boundingBox())!.height;
      expect(viewerHeight).toBeGreaterThanOrEqual(width > 760 ? 560 : 450);
      expect(viewerHeight).toBeLessThanOrEqual(width > 760 ? 820 : 600);
      for (const name of ["Front", "3/4", "Side", "Top"]) {
        await viewer.getByRole("button", { name, exact: true }).click();
        await page.waitForTimeout(120);
        await viewer.screenshot({ path: info.outputPath(`${airframeInfo(row).id}-${width}-${name.replace("/", "-")}.png`) });
      }
      await viewer.getByRole("button", { name: "Reset aircraft camera" }).click();
      await expect(viewer.getByRole("button", { name: "3/4", exact: true })).toHaveAttribute("aria-pressed", "true");
    }
  }
});

test("unrelated aircraft work is excluded and missing status details remain explicit", async ({ page }) => {
  await page.route("**/api/fleet-health/work-orders", route => route.fulfill({ json: {
    as_of: "2026-09-30", recorded: [{ id: "WO-OTHER", aircraft: "AC-005", status: "open", finding: "Unrelated failure", agency_id: "AG-OTHER" }], planned: [], kpis: {},
  } }));
  await page.route("**/api/cases?**", route => route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 25 } }));
  await page.goto("/aircraft/AC-014");
  const status = page.getByRole("region", { name: "Operational status summary" });
  await expect(status).toContainText("Not recorded");
  await expect(status).toContainText("Not established");
  await expect(status).not.toContainText("WO-OTHER");
  await expect(status).not.toContainText("AG-OTHER");
  await expect(page.getByRole("region", { name: "Maintenance summary" })).not.toContainText("Unrelated failure");
});

test("replay summary excludes later work and present-day planning context", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/fleet-health/aircraft/AC-014?as_of=2026-07-28")).json();
  expect(snapshot.work_orders.every((work: { completed: string | null }) => !work.completed || work.completed <= snapshot.as_of)).toBe(true);
  await page.goto("/aircraft/AC-014?as_of=2026-07-28");
  await expect(page.locator(".aircraft-record-identity")).toContainText("Historical snapshot");
  const status = page.getByRole("region", { name: "Operational status summary" });
  await expect(status).not.toContainText("WO-01097");
  const maintenance = page.getByRole("region", { name: "Maintenance summary" });
  await expect(maintenance).toContainText("current proposals, cases and mandatory-task deadlines are not loaded");
  await expect(maintenance).not.toContainText("WO-01097");
});

test("aircraft maintenance presents a case once and separates future requirements from active work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aircraft/AC-018?tab=maintenance");
  const maintenance = page.getByRole("region", { name: "Maintenance for AC-018" });
  await expect(maintenance).toBeVisible();
  await expect(maintenance.getByRole("region", { name: "Active maintenance work" })).toContainText("No active work recorded");
  const reviews = maintenance.getByRole("region", { name: "Findings and decisions" });
  await expect(reviews.getByText("Main hydraulic pump", { exact: true })).toHaveCount(1);
  await expect(reviews.getByRole("link", { name: "Review evidence" })).toHaveAttribute("href", /^\/cases\//);
  await expect(maintenance.getByRole("region", { name: "Mandatory requirements" })).toContainText("Periodic inspection");
  await expect(maintenance.locator(".case-queue,.o-adv-card")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(reviews.getByRole("link", { name: "Review evidence" })).toBeVisible();
});
