import { expect, test, type Page } from "@playwright/test";

const aircraft = (id: string, hours: number) => ({
  aircraft: { id, base: "BASE-A", type: "Generic Twin-Engine Transport (synthetic)", total_flight_hours: hours, total_cycles: hours / 2, inspection_hours_since: 30 },
  as_of: "2026-09-30", replay: false, state: "watch", health_index: 76, availability_state: "available", driver: null,
  advisories: [], tasks: [], work_orders: [], timeline: [], availability_90d: [],
  systems: [{ code: "PROP", name: "Propulsion", state: "watch", health_index: 76, driver: "AC-001-ENGINE", components: [{
    id: `${id}-ENGINE`, name: "Engine 1", state: "watch", hi: 76, risk14: .15, rul: { p10: 12, p50: 25, p90: 40 }, serial: "SYN-ENGINE", criticality: 5,
  }] }],
});
async function fixture(page: Page) {
  await page.route(url => url.pathname.startsWith("/api/"), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: ": fixture\n\n" });
    const data: Record<string, unknown> = {
      "/api/access/session": { id: "fixture-viewer", role: "viewer", authentication: "fixture", csrf_token: null },
      "/api/health/ready": { status: "ready", database: "ok" },
      "/api/fleet-health/engine": { ready: true, runs: [] },
      "/api/fleet-health/alerts": [], "/api/fleet-health/advisories": [],
      "/api/fleet-health/aircraft": ["AC-001", "AC-002"].map(id => ({ id, base: "BASE-A", state: "watch", availability_state: "available", health_index: 76, open_advisories: 0, total_flight_hours: 8000 })),
      "/api/fleet-health/aircraft/AC-001": aircraft("AC-001", 8000),
      "/api/fleet-health/aircraft/AC-002": aircraft("AC-002", 9000),
    };
    return path in data ? route.fulfill({ json: data[path] }) : route.fulfill({ status: 404, json: { detail: "Fixture endpoint unavailable" } });
  });
}
test.beforeEach(async ({ page }) => { await fixture(page); });

test("illustrative model, camera views and animated browsing keep aircraft records aligned", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aircraft/AC-001");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.getByRole("heading", { level: 1 })).toContainText("AC-001");
  await expect(stage.locator("dl")).toContainText("8,000");
  await expect(stage.locator(".twin-scene canvas")).toBeVisible();
  await expect(stage.getByText("Loading aircraft model…")).toHaveCount(0);
  await expect(stage.getByText(/3D view unavailable/)).toHaveCount(0);
  await expect(stage.getByRole("button", { name: "3/4 view", exact: true })).toHaveAttribute("aria-pressed", "true");
  await stage.locator(".twin-scene canvas").evaluate(canvas => canvas.setAttribute("data-test-persistent", "yes"));
  await stage.screenshot({ path: info.outputPath("twin-desktop.png") });
  await stage.getByRole("button", { name: "Top view", exact: true }).click();
  await expect(stage.getByRole("button", { name: "Top view", exact: true })).toHaveAttribute("aria-pressed", "true");
  await stage.getByRole("button", { name: "3/4 view", exact: true }).click();
  await stage.getByRole("button", { name: "Next aircraft", exact: true }).click();
  await expect(stage).toHaveClass(/is-changing/);
  await expect(stage.getByRole("button", { name: "Next aircraft", exact: true })).toBeDisabled();
  await page.waitForTimeout(650); // Deliberate capture of the outgoing top-view/incoming transition pose.
  await stage.screenshot({ path: info.outputPath("twin-transition.png") });
  await expect(page).toHaveURL(/\/aircraft\/AC-002$/);
  await expect(stage).not.toHaveClass(/is-changing/);
  await expect(stage.getByRole("heading", { level: 1 })).toContainText("AC-002");
  await expect(stage.locator(".twin-scene canvas")).toHaveAttribute("data-test-persistent", "yes");
  await expect(stage.locator("dl")).toContainText("9,000");
  await page.getByRole("tab", { name: "Components", exact: true }).click();
  await expect(page.getByRole("link", { name: "View evidence", exact: true })).toHaveAttribute("href", "/health/AC-002-ENGINE");
  await stage.getByRole("button", { name: "Previous aircraft", exact: true }).press("ArrowUp");
  await expect(page).toHaveURL(/\/aircraft\/AC-001$/);
  await stage.locator(".twin-scene canvas").hover();
  await page.mouse.wheel(0, 110);
  await expect(page).toHaveURL(/\/aircraft\/AC-002$/);
  expect(errors).toEqual([]);
});

test("failed or delayed next aircraft never replaces the current record", async ({ page }) => {
  await page.goto("/aircraft/AC-001");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.getByRole("button", { name: "Next aircraft", exact: true })).toBeEnabled();
  await page.route("**/api/fleet-health/aircraft/AC-002", async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ status: 503, json: { detail: "Fixture aircraft unavailable" } });
  });
  await stage.getByRole("button", { name: "Next aircraft", exact: true }).click();
  await expect(stage.getByRole("heading", { level: 1 })).toContainText("AC-001");
  await expect(stage.getByRole("button", { name: "Next aircraft", exact: true })).toBeDisabled();
  await expect(stage.getByRole("alert")).toContainText("Fixture aircraft unavailable");
  await expect(page).toHaveURL(/AC-001$/);
  await expect(stage.locator("dl")).toContainText("8,000");
  await expect(stage.getByRole("button", { name: "Next aircraft", exact: true })).toBeEnabled();
});

test("mobile and reduced motion preserve selection, readable data and details", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/aircraft/AC-001");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.getByRole("button", { name: "Next aircraft", exact: true })).toBeEnabled();
  await page.getByLabel("Select aircraft twin").selectOption("AC-002");
  await expect(page).toHaveURL(/AC-002$/);
  await expect(stage).not.toHaveClass(/is-changing/);
  await expect(stage.locator("dl")).toContainText("9,000");
  await expect(stage.getByText("Loading aircraft model…")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("twin-mobile.png"), fullPage: true });
  await stage.getByRole("button", { name: "Explore blueprint" }).click();
  await expect(page.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeInViewport();
});

test("unavailable model leaves aircraft data and evidence navigation usable", async ({ page }, info) => {
  await page.route("**/models/tejas-visual.glb", route => route.fulfill({ status: 503, body: "Deliberate unavailable-model fixture" }));
  await page.goto("/aircraft/AC-001");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.getByText(/3D view unavailable/)).toBeVisible();
  await expect(stage.locator("dl")).toContainText("8,000");
  await page.getByRole("tab", { name: "Components", exact: true }).click();
  await expect(page.getByRole("link", { name: "View evidence", exact: true })).toHaveAttribute("href", "/health/AC-001-ENGINE");
  await page.screenshot({ path: info.outputPath("twin-fallback.png"), fullPage: true });
});

test("no WebGL preserves the twin's records and failed response identity is rejected", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...options: unknown[]) {
      if (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl") return null;
      return original.call(this, kind as "2d", ...options);
    } as typeof original;
  });
  await page.goto("/aircraft/AC-001");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.getByText(/3D view unavailable/)).toBeVisible();
  await page.route("**/api/fleet-health/aircraft/AC-002", route => route.fulfill({ json: aircraft("AC-999", 99000) }));
  await stage.getByRole("button", { name: "Next aircraft", exact: true }).click();
  await expect(stage.getByRole("alert")).toContainText("does not match your selection");
  await expect(stage.getByRole("heading", { level: 1 })).toContainText("AC-001");
  await expect(stage.locator("dl")).not.toContainText("99,000");
});
