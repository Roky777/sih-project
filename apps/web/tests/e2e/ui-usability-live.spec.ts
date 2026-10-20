import { expect, test } from "./workspaceTest";

test("appearance controls stay in sync, persist and preserve unsaved capacity edits", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.route("**/api/workspace/capacity", route => route.fulfill({ json: [{ id: "ui-check", crew_capacity: 2, bay_capacity: 1, capabilities: ["PRP-TUR"], version: 1, provenance: "Presentation test fixture" }] }));
  await page.goto("/settings");
  await page.getByLabel("Reason for change").fill("Keep this unsaved edit");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  await expect(page.getByLabel("Reason for change")).toHaveValue("Keep this unsaved edit");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Reason for change")).toHaveValue("Keep this unsaved edit");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const peer = await page.context().newPage();
  await peer.goto("/settings");
  await expect(peer.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(peer.locator("html")).toHaveAttribute("data-theme", "light");
  await peer.close();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("account and notifications menus close from the keyboard and settings stays reachable", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/dashboard");
  const profile = page.locator(".o-profile > summary");
  await profile.click();
  await expect(page.locator(".o-profile").getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(profile).toBeFocused();
  await expect(page.locator(".o-profile")).not.toHaveAttribute("open", "");
  const notices = page.getByRole("button", { name: /^Notifications/ });
  await notices.click();
  await expect(notices).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(notices).toBeFocused();
  await expect(notices).toHaveAttribute("aria-expanded", "false");
});

test("overview health panel shares its row with priority actions and cells open the selected aircraft", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  const health = page.getByRole("region", { name: "Aircraft × system health", exact: true });
  const actions = page.getByRole("region", { name: "Priority actions", exact: true });
  await expect(health.locator(".o-matrix-cell").first()).toBeVisible();
  const hb = (await health.boundingBox())!, ab = (await actions.boundingBox())!;
  expect(Math.abs(hb.y - ab.y)).toBeLessThan(2);
  expect(hb.x + hb.width).toBeLessThan(ab.x);
  const matrix = (await health.locator(".o-matrix").boundingBox())!;
  expect(matrix.width).toBeGreaterThan(hb.width * .8);
  const cell = health.locator(".o-matrix-cell").first();
  const aircraft = (await cell.getAttribute("aria-label"))!.split(" ")[0];
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/aircraft/${aircraft}\\?system=`));
  await expect(page.getByRole("tabpanel", { name: "Component records", exact: true })).toBeVisible();
});

test("mandatory case offers planning without an invalid predictive-review form", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/maintenance?view=cases");
  const response = await page.request.get("/api/cases?dataset=operational&limit=100");
  expect(response.ok()).toBe(true);
  const data = await response.json() as { items: { id: string; state: string; links: { kind: string }[] }[] };
  const record = data.items.find(item => item.state === "needs_planning" && item.links.some(link => link.kind === "mandatory_task"));
  expect(record).toBeDefined();
  await page.goto(`/cases/${record!.id}`);
  await expect(page.getByRole("heading", { name: "Mandatory requirement" })).toBeVisible();
  await expect(page.getByLabel("Decision", { exact: true })).toHaveCount(0);
  await page.locator(".case-context nav").getByRole("link", { name: "Prepare mandatory maintenance plan", exact: true }).click();
  await expect(page).toHaveURL(/#case-planning$/);
  await expect(page.getByRole("heading", { name: "Planning and approval", exact: true })).toBeInViewport();
});

test("research spatial selection preserves its dataset and selected aircraft route", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/aircraft?dataset=research&view=visual");
  await expect(page.locator(".aircraft-choice").nth(1)).toBeVisible();
  await page.locator(".aircraft-choice").nth(1).click();
  await expect(page).toHaveURL(/dataset=research/);
  const selected = new URL(page.url()).searchParams.get("aircraft");
  expect(selected).toBeTruthy();
  const response = await page.request.get("/api/fleet");
  const rows = await response.json() as { id: string }[];
  await page.goto(`/aircraft/${rows[0].id}?dataset=research&tab=visual`);
  await expect(page.locator("main h1")).toHaveCount(1);
  await page.locator(".aircraft-choice").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/aircraft/${rows[1].id}\\?`));
  await expect(page).toHaveURL(/dataset=research/);
  await expect(page).toHaveURL(/tab=visual/);
});

test("model failure retains the matching preview, records and blueprint action", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.route("**/models/helicopter-visual.glb", route => route.fulfill({ status: 404, body: "Unavailable test asset" }));
  await page.goto("/aircraft/AC-018");
  await expect(page.getByText(/3D view unavailable/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("img", { name: "Utility helicopter illustrative preview" })).toBeVisible();
  await expect(page.locator(".aircraft-record-identity h1")).toContainText("AC-018");
  await page.getByRole("button", { name: "Open visual inspection", exact: true }).click();
  await expect(page).toHaveURL(/tab=visual/);
  await expect(page.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeVisible();
});

test("demonstration role choices update restricted controls consistently", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/account");
  await page.getByRole("combobox", { name: "Current role", exact: true }).selectOption("logistics");
  await page.getByRole("button",{name:"Logistics team",exact:false}).click();
  await page.getByRole("button",{name:"Select workspace",exact:true}).click();
  await page.goto("/account");
  await expect(page.locator(".account-details")).toContainText("demo-logistics");
  await page.goto("/data");
  await expect(page.getByRole("button", { name: "Validate & ingest", exact: true })).toBeDisabled();
  await page.goto("/maintenance?dataset=research&view=bays");
  await expect(page.getByRole("button", { name: "Calculate maintenance schedule", exact: true })).toBeDisabled();
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Use documented synthetic catalogue capacities", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toBeEnabled();
});

test("narrow-phone settings actions fit their section and retain readable labels", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Appearance", exact: true })).toBeVisible();
  const resourceCard = page.getByRole("region", { name: "Operational resource assumptions", exact: true });
  await expect(resourceCard).toBeVisible();
  for (const button of await resourceCard.getByRole("button").all()) {
    expect(await button.evaluate(element => { const box = element.getBoundingClientRect(); const card = element.closest("section")!.getBoundingClientRect(); return box.right <= card.right && element.scrollWidth <= element.clientWidth; })).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
