import { expect, test } from "./workspaceTest";

test("AeroCare name and supplied logo appear across operational and report pages", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  for (const route of ["/dashboard", "/aircraft", "/help", "/analysis?view=reports"]) {
    await page.goto(route);
    await expect(page).toHaveTitle(/AeroCare/);
    const logo = page.locator(".o-header-brand img");
    await expect(logo).toHaveAttribute("alt", "AeroCare");
    await expect(logo).toHaveJSProperty("complete", true);
    expect(await logo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.locator("body").innerText()).not.toContain("FleetAvail");
    if (route === "/dashboard") {
      const charts = await page.locator(".fleet-overview .fleet-chart-grid").first().boundingBox();
      const actions = await page.getByRole("region", { name: "Priority actions", exact: true }).boundingBox();
      expect(charts).not.toBeNull();
      expect(actions).not.toBeNull();
      expect(charts!.y + charts!.height).toBeLessThanOrEqual(actions!.y);
      const header = page.locator(".fleet-priority-actions .o-card-head");
      const cases = page.locator(".fleet-priority-actions .overview-action-grid");
      expect((await header.boundingBox())!.y).toBeLessThan((await cases.boundingBox())!.y);
    }
  }
  await expect(page.locator(".report-brand")).toContainText("AeroCare");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".o-header-brand img")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("login uses AeroCare branding and keeps the existing authentication contract", async ({ page }) => {
  await page.route("**/api/access/session", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Authentication required" }) }));
  await page.route("**/api/access/registration", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Sign in to AeroCare" })).toBeVisible();
  await expect(page.locator(".entry-brand").getByRole("img", { name: "AeroCare", exact: true })).toBeVisible();
  await expect(page.getByLabel("Account ID")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});
