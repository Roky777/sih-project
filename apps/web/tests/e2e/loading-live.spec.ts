import { expect, test } from "@playwright/test";

test("aircraft register stays lightweight, selected aircraft shows a live model and Explore opens blueprint", async ({ page }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.setViewportSize({ width: 1440, height: 900 });
  const scripts: string[] = [];
  page.on("request", request => { if (request.resourceType() === "script") scripts.push(request.url()); });
  await page.goto("/aircraft");
  await expect(page.locator(".o-aircraft-card").first()).toBeVisible();
  expect(scripts.filter(url => /TwinStudio|TwinShowcase|AircraftBlueprint|three\.core|OrbitControls/.test(url))).toEqual([]);
  await page.locator(".o-aircraft-card").first().click();
  await expect(page.getByRole("tabpanel", { name: "Aircraft summary" })).toBeVisible();
  expect(scripts.filter(url => /AircraftBlueprint/.test(url))).toEqual([]);
  await expect(page.locator(".twin-scene canvas")).toBeVisible();
  await expect(page.getByText("Loading aircraft model…")).toHaveCount(0);
  expect(scripts.filter(url => /AircraftBlueprint/.test(url))).toEqual([]);
  await page.getByRole("button", { name: "Open visual inspection", exact: true }).click();
  await expect(page).toHaveURL(/tab=visual/);
  await expect(page.getByRole("heading", { name: "Aircraft blueprint", exact: true })).toBeInViewport();
  await expect(page.locator(".twin-scene canvas")).toHaveCount(0);
  await expect(page.locator(".bp-register-item").first()).toBeVisible();
  expect(scripts.some(url => /AircraftBlueprint/.test(url))).toBe(true);
  await info.attach("loaded-scripts", { body: JSON.stringify(scripts, null, 2), contentType: "application/json" });
});

test("model and text responses are compressed without weakening security headers", async ({ request }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  for (const path of ["/models/helicopter-visual.glb", "/api/fleet-health/advisories"]) {
    const response = await request.get(path, { headers: { "Accept-Encoding": "gzip" } });
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-encoding"]).toBe("gzip");
    expect(response.headers()["x-content-type-options"].split(",").map(value => value.trim()).every(value => value === "nosniff")).toBe(true);
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  }
});
