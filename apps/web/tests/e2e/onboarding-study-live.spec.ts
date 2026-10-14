import { expect, test } from "@playwright/test";

test.beforeEach(() => { test.skip(!process.env.FLEET_E2E_BASE_URL, "Use the explicitly selected local stack."); });
test("register aircraft, install component and validate immutable source records", async ({ page }, info) => {
  const tail = `DEMO-${Date.now().toString(36).toUpperCase()}`;
  await page.goto("/aircraft?filter=onboarding");
  await page.getByRole("button", { name: "Add aircraft", exact: true }).click();
  await page.getByLabel("Tail / registration number").fill(tail);
  await page.getByLabel("Airframe serial number").fill(`SERIAL-${tail}`);
  await page.getByLabel("Aircraft type", { exact: true }).fill("Demonstration airframe (user entered)");
  await page.getByLabel("Base", { exact: true }).fill("DEMO BASE");
  await page.getByLabel("Fleet entry date").fill("2026-10-01");
  await page.getByRole("button", { name: "Save aircraft", exact: true }).click();
  await expect(page).toHaveURL(/aircraft\/registered\/REG-/);
  await expect(page.getByRole("heading", { name: tail, exact: true })).toBeVisible();
  await expect(page.getByText("Availability unknown", { exact: true })).toBeVisible();
  await page.getByText("Add installed component", { exact: true }).click();
  await page.getByLabel("Component type").fill("Engine (unsupported customer type)");
  await page.getByLabel("Serial number", { exact: true }).fill(`ENGINE-${tail}`);
  await page.getByLabel("Installation position").fill("Engine 1");
  await page.getByLabel("Installed on").fill("2026-09-20");
  await page.getByRole("button", { name: "Save component", exact: true }).click();
  await expect(page.getByRole("cell", { name: `ENGINE-${tail}`, exact: true })).toBeVisible();
  await page.getByLabel("Source / document reference").fill("Synthetic demonstration technical log");
  await page.getByLabel("Upload JSON records").setInputFiles({ name: "records.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([
    { kind: "usage", effective_date: "2026-10-01", flight_hours: 1250, cycles: 600 },
    { kind: "maintenance_requirement", effective_date: "2026-10-01", title: "Demonstration mandatory inspection", due_date: "2026-11-14" },
  ])) });
  await page.getByRole("button", { name: "Validate import", exact: true }).click();
  await expect(page.getByText("Preview: 2 records; 0 duplicates skipped. No predictions inferred.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save validated records", exact: true }).click();
  await expect(page.getByText("Demonstration mandatory inspection", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1,250 h", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("onboarding-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("onboarding-mobile.png"), fullPage: true });
  await page.goto("/dashboard");
  await expect(page.getByText(/registered aircraft awaiting assessment/)).toBeVisible();
});
test("availability study runs through the real worker and reopens saved results", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto("/analysis?view=study");
  await page.getByRole("button", { name: "Run availability study", exact: true }).click();
  await expect(page).toHaveURL(/study_job=/);
  await expect(page.getByRole("heading", { name: "single task tie", exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("No usable schedule", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "shared resources delayed supply", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Export inputs and results" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("availability-study.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
