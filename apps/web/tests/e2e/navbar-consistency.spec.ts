import { expect, test } from "@playwright/test";

const routes = ["/dashboard", "/aircraft", "/aircraft/AC-033", "/component-health", "/advisories", "/maintenance", "/spares", "/simulator", "/review", "/plan", "/parts", "/status", "/notifications", "/analytics", "/data", "/welcome", "/fleet/register", "/planning", "/inventory", "/scenarios", "/ai", "/alerts", "/research", "/demo", "/fleet"];

for (const width of [1440, 390]) test(`shared navigation remains consistent on all workspace routes at ${width}px`, async ({ page }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  test.setTimeout(120_000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let expected: unknown;
  let destinations: string[] | undefined;
  for (const route of routes) {
    await page.goto(route);
    const header = page.locator(".o-header");
    await expect(header).toBeVisible();
    await expect(page.locator(".workspace-flow-grid,.twin-flow-grid"), route).toHaveCount(1);
    const signature = await header.evaluate(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      const tools = element.querySelector(".o-header-tools")!.getBoundingClientRect();
      return { height: style.height, top: style.top, margin: style.margin, padding: style.padding, radius: style.borderRadius,
        glass: getComputedStyle(element, "::before").backdropFilter,
        toolsContained: tools.left >= box.left && tools.right <= box.right,
        links: [...element.querySelectorAll(".o-topnav a")].map(link => link.getAttribute("href")),
        menus: [...element.querySelectorAll(".o-navmenu > summary")].map(item => item.childNodes[0].textContent),
        tools: [...element.querySelectorAll(".o-header-tools button,.o-profile > summary")].map(item => item.getAttribute("aria-label")?.replace(/\d+/g, "#")) };
    });
    expected ??= signature;
    expect(signature, route).toEqual(expected);
    expect(signature.toolsContained, route).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    if (width < 760) {
      const trigger = header.getByRole("button", { name: "Open navigation", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
      const links = await dialog.locator("nav a").evaluateAll(items => items.map(item => item.getAttribute("href")!));
      destinations ??= links;
      expect(links, route).toEqual(destinations);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
    if (["/dashboard", "/aircraft/AC-033", "/fleet/register"].includes(route)) await header.screenshot({ path: info.outputPath(`navbar-${route.replaceAll("/", "-")}-${width}.png`) });
  }
  if (width > 760) {
    await page.locator(".o-navmenu > summary").filter({ hasText: "Research" }).click();
    await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "Constraint planner", exact: true }).click();
    await expect(page).toHaveURL(/\/planning$/);
    await expect(page.locator(".o-navmenu[open]")).toHaveCount(0);
  } else {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("dialog", { name: "Workspace navigation" }).getByRole("link", { name: "Constraint planner", exact: true }).click();
    await expect(page).toHaveURL(/\/planning$/);
    await expect(page.getByRole("dialog", { name: "Workspace navigation" })).toHaveCount(0);
  }
});
