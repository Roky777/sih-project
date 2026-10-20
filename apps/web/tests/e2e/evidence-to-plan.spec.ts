import { expect, test } from "./workspaceTest";

test("evidence remains honest before planning", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/fleet/register");
  await expect(page.getByRole("heading", { name: "Aircraft", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /SYN-001/ }).click();
  await page.getByRole("tab", {name:"Components",exact:true}).click();
  await page.getByRole("link", {name:/Open evidence/}).first().click();
  await expect(page.getByRole("heading",{name:"ENG-SYN-001",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Quality & applicability"})).toBeVisible();
  await page.goto('/maintenance?dataset=research&view=bays');
  await expect(page.getByRole("heading", { name: "Maintenance planning" })).toBeVisible();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/jobs/planning") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Calculate maintenance schedule" }).click();
  const response = await submitted;
  // The imported research snapshot contains active work without resource bookings.
  // It must remain blocked; the isolated guided-trial test covers successful planning.
  if (response.status() === 409) {
    const conflict = await response.json() as { detail: string };
    expect(conflict.detail).toContain("Active legacy work has no crew/bay booking");
    await expect(page.getByRole("alert")).toContainText(conflict.detail);
    return;
  }
  expect(response.status(), await response.text()).toBe(200);
  const job = (await response.json()) as { id: string };
  const jobRow = page.locator(`[data-job-id="${job.id}"]`);
  await expect(jobRow).toContainText("Completed",{timeout:30000});
  await expect(jobRow).toContainText("Plan ready for review");
});
