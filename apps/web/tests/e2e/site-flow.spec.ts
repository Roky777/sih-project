import { expect, test } from "@playwright/test";

test.beforeEach(() => test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local synthetic deployment explicitly."));

test("retired entry points keep bookmarks and record context without duplicate navigation", async ({ page }) => {
  await page.goto("/review?aircraft=AC-008");
  await expect(page).toHaveURL(/\/advisories\?.*status=proposed.*aircraft=AC-008/);
  await expect(page.getByRole("heading", { name: "Findings & evidence", exact: true })).toBeVisible();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("proposed");
  await expect(page.locator(".o-grid-table tbody tr").first()).toContainText("AC-008");
  await expect(page.locator(".o-navmenu > summary").filter({ hasText: "Workflow" })).toHaveCount(0);
  await page.goto("/plan?aircraft=AC-008");
  await expect(page).toHaveURL(/\/maintenance\?.*view=work.*aircraft=AC-008/);
  await expect(page.getByRole("heading", { name: "Scheduled work", exact: true })).toBeVisible();
  await page.getByRole("group", { name: "Maintenance views" }).getByRole("button", { name: "Bays & timeline", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bay timeline · next 14 days", exact: true })).toBeVisible();
  await expect(page.locator(".workspace-scope")).toContainText("This view shows the whole fleet");
  await page.getByRole("group", { name: "Maintenance views" }).getByRole("button", { name: "Work register", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recorded work orders", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await page.goto("/parts?aircraft=AC-008");
  await expect(page).toHaveURL(/\/spares\?.*view=requests.*aircraft=AC-008/);
  await expect(page.getByRole("heading", { name: "Parts needed for scheduled work", exact: true })).toBeVisible();
  await page.goto("/status");
  await expect(page).toHaveURL(/\/dashboard#grounded$/);
  await expect(page.getByRole("heading", { name: "Why aircraft are on the ground", exact: true })).toBeVisible();
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("region", { name: "History replay" })).toHaveCount(0);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("component handoffs retain exact scope through findings, work and supply", async ({ page, request }, info) => {
  const response = await request.get("/api/fleet-health/advisories");
  expect(response.ok()).toBe(true);
  const records = await response.json();
  const chosen = records.find((record: { status: string }) => record.status === "accepted");
  expect(chosen).toBeTruthy();
  await page.goto(`/advisories?component=${encodeURIComponent(chosen.component_id)}`);
  const rows = page.locator(".o-grid-table tbody tr");
  await expect(rows).toHaveCount(records.filter((record: { component_id: string; status: string }) => record.component_id === chosen.component_id && ["proposed", "accepted", "scheduled"].includes(record.status)).length);
  await page.getByRole("navigation", { name: "Related workflow steps" }).getByRole("link", { name: "Schedule confirmed findings", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/maintenance\\?component=${chosen.component_id}`));
  await expect(page.getByRole("heading", { name: "Confirmed findings to schedule (1)", exact: true })).toBeVisible();
  await expect(page.locator(".o-finding")).toHaveCount(1);
  await page.getByRole("navigation", { name: "Related workflow steps" }).getByRole("link", { name: "Secure parts for work", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/spares\\?view=requests&component=${chosen.component_id}`));
  await expect(page.locator(".workspace-scope")).toContainText(chosen.component_id);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("scoped-supply-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Show all records", exact: true }).click();
  await expect(page.locator(".workspace-scope")).toHaveCount(0);
});

test("review confirmation updates the canonical queue before scheduling, without changing server records", async ({ page, request }) => {
  const response = await request.get("/api/fleet-health/advisories");
  expect(response.ok()).toBe(true);
  let records = await response.json();
  const chosen = records.find((record: { status: string }) => record.status === "proposed");
  expect(chosen).toBeTruthy();
  let decision: unknown;
  await page.route("**/api/fleet-health/advisories*", route => route.fulfill({ json: records }));
  await page.route(`**/api/fleet-health/advisories/${chosen.id}`, async route => {
    expect(route.request().method()).toBe("PATCH");
    decision = route.request().postDataJSON();
    const updated = { ...chosen, status: "accepted", status_actor: "browser-fixture" };
    records = records.map((record: { id: string }) => record.id === chosen.id ? updated : record);
    await route.fulfill({ json: updated });
  });
  await page.goto(`/advisories?component=${encodeURIComponent(chosen.component_id)}`);
  const row = page.locator(".o-grid-table tbody tr").first();
  await row.getByRole("button", { name: /^Review / }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("button", { name: "Schedule work", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Confirm finding", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Schedule work", exact: true })).toBeVisible();
  expect(decision).toEqual({ status: "accepted", expected_status: "proposed" });
  await page.keyboard.press("Escape");
  await expect(row).toContainText("Confirmed");
  await expect(row.getByRole("button", { name: "SCHEDULE", exact: true })).toBeVisible();
});

test("inventory deep links open the part and research retains its separate planner", async ({ page, request }) => {
  const response = await request.get("/api/fleet-health/inventory");
  expect(response.ok()).toBe(true);
  const [part] = await response.json();
  await page.goto(`/spares?part=${encodeURIComponent(part.part_number)}`);
  await expect(page.getByRole("dialog").getByRole("heading", { name: part.part_number, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/part=/);
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "Engine research workspace", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Calculate a feasible proposal/ }).click();
  await expect(page).toHaveURL(/\/planning$/);
  await expect(page.getByRole("button", { name: "Calculate maintenance schedule", exact: true })).toBeVisible();
  await expect(page.locator(".workspace-research-context")).toContainText("independent of fleet replay");
  await page.locator(".workspace-research-context").getByRole("link", { name: "Return to fleet operations", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
