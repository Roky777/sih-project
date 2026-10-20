import { expect, test } from "./workspaceTest";

test.beforeEach(() => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
});

test("flexible light grid follows pointer and camera without intercepting controls", async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aircraft/AC-033");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  await expect(stage.locator(".twin-scene canvas")).toBeVisible({ timeout: 25000 });
  await expect(stage.getByText("Loading aircraft model…")).toHaveCount(0);
  const grid = stage.locator(".twin-flow-grid");
  await expect(grid).toHaveAttribute("aria-hidden", "true");
  await expect(grid).toHaveCSS("pointer-events", "none");
  await expect(stage).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const aircraftBackground = await page.locator("body").evaluate(element => getComputedStyle(element).backgroundImage);
  expect(aircraftBackground).toContain("radial-gradient");
  expect(aircraftBackground).toContain("rgba(105, 155, 69, 0.78)");
  expect(await stage.locator(".twin-floor").evaluate(element => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
  await expect(stage.locator(".twin-scene canvas")).toHaveCSS("filter", "none");
  const signature = () => grid.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(1100);
  const resting = await signature();
  const box = (await stage.locator(".twin-scene").boundingBox())!;
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .65);
  await expect.poll(signature).not.toBe(resting);
  await page.waitForTimeout(220);
  await stage.screenshot({ path: info.outputPath("flexible-grid-pointer.png") });
  await page.screenshot({ path: info.outputPath("aircraft-green-opening.png") });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(2600);
  const beforeCamera = await signature();
  await stage.getByRole("button", { name: "Side view", exact: true }).click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1100);
  expect(await signature()).not.toBe(beforeCamera);
  await stage.getByRole("button", { name: "Component condition", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Component condition" });
  await expect(panel).toBeVisible();
  const paused = await signature();
  await page.waitForTimeout(250);
  expect(await signature()).toBe(paused);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await stage.getByRole("button", { name: "Next aircraft", exact: true }).click();
  await expect(stage.getByRole("heading", { level: 1 })).toContainText("AC-034");
  await expect(page).toHaveURL(/\/aircraft\/AC-034$/);
  await expect(stage).toHaveAttribute("aria-busy", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1000); // Capture settled responsive framing, not the aircraft transition.
  await stage.screenshot({ path: info.outputPath("flexible-grid-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/dashboard");
  await expect(page.locator("body")).toHaveCSS("background-image", aircraftBackground);
  expect(errors).toEqual([]);
});

test("reduced motion leaves a static decorative grid", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/aircraft/AC-033");
  const stage = page.getByRole("region", { name: "Aircraft digital twin showcase" });
  const grid = stage.locator(".twin-flow-grid");
  await expect(grid).toHaveAttribute("data-motion", "static");
  const initial = await grid.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  await stage.locator(".twin-scene").hover();
  await stage.getByRole("button", { name: "Top view", exact: true }).click();
  await page.waitForTimeout(400);
  expect(await grid.evaluate(element => (element as HTMLCanvasElement).toDataURL())).toBe(initial);
  await expect(grid).toHaveAttribute("aria-hidden", "true");
});
