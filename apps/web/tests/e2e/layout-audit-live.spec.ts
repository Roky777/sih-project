import { expect, test } from "@playwright/test";

// Read-only layout checks against the selected local synthetic demonstration.
const routes = ["/dashboard", "/aircraft", "/aircraft/AC-001", "/component-health", "/advisories", "/maintenance", "/spares", "/simulator", "/review", "/plan", "/parts", "/status", "/notifications", "/analytics", "/data", "/welcome", "/fleet/register", "/planning", "/inventory", "/scenarios", "/ai", "/alerts", "/research", "/demo", "/fleet", "/settings", "/account", "/help", "/analysis?view=study", "/analysis?view=models", "/maintenance?view=work", "/maintenance?view=bays", "/maintenance?view=cases", "/spares?view=inventory", "/spares?view=deliveries", "/analysis?view=reports", "/aircraft/AC-001?tab=components", "/aircraft/AC-001?tab=maintenance", "/aircraft/AC-001?tab=history", "/aircraft/AC-001?tab=visual"];

for (const theme of ["light", "dark"] as const) for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  test(`workspace layout audit at ${width}px in ${theme}`, async ({ page, request }, info) => {
    test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
    test.setTimeout(180_000);
    await page.addInitScript(value => localStorage.setItem("ops:theme", value), theme);
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
    const registrations = await (await request.get("/api/aircraft-registry")).json();
    const registered = registrations.items[0]?.id;
    const caseRows = await (await request.get("/api/cases?dataset=operational&limit=1")).json();
    const extra = [registered && `/aircraft/registered/${registered}`, caseRows.items[0]?.id && `/cases/${caseRows.items[0].id}`].filter((value): value is string => Boolean(value));
    for (const route of [...routes, ...extra, `/components/${encodeURIComponent(component)}`]) {
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
        await page.screenshot({ path: info.outputPath(`${route.slice(1).replaceAll("/", "-")}-${width}-${theme}.png`), fullPage: true });
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
    await page.goto("/spares?view=inventory");
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
  await page.goto("/spares?view=inventory");
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
