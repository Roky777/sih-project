import { expect, test, type Page } from "@playwright/test";

test("live blueprint matches selected component records and opens 3D structures from drawn assemblies and the register", async ({ page, request }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Read-only live deployment selected explicitly.");
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await request.get("/api/fleet-health/aircraft/AC-033"); expect(response.ok()).toBe(true);
  const data = await response.json();
  await page.goto("/aircraft/AC-033");
  const bp = page.getByRole("region", { name: "Aircraft component blueprint" });
  await expect(bp.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeVisible();
  const stage = await page.getByRole("region", { name: "Aircraft digital twin showcase" }).boundingBox(), bounds = await bp.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(stage!.y + stage!.height);
  const items = data.systems.flatMap((system: { components: { id: string; name: string; state: string }[] }) => system.components);
  await expect(bp.locator(".bp-register-item")).toHaveCount(items.length);
  for (const item of items) {
    const finding = ["watch", "degraded", "critical", "failed"].includes(item.state) || (item.state !== "under_maintenance" && data.advisories.some((a: { component_id: string; status: string }) => a.component_id === item.id && !["completed", "dismissed"].includes(a.status)));
    await expect(bp.locator(`.bp-register-item[data-component-id="${item.id}"]`)).toHaveAttribute("data-attention", String(finding));
    await expect(bp.locator(`.bp-assembly[data-component-id="${item.id}"]`)).toHaveAttribute("data-attention", String(finding));
  }
  await bp.scrollIntoViewIfNeeded(); await bp.screenshot({ path: info.outputPath("blueprint-desktop.png") });
  await page.setViewportSize({ width: 2560, height: 1440 });
  const header = await page.locator(".o-header").boundingBox();
  const inspection = await page.locator(".aircraft-detail-workspace").boundingBox();
  expect(Math.abs(header!.x - inspection!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(header!.x + header!.width - inspection!.x - inspection!.width)).toBeLessThanOrEqual(1);
  await bp.screenshot({ path: info.outputPath("blueprint-wide.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await bp.getByRole("button", { name: "Inspect Turbine: Failed", exact: true }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "Turbine", exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.getByText("AC-033", { exact: false }).first()).toBeVisible();
  await expect(dialog.locator(".bp-part-evidence")).toContainText(String(Math.round(items.find((item: { type: string }) => item.type === "ENG-TRB").hi)));
  await expect(dialog.getByRole("link", { name: "Open condition evidence" })).toHaveAttribute("href", "/health/AC-033-ENG-TRB");
  await expect(dialog.locator("canvas")).toBeVisible(); await page.waitForTimeout(500);
  await dialog.screenshot({ path: info.outputPath("turbine-assembled.png") });
  await dialog.getByRole("button", { name: "Exploded", exact: true }).click(); await expect(dialog.getByRole("button", { name: "Exploded", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(300); await dialog.screenshot({ path: info.outputPath("turbine-exploded.png") });
  const partCanvas = await dialog.locator("canvas").boundingBox();
  await page.mouse.move(partCanvas!.x + partCanvas!.width * .5, partCanvas!.y + partCanvas!.height * .5); await page.mouse.down();
  await page.mouse.move(partCanvas!.x + partCanvas!.width * .7, partCanvas!.y + partCanvas!.height * .6, { steps: 10 }); await page.mouse.up();
  await dialog.getByRole("button", { name: "Wireframe", exact: true }).click(); await expect(dialog.getByRole("button", { name: "Wireframe", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Reset component camera" }).click(); await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(bp.locator('.bp-register-item[data-component-id="AC-033-ENG-TRB"]')).toBeFocused();
  await bp.getByRole("button", { name: "Findings only" }).click();
  await expect(bp.locator('.bp-register-item[data-attention="false"]')).toHaveCount(0);
  await bp.getByRole("button", { name: "3D architecture" }).click(); await expect(bp.locator("canvas")).toBeVisible();
  await expect(bp.locator(".bp-spatial-target")).toHaveCount(0);
  for (const name of ["Top-down", "Side view", "Front view", "3/4 view"]) {
    await bp.getByRole("button", { name, exact: true }).click();
    await expect(bp.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await page.waitForTimeout(400); await bp.screenshot({ path: info.outputPath("blueprint-spatial.png") });
  await bp.locator('.bp-register-item[data-component-id="AC-033-ENG-TRB"]').click(); await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "Open condition evidence" }).click(); await expect(page).toHaveURL(/\/health\/AC-033-ENG-TRB/);
  expect(errors).toEqual([]);
});

const detail = (id: string) => ({
  aircraft: { id, base: "BASE-A", total_flight_hours: 8000, total_cycles: 4000 }, as_of: "2026-09-30", replay: false, state: "failed", health_index: 78, availability_state: "available", driver: null,
  advisories: [], tasks: [], work_orders: [], timeline: [], availability_90d: [],
  systems: [{ code: "PROP", name: "Synthetic propulsion", state: "failed", health_index: 78, driver: null, components: [
    { id: `${id}-T`, aircraft: id, type: "ENG-TRB", name: "Turbine", state: "failed", hi: 35, risk14: .8, rul: { p10: 0, p50: 4, p90: 30 }, serial: "SYN-TURBINE", criticality: 5 },
    { id: `${id}-M`, aircraft: id, type: "LG-STR", name: "Shock strut", state: "under_maintenance", hi: 70, risk14: .1, rul: { p10: 20, p50: 30, p90: 50 }, serial: "SYN-STRUT", criticality: 3 },
    { id: `${id}-X`, aircraft: id, type: "UNKNOWN", name: "Unmapped component", state: "watch", hi: 75, risk14: .1, rul: { p10: 20, p50: 30, p90: 50 }, serial: "SYN-UNMAPPED", criticality: 2 },
  ] }],
});
async function fixtures(page: Page) {
  await page.route(url => url.pathname.startsWith("/api/"), route => {
    const path = new URL(route.request().url()).pathname;
    const records: Record<string, unknown> = {
      "/api/access/session": { id: "fixture-viewer", role: "viewer", authentication: "fixture", csrf_token: null },
      "/api/health/ready": { status: "ready", database: "ok" }, "/api/fleet-health/engine": { ready: true, runs: [] },
      "/api/fleet-health/alerts": [], "/api/fleet-health/advisories": [],
      "/api/fleet-health/aircraft": ["AC-001", "AC-002"].map(id => ({ id, base: "BASE-A", state: "failed", availability_state: "available", health_index: 78, open_advisories: 0, total_flight_hours: 8000 })),
      "/api/fleet-health/aircraft/AC-001": detail("AC-001"), "/api/fleet-health/aircraft/AC-002": detail("AC-002"),
    };
    return path in records ? route.fulfill({ json: records[path] }) : route.fulfill({ status: 404, json: { detail: "Labelled fixture endpoint unavailable" } });
  });
}
test("mobile blueprint supports unknown types, maintenance separation, keyboard selection and aircraft reconciliation", async ({ page }, info) => {
  await fixtures(page); await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/aircraft/AC-001"); const bp = page.getByRole("region", { name: "Aircraft component blueprint" });
  await expect(bp.locator(".bp-register-item")).toHaveCount(3); await expect(bp.locator(".bp-assembly")).toHaveCount(2);
  expect(await bp.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(bp.locator('.bp-register-item[data-component-id="AC-001-M"]')).toHaveAttribute("data-attention", "false");
  const unmapped = bp.getByRole("button", { name: /Unmapped component/ }); await unmapped.press("Enter");
  const unknownDialog = page.getByRole("dialog", { name: "Unmapped component", exact: true });
  await expect(unknownDialog.getByText(/structure model is not available/)).toBeVisible();
  await unknownDialog.getByRole("button", { name: "Close component inspection" }).click(); await expect(unmapped).toBeFocused();
  await bp.getByRole("button", { name: /Turbine.*Failed/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Turbine", exact: true }); await expect(dialog.locator("canvas")).toBeVisible();
  await dialog.getByRole("button", { name: "Exploded", exact: true }).click(); await page.waitForTimeout(300); await dialog.screenshot({ path: info.outputPath("blueprint-inspection-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape"); await bp.scrollIntoViewIfNeeded(); await bp.screenshot({ path: info.outputPath("blueprint-mobile.png") });
  await page.getByLabel("Select aircraft twin").selectOption("AC-002"); await expect(page).toHaveURL(/AC-002$/);
  await expect(bp.locator('.bp-register-item[data-component-id^="AC-001"]')).toHaveCount(0);
  await bp.getByRole("button", { name: /Turbine.*Failed/ }).first().click(); await expect(page.getByRole("dialog")).toContainText("AC-002");
  await page.getByRole("dialog").getByRole("link", { name: "Open condition evidence" }).click(); await expect(page).toHaveURL(/\/health\/AC-002-T/);
});
test("no WebGL retains blueprint, selected condition and evidence", async ({ page }) => {
  await fixtures(page); await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...options: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(kind)) return null;
      return original.call(this, kind as "2d", ...options);
    } as typeof original;
  });
  await page.goto("/aircraft/AC-001"); const bp = page.getByRole("region", { name: "Aircraft component blueprint" });
  await bp.getByRole("button", { name: "Inspect Turbine: Failed" }).click();
  const dialog = page.getByRole("dialog", { name: "Turbine", exact: true });
  await expect(dialog.getByText(/3D view unavailable/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Open condition evidence" })).toHaveAttribute("href", "/health/AC-001-T");
  await expect(dialog.locator(".bp-part-evidence")).toContainText("35");
  await page.keyboard.press("Escape"); await expect(bp.locator("svg[role=group]")).toBeVisible();
});

test("empty records stay unavailable rather than becoming a healthy blueprint", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/fleet-health/aircraft/AC-001", route => route.fulfill({ json: { ...detail("AC-001"), systems: [] } }));
  await page.goto("/aircraft/AC-001"); const bp = page.getByRole("region", { name: "Aircraft component blueprint" });
  await expect(bp.getByText("Component records unavailable", { exact: true })).toBeVisible();
  await expect(bp.locator(".bp-register-item,.bp-assembly")).toHaveCount(0);
  await expect(bp.getByText("No condition findings", { exact: true })).toHaveCount(0);
});

test("aircraft inspection sections share one workspace and keep the showroom and evidence connected", async ({ page }, info) => {
  await fixtures(page); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aircraft/AC-001");
  const workspace = page.getByRole("region", { name: "Aircraft inspection workspace" });
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(workspace.getByRole("heading", { name: "Inspection workspace", exact: true })).toBeVisible();
  await expect(workspace.locator(".aircraft-workspace-head")).toContainText("AC-001");
  await expect(page.getByRole("heading", { name: "System map", exact: true })).toHaveCount(0);
  await workspace.getByRole("tab", { name: "Components", exact: true }).click();
  await expect(workspace.getByRole("tabpanel", { name: "Component records" })).toBeVisible();
  await expect(workspace.getByRole("link", { name: "View evidence" }).first()).toHaveAttribute("href", "/health/AC-001-T");
  const system = workspace.getByRole("button", { name: /Synthetic propulsion/ });
  await system.press("Enter"); await expect(system).toHaveAttribute("aria-expanded", "false");
  await system.press("Enter"); await expect(system).toHaveAttribute("aria-expanded", "true");
  await workspace.screenshot({ path: info.outputPath("integrated-components.png") });
  await workspace.getByRole("tab", { name: "History", exact: true }).click();
  await expect(workspace.getByText("No timeline events recorded in this snapshot.")).toBeVisible();
  await expect(stage.getByRole("heading", { level: 1 })).toContainText("AC-001");
  await workspace.getByRole("tab", { name: "Advisories (0)", exact: true }).click();
  await expect(workspace.getByText("No advisories for this aircraft", { exact: true })).toBeVisible();
  await stage.getByRole("button", { name: "Explore blueprint", exact: true }).click();
  await expect(workspace.getByRole("tab", { name: "Blueprint", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(workspace.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeInViewport();
  await workspace.screenshot({ path: info.outputPath("integrated-blueprint.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace.getByRole("tab", { name: "Components", exact: true }).click();
  expect(await workspace.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(workspace.getByRole("tab", { name: "Advisories (0)", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await workspace.screenshot({ path: info.outputPath("integrated-components-mobile.png") });
});
