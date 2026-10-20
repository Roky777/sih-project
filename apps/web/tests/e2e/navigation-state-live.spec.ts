import { expect, test } from "./workspaceTest";

test("aircraft register retains sort, filters and view across detail return and reload", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/aircraft?filter=grounded&search=AC&view=cards");
  await page.getByRole("group", { name: "Sort", exact: true }).getByRole("button", { name: "Tail", exact: true }).click();
  await expect(page).toHaveURL(/sort=tail/);
  const first = page.locator(".o-aircraft-card").first();
  const aircraft = await first.locator("strong").first().innerText();
  await first.click();
  await expect(page.locator(".aircraft-record-identity h1")).toContainText(aircraft);
  await page.getByRole("link", { name: "Back to aircraft register", exact: true }).click();
  await expect(page).toHaveURL(/filter=grounded/);
  await expect(page).toHaveURL(/sort=tail/);
  await page.reload();
  await expect(page.getByRole("group", { name: "Sort", exact: true }).getByRole("button", { name: "Tail", exact: true })).toHaveClass(/on/);
  await expect(page.getByRole("button", { name: /^Grounded/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Search aircraft", exact: true })).toHaveValue("AC");
});

test("search supports an empty result followed by keyboard selection and real record navigation", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search (⌘K)", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Search workspace records and pages", exact: true });
  await input.fill("unfindable-932193");
  await expect(page.getByText("No matching pages or records.")).toBeVisible();
  await input.press("ArrowDown");
  await input.fill("AC-014");
  await expect(page.getByRole("option").first()).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/\/aircraft\/AC-014/);
  await expect(page.getByRole("dialog", { name: "Search", exact: true })).toHaveCount(0);
});

test("invalid queue pages retain results or offer a usable recovery", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/advisories?page=Infinity");
  await expect(page.locator(".o-table tbody tr").first()).toBeVisible();
  await page.goto("/maintenance?view=cases&casePage=99999");
  await expect(page.getByText("This page has no cases", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Return to the first page", exact: true }).click();
  await expect(page.locator(".case-queue .o-table tbody tr").first()).toBeVisible();
  await expect(page).toHaveURL(/casePage=0/);
});

test("aircraft section tabs support arrow, Home and End navigation", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.goto("/aircraft/AC-014?tab=components");
  const components = page.getByRole("tab", { name: "Components", exact: true });
  await components.focus();
  await components.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Maintenance", exact: true })).toBeFocused();
  await expect(page).toHaveURL(/tab=maintenance/);
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Visual inspection", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Summary", exact: true })).toBeFocused();
  await expect(page).toHaveURL(/tab=summary/);
});

test("failed record search offers retry while page shortcuts remain usable", async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  let available = false;
  await page.route("**/api/workspace/search?**", route => available ? route.fulfill({ json: [{ id: "AC-014", label: "AC-014", type: "aircraft", dataset: "operational", to: "/aircraft/AC-014" }] }) : route.fulfill({ status: 503, json: { detail: "Search unavailable for this check" } }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search (⌘K)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search", exact: true });
  const input = dialog.getByRole("textbox", { name: "Search workspace records and pages", exact: true });
  await input.fill("Aircraft");
  await expect(dialog.getByRole("alert")).toContainText("Record search unavailable");
  await expect(dialog.getByRole("button", { name: "Aircraft Workspace", exact: true })).toBeVisible();
  available = true;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("option").filter({ hasText: "AC-014" })).toBeVisible();
  await dialog.getByRole("option").filter({ hasText: "AC-014" }).getByRole("button").click();
  await expect(page).toHaveURL(/\/aircraft\/AC-014/);
});
