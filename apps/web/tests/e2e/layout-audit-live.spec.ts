import { expect, test } from "@playwright/test";

// Read-only layout checks against the selected local synthetic demonstration.
const routes = ["/dashboard", "/aircraft", "/aircraft/AC-001", "/component-health", "/advisories", "/maintenance", "/spares", "/simulator", "/review", "/plan", "/parts", "/status", "/notifications", "/analytics", "/data", "/welcome", "/fleet/register", "/planning", "/inventory", "/scenarios", "/ai", "/alerts", "/research", "/demo", "/fleet"];

for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  test(`workspace layout audit at ${width}px`, async ({ page, request }, info) => {
    test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    const findings: unknown[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const fleetResponse = await request.get("/api/fleet");
    expect(fleetResponse.ok()).toBe(true);
    const engineFleet = await fleetResponse.json();
    const component = engineFleet.flatMap((aircraft: { component_ids: string[] }) => aircraft.component_ids)[0];
    expect(component).toBeTruthy();
    for (const route of [...routes, `/components/${encodeURIComponent(component)}`]) {
      await page.goto(route);
      await expect(page.locator("main h1").first(), route).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(500); // Let responsive charts and record layout settle.
      const layout = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        const rectangles = (parent: Element) => [...parent.children]
          .filter(child => getComputedStyle(child).position !== "absolute" && getComputedStyle(child).position !== "fixed")
          .map(child => ({ name: child.className, rect: child.getBoundingClientRect() }))
          .filter(item => item.rect.width > 0 && item.rect.height > 4);
        const stacks = [main, ...main.querySelectorAll(".o-screen")].filter(parent => getComputedStyle(parent).display === "flex" && getComputedStyle(parent).flexDirection === "column");
        const gaps = stacks.flatMap(parent => {
          const children = rectangles(parent);
          return children.slice(1).map((child, index) => ({ from: children[index].name, to: child.name, px: Math.round(child.rect.top - children[index].rect.bottom) }));
        });
        const header = document.querySelector(".o-header")!.getBoundingClientRect();
        const tools = document.querySelector(".o-header-tools")!.getBoundingClientRect();
        const overflowElements = [...main.querySelectorAll("*")].filter(element => element.getBoundingClientRect().right > innerWidth && !element.closest(".o-table-wrap, .o-gantt, .o-bayflow-canvas")).slice(0, 8).map(element => ({ tag: element.tagName, class: element.getAttribute("class"), right: Math.round(element.getBoundingClientRect().right) }));
        return { overflow: document.documentElement.scrollWidth - innerWidth, overflowElements, gaps, headerToolsContained: tools.right <= header.right && tools.left >= header.left };
      });
      findings.push({ route, ...layout });
      expect.soft(layout.overflow, `${route}: page overflow ${JSON.stringify(layout.overflowElements)}`).toBeLessThanOrEqual(0);
      expect.soft(layout.headerToolsContained, `${route}: header controls clipped`).toBe(true);
      const minimumGap = route.startsWith("/aircraft/") && width > 760 ? 11 : 15;
      expect.soft(layout.gaps.filter(gap => gap.px < minimumGap), `${route}: touching/overlapping sections`).toEqual([]);
      if (["/dashboard", "/spares", "/maintenance", "/analytics", "/simulator", "/aircraft/AC-001"].includes(route)) {
        await page.screenshot({ path: info.outputPath(`${route.slice(1).replaceAll("/", "-")}-${width}.png`), fullPage: true });
      }
    }
    await info.attach("layout-findings", { body: JSON.stringify(findings, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
  });
}

test("spares sections have consistent spacing at laptop and tablet widths", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  for (const width of [1366, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/spares");
    await expect(page.getByRole("heading", { name: "Spares & supply", exact: true })).toBeVisible();
    await expect(page.locator("main .o-kpis").first()).toBeVisible();
    const metrics = await page.evaluate(() => {
      const kpis = document.querySelector("main .o-kpis")!.getBoundingClientRect();
      const charts = document.querySelector("main .o-grid")!.getBoundingClientRect();
      return { headGap: kpis.top - document.querySelector(".operations-workspace > .o-segmented")!.getBoundingClientRect().bottom, chartGap: charts.top - kpis.bottom, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(metrics.headGap).toBeGreaterThanOrEqual(19);
    expect(metrics.chartGap).toBeGreaterThanOrEqual(19);
    expect(metrics.overflow).toBeLessThanOrEqual(0);
  }
});

test("spares part inspection opens from the keyboard and closes with Escape", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/spares");
  const part = page.getByRole("button", { name: /^Inspect part / }).first();
  await expect(part).toBeVisible();
  const number = await part.textContent();
  await part.focus();
  await expect(part).toBeFocused();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: number!, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
});
