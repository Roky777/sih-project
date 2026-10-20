import { expect, test } from "./workspaceTest";

test("record grid active and settled idle rendering cost at 4x CPU slowdown", async ({ page }, info) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Select the local deployment explicitly.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aircraft/AC-033");
  await expect(page.getByText("Loading aircraft model…")).toHaveCount(0);
  await expect(page.locator(".twin-scene canvas")).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3000);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await session.send("Performance.enable");
  const metrics = async () => {
    const result = await session.send("Performance.getMetrics");
    return Object.fromEntries(result.metrics.map((metric: { name: string; value: number }) => [metric.name, metric.value]));
  };
  const start = await metrics();
  const active = await page.evaluate(async () => {
    const host = document.querySelector(".twin-showcase")!;
    const box = host.getBoundingClientRect();
    const times: number[] = [];
    let previous = performance.now();
    await new Promise<void>(resolve => {
      const began = previous;
      const tick = (now: number) => {
        times.push(now - previous); previous = now;
        const progress = (now - began) / 2000;
        host.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: box.left + box.width * (.5 + Math.sin(progress * 12) * .3), clientY: box.top + box.height * (.55 + Math.cos(progress * 9) * .15) }));
        if (progress < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    host.dispatchEvent(new PointerEvent("pointerleave"));
    return { callbacks: times.length, p95GapMs: times.sort((a, b) => a - b)[Math.floor(times.length * .95)] };
  });
  const end = await metrics();
  await page.waitForTimeout(3000);
  const idleStart = await metrics();
  await page.waitForTimeout(1000);
  const idleEnd = await metrics();
  const result = { ...active, activeTaskMs: (end.TaskDuration - start.TaskDuration) * 1000, idleTaskMs: (idleEnd.TaskDuration - idleStart.TaskDuration) * 1000,
    activeStyleMs: (end.RecalcStyleDuration - start.RecalcStyleDuration) * 1000, activeLayoutMs: (end.LayoutDuration - start.LayoutDuration) * 1000 };
  await info.attach("grid-render-benchmark", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  console.log("Grid benchmark (Chrome, 1440x900, 4x CPU slowdown):", JSON.stringify(result));
});
