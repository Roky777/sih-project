import { handleWorkspaceEntry } from "./workspaceEntry";
import { expect, test, type Page } from "@playwright/test";
import { AIRFRAME_INFO } from "../../src/features/ops/airframeInfo";

test.beforeEach(async ({ page }) => {
  await handleWorkspaceEntry(page);
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'A quick look around your dashboard' }), async dialog => {
    await dialog.getByRole('button', { name: 'Skip', exact: true }).click();
  });
});

const families = Object.values(AIRFRAME_INFO);
const record = (id: string, family = families[0]) => ({
  aircraft: { id, base: "BASE-A", type: family.fleetType, total_flight_hours: 8000, total_cycles: 4000 },
  as_of: "2026-09-30", replay: false, state: "watch", health_index: 76, availability_state: "available", driver: null,
  advisories: [], tasks: [], work_orders: [], timeline: [], availability_90d: [], systems: [],
});
async function fixture(page: Page) {
  await page.route(url => url.pathname.startsWith("/api/"), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: ": fixture\n\n" });
    const detail = /^\/api\/fleet-health\/aircraft\/(AC-00[1-5])$/.exec(path);
    if (detail) return route.fulfill({ json: record(detail[1], families[Number(detail[1].slice(-1)) - 1]) });
    const data: Record<string, unknown> = {
      "/api/access/session": { id: "fixture-viewer", role: "viewer", authentication: "fixture", csrf_token: null },
      "/api/health/ready": { status: "ready", database: "ok" },
      "/api/assistant/status": { enabled: false, available: false },
      "/api/fleet-health/engine": { ready: true, runs: [] },
      "/api/fleet-health/alerts": [], "/api/fleet-health/advisories": [],
      "/api/fleet-health/aircraft": families.map((family, i) => ({ id: `AC-00${i + 1}`, type: family.fleetType, base: "BASE-A", state: "watch", availability_state: "available", health_index: 76, open_advisories: 0 })),
      "/api/cases": { items: [], total: 0, offset: 0, limit: 25 },
      "/api/fleet-health/work-orders": { as_of: "2026-09-30", recorded: [], planned: [], kpis: {} },
    };
    return route.fulfill({ json: data[path] ?? {} });
  });
}
test.beforeEach(async ({ page }) => { await fixture(page); });
test("restored sideways browsing waits for the next record and retains aligned identity", async ({ page }) => {
  await page.goto("/aircraft/AC-001");
  const viewer = page.locator(".twin-showcase");
  await expect(viewer.locator(".twin-scene canvas")).toBeVisible();
  await page.route("**/api/fleet-health/aircraft/AC-002", async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ json: record("AC-002", families[1]) });
  });
  await viewer.getByRole("button", { name: "Next aircraft" }).click();
  await expect(viewer.getByRole("button", { name: "Next aircraft" })).toBeDisabled();
  await expect(page.locator(".twin-heading h1")).toContainText("AC-001");
  await expect(page).toHaveURL(/AC-002/);
  await expect(page.locator(".twin-heading h1")).toContainText("AC-002");
  await viewer.getByRole("button", { name: "Explore blueprint", exact: true }).click();
  await expect(page).toHaveURL(/tab=visual/);
});
test("failed next-record request retains the current aircraft", async ({ page }) => {
  await page.goto("/aircraft/AC-001");
  await page.route("**/api/fleet-health/aircraft/AC-002", route => route.fulfill({ status: 403, json: { detail: "Fixture access denied" } }));
  await page.getByRole("button", { name: "Next aircraft" }).click();
  await expect(page.locator(".twin-showcase").getByRole("alert")).toContainText("Fixture access denied", { timeout: 20000 });
  await expect(page).toHaveURL(/AC-001/);
  await expect(page.getByRole("button", { name: "Next aircraft" })).toBeEnabled();
});
test("five model families keep clear controls on desktop and mobile with reduced motion", async ({ page }, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (let i = 0; i < families.length; i++) {
      await page.goto(`/aircraft/AC-00${i + 1}`);
      const viewer = page.locator(".twin-showcase");
      await expect(viewer.locator(".twin-scene canvas")).toBeVisible();
      await expect(page.getByText("Loading aircraft model…")).toHaveCount(0, { timeout: 25000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const frame = (await viewer.boundingBox())!;
      const header = (await page.locator(".o-header").boundingBox())!;
      expect(frame.y).toBeGreaterThanOrEqual(-1);
      expect(header.y).toBeGreaterThanOrEqual(frame.y);
      expect(frame.y + frame.height).toBeLessThanOrEqual(901);
      const scene = (await viewer.locator(".twin-scene").boundingBox())!;
      const controls = (await viewer.locator(".twin-views").boundingBox())!;
      const browse = (await viewer.locator(".twin-browse").boundingBox())!;
      expect(controls.x).toBeGreaterThanOrEqual(frame.x);
      expect(controls.x + controls.width).toBeLessThanOrEqual(width + 1);
      expect(browse.x + browse.width).toBeLessThanOrEqual(width + 1);
      expect(scene.width).toBeGreaterThan(0);
      expect(await viewer.locator(".twin-scene").evaluate(el => el.getAnimations().length)).toBe(0);
      await viewer.getByRole("button", { name: "Top view", exact: true }).click();
      await expect(viewer.getByRole("button", { name: "Top view", exact: true })).toHaveAttribute("aria-pressed", "true");
      await viewer.getByRole("button", { name: "3/4 view", exact: true }).click();
      await expect(viewer.getByRole("button", { name: "3/4 view", exact: true })).toHaveAttribute("aria-pressed", "true");
      await viewer.screenshot({ path: info.outputPath(`${families[i].id}-${width}.png`) });
    }
  }
});
