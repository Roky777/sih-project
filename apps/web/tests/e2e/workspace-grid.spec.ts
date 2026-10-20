import { expect, test } from "./workspaceTest";

test("workspace grid is shared behind content, sleeps at rest, and survives navigation", async ({ page }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const tracked = window as Window & { gridDraws: number };
    tracked.gridDraws = 0;
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...args: Parameters<typeof stroke>) {
      if (this.canvas.matches(".workspace-flow-grid,.twin-flow-grid")) tracked.gridDraws++;
      return stroke.apply(this, args);
    };
  });
  const draws = () => page.evaluate(() => (window as Window & { gridDraws: number }).gridDraws);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  const grid = page.locator(".workspace-flow-grid");
  await expect(grid).toBeVisible();
  await expect(grid).toHaveCSS("pointer-events", "none");
  await expect(grid).toHaveAttribute("aria-hidden", "true");
  await page.mouse.move(550, 290);
  const count = await draws();
  await page.mouse.move(950, 400);
  await expect.poll(draws).toBeGreaterThan(count);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3000);
  const idle = await draws();
  await page.waitForTimeout(500);
  expect(await draws()).toBe(idle);
  await page.screenshot({ path: info.outputPath("dashboard-grid.png") });
  for (const route of ["/spares", "/maintenance", "/simulator", "/analytics", "/review", "/planning", "/fleet/register", "/welcome", "/aircraft"]) {
    await page.goto(route);
    await expect(grid).toHaveCount(1);
    await expect(grid).toBeVisible();
    await expect(page.locator("main")).toHaveCSS("filter", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/aircraft/AC-033");
  await expect(grid).toHaveCount(0); // No second simultaneous ambient renderer over the aircraft stage.
  await expect(page.locator(".twin-flow-grid")).toHaveCount(1);
  await expect(page.locator(".twin-scene canvas")).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3000);
  const stageIdle = await draws();
  await page.waitForTimeout(500);
  expect(await draws()).toBe(stageIdle);
  await page.locator(".twin-scene").hover();
  await page.locator("#aircraft-workspace").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const offscreen = await draws();
  await page.waitForTimeout(500);
  expect(await draws()).toBe(offscreen);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/spares");
  await expect(grid).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spares & supply", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("spares-grid-mobile.png") });
  expect(await grid.evaluate(element => (element as HTMLCanvasElement).width)).toBeLessThanOrEqual(488);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(grid).toHaveAttribute("data-motion", "static");
  await page.waitForTimeout(100);
  const staticDraws = await draws();
  await page.mouse.move(200, 400);
  await page.waitForTimeout(250);
  expect(await draws()).toBe(staticDraws);
});
