import { expect, test } from "@playwright/test";
import { rulText } from "../../src/features/ops/format";
import type { AircraftDetail } from "../../src/features/ops/api";

test("authored fighter replaces the transport and renders each camera view", async ({ page }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  const assets: string[] = [];
  page.on("request", request => { if (request.url().endsWith(".glb")) assets.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aircraft/AC-027"); // a light-combat-aircraft tail in the fleet mix
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.locator(".twin-scene canvas")).toBeVisible();
  await expect(stage.getByText("Loading aircraft model…")).toHaveCount(0);
  await expect(stage.getByText(/3D view unavailable/)).toHaveCount(0);
  await expect(stage.getByText("Tejas-inspired visual · Not engineering-validated", { exact: true })).toHaveCount(0);
  await expect(stage.locator(".twin-caption")).toHaveCount(0);
  await expect(stage.getByText("Tejas-class light fighter · 1:1 visual model")).toBeVisible();
  expect(assets.some(url => url.endsWith("/models/tejas-visual.glb"))).toBe(true);
  expect(assets.some(url => url.endsWith("/models/aircraft.glb"))).toBe(false);
  const response = await page.request.get("/models/tejas-visual.glb");
  expect(response.ok()).toBe(true);
  const bytes = await response.body();
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  const manifest = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  expect(manifest.nodes.some((node: { extras?: { engineeringValidated?: boolean } }) => node.extras?.engineeringValidated === false)).toBe(true);
  expect(manifest.meshes.length).toBeGreaterThan(100);
  for (const name of ["Front view", "Side view", "Top view", "3/4 view"]) {
    await stage.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(950); // Deliberately capture the settled camera, not interpolation.
    await stage.screenshot({ path: info.outputPath(`fighter-${name.replaceAll("/", "-").replaceAll(" ", "-")}.png`) });
  }
  await page.screenshot({ path: info.outputPath("fighter-clean-view.png") });
});

test("dashboard uses the shared glass header without blurring content", async ({ page }, info) => {
  test.setTimeout(60_000);
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the running local deployment explicitly.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Fleet Dashboard", exact: true })).toBeVisible({ timeout: 15_000 });
  const header = page.locator(".o-header");
  await expect(header).toHaveCSS("border-radius", "18px");
  expect(await header.evaluate(element => getComputedStyle(element, "::before").backdropFilter)).toBe("blur(26px) saturate(1.15)");
  await expect(page.locator("main")).toHaveCSS("filter", "none");
  await expect(page.locator(".o-card").first()).toHaveCSS("backdrop-filter", "none");
  await page.screenshot({ path: info.outputPath("dashboard-glass-header.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header).toHaveCSS("border-radius", "16px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// Read-only rehearsal against the explicitly selected running local deployment.
test("live twin statistics match the API and responsive layouts contain the viewport", async ({ page }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the running local deployment explicitly for this read-only capture.");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aircraft/AC-001");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await expect(stage.locator(".twin-scene canvas")).toBeVisible();
  await expect(stage.getByText("Loading aircraft model…")).toHaveCount(0);
  await expect(stage.getByText(/3D view unavailable/)).toHaveCount(0);
  // The showroom shares the workspace canvas beneath the floating glass header.
  const treatment = await stage.evaluate(element => ({
    backdrop: getComputedStyle(element, "::before").filter,
    foreground: getComputedStyle(element).filter,
    canvas: getComputedStyle(element.querySelector(".twin-scene canvas")!).filter,
    text: getComputedStyle(element.querySelector("dl")!).filter,
    radius: getComputedStyle(element).borderRadius,
  }));
  expect(treatment).toEqual({ backdrop: "none", foreground: "none", canvas: "none", text: "none", radius: "0px" });
  await expect(stage).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".o-header")).toHaveCSS("border-radius", "18px");
  expect(await page.locator(".o-header").evaluate(element => getComputedStyle(element, "::before").backdropFilter)).toBe("blur(26px) saturate(1.15)");
  const response = await page.request.get("/api/fleet-health/aircraft/AC-001");
  expect(response.ok()).toBe(true);
  const record: AircraftDetail = await response.json();
  const formatted = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  await expect(stage.getByRole("heading", { level: 1 })).toContainText(record.aircraft.id);
  await expect(stage.locator("dl")).toContainText(formatted(record.aircraft.total_flight_hours));
  await expect(stage.locator("dl")).toContainText(formatted(record.aircraft.total_cycles));
  await expect(page.locator("#twin-system-details")).toContainText(record.systems[0].name);
  const components = record.systems.flatMap(system => system.components);
  const evidence = stage.locator(".twin-evidence");
  await expect(page.getByRole("dialog", { name: "Component condition" })).toHaveCount(0);
  await evidence.getByRole("button", { name: "Component condition" }).click();
  const panel = page.getByRole("dialog", { name: "Component condition" });
  await expect(panel).toContainText(record.aircraft.id);
  await expect(panel.locator(".twin-component")).toHaveCount(components.length);
  for (const card of await panel.locator(".twin-component").all()) {
    const href = await card.getAttribute("href");
    const component = components.find(item => href === `/health/${item.id}`);
    expect(component, "Sidebar component belongs to the selected aircraft").toBeDefined();
    await expect(card).toContainText(component!.name);
    await expect(card).toContainText(formatted(component!.hi));
    await expect(card).toContainText(rulText(component!.rul));
  }
  await panel.getByRole("button", { name: "Close component condition" }).click();
  await expect(evidence.getByRole("button", { name: "Component condition" })).toBeFocused();
  for (const [name, width, height] of [["desktop", 1440, 900], ["laptop", 1366, 768], ["tablet", 900, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    // Camera fitting is interpolated; captures deliberately await its settled pose.
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const label of await stage.locator("dt").all()) {
      await expect(label).toBeVisible();
      expect((await label.boundingBox())!.height, `${name}: statistic labels retain readable height`).toBeGreaterThanOrEqual(12);
    }
    expect(await stage.evaluate(element => {
      const browse = element.querySelector(".twin-browse")!.getBoundingClientRect();
      const views = element.querySelector(".twin-views")!.getBoundingClientRect();
      return browse.right <= views.left || browse.bottom <= views.top;
    }), "Browsing and camera controls do not overlap").toBe(true);
    const separation = await stage.evaluate(element => {
      const stats = element.querySelector(".twin-stats")!.getBoundingClientRect();
      const views = element.querySelector(".twin-views")!.getBoundingClientRect();
      const picker = element.querySelector(".twin-picker")!.getBoundingClientRect();
      const condition = element.querySelector(".twin-condition")!.getBoundingClientRect();
      return { viewsBottom: views.bottom, statsTop: stats.top, pickerBottom: picker.bottom, conditionTop: condition.top };
    });
    expect(separation.viewsBottom, `${name}: camera controls precede statistics`).toBeLessThanOrEqual(separation.statsTop);
    expect(separation.pickerBottom, `${name}: aircraft picker precedes condition`).toBeLessThanOrEqual(separation.conditionTop);
    if (width > 760) {
      expect(await stage.evaluate(element => {
        const views = element.querySelector(".twin-views")!.getBoundingClientRect();
        const toggle = element.querySelector(".twin-evidence-toggle")!.getBoundingClientRect();
        return toggle.top - views.bottom;
      }), `${name}: component toggle is separated from camera controls`).toBeGreaterThanOrEqual(16);
    }
    const stageBounds = await stage.boundingBox();
    const tabsBounds = await page.getByRole("tablist").boundingBox();
    expect(tabsBounds!.y).toBeGreaterThanOrEqual(stageBounds!.y + stageBounds!.height);
    if (width > 1000) {
      const bounds = await stage.evaluate(element => {
        const scene = element.querySelector(".twin-scene")!.getBoundingClientRect();
        const panel = element.querySelector(".twin-views")!.getBoundingClientRect();
        return { separated: scene.right <= panel.left, stageBottom: element.getBoundingClientRect().bottom };
      });
      expect(bounds.separated).toBe(true);
      expect(bounds.stageBottom).toBeLessThanOrEqual(height + 12);
    }
    await page.screenshot({ path: info.outputPath(`twin-live-${name}.png`), fullPage: true });
    if (name === "desktop") await page.screenshot({ path: info.outputPath("twin-clean-view.png") });
  }
  expect(errors).toEqual([]);
});

test("dragging through oblique and overhead views keeps the fighter framed", async ({ page }, info) => {
  test.setTimeout(90_000); // Multiple GPU orbits and screenshot comparisons, not a frame-rate benchmark.
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/aircraft/AC-033");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.locator(".twin-scene canvas")).toBeVisible({ timeout: 20_000 });
  await expect(stage.getByText("Loading aircraft model…")).toHaveCount(0, { timeout: 20_000 });
  for (const [name, width, height] of [["wide", 1680, 950], ["laptop", 1366, 768], ["tablet", 900, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await stage.getByRole("button", { name: "3/4 view", exact: true }).click();
    await page.waitForTimeout(950);
    const box = (await stage.locator(".twin-scene canvas").boundingBox())!;
    for (const [index, dx, dy] of [[0, .25, -.3], [1, -.35, .12], [2, .2, -.25]] as const) {
      await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * (.5 + dx), box.y + box.height * (.5 + dy), { steps: 12 });
      await page.mouse.up();
      await expect(stage.getByRole("button", { name: "3/4 view", exact: true })).toHaveAttribute("aria-pressed", "false");
      await page.waitForTimeout(150);
      await stage.screenshot({ path: info.outputPath(`orbit-${name}-${index}.png`) });
    }
    await stage.getByRole("button", { name: "3/4 view", exact: true }).click();
    await expect(stage.getByRole("button", { name: "3/4 view", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(950);
    await stage.screenshot({ path: info.outputPath(`reset-${name}.png`) });
  }
});

test("component condition supports keyboard, evidence navigation and mobile system exploration", async ({ page }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/aircraft/AC-033");
  const trigger = page.getByRole("button", { name: "Component condition", exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Component condition" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("AC-033");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  const link = panel.locator(".twin-component").first();
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(new RegExp(href! + "$"));
  await expect(page.getByRole("dialog", { name: "Component condition" })).toHaveCount(0);
  await page.goto("/aircraft/AC-033");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: info.outputPath("component-condition-mobile.png") });
  await panel.getByRole("button", { name: "Explore aircraft blueprint" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeInViewport();
});
