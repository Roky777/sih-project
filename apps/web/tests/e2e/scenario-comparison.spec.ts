import { expect, test } from "./workspaceTest";

test("scenario run is labelled as a simulated projection", async ({ page }) => {
  await page.goto("/scenarios");
  await expect(page.getByText("Simulated projections", { exact: true }).first()).toBeVisible();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().includes("/api/jobs/simulation/") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run simulation" }).first().click();
  const job = (await (await submitted).json()) as { id: string };
  await expect(page.getByRole("heading", { name: "Calculation activity" })).toBeVisible();
  const jobRow = page.locator(`[data-job-id="${job.id}"]`);
  await expect(jobRow).toContainText("Completed");
  await expect(jobRow).toContainText("Projection saved");
  await expect(page.getByText("Simulated projections", { exact: true }).first()).toBeVisible();
});
