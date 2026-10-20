import { expect, test } from './workspaceTest';
import { mkdir, writeFile } from 'node:fs/promises';

test('case entry defers the 3D download and preserves labelled keyboard controls', async ({ page }) => {
  await page.addInitScript(() => {
    const durations: number[] = [];
    Object.assign(window, { fleetLongTasks: durations });
    new PerformanceObserver(list => { durations.push(...list.getEntries().map(item => item.duration)); }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Create my trial' })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Aircraft / customer name' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'History through cycle' })).toBeFocused();
  const focus = await page.getByRole('spinbutton', { name: 'History through cycle' }).evaluate(element => getComputedStyle(element).outlineWidth);
  expect(parseFloat(focus)).toBeGreaterThanOrEqual(2);
  const report = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const colors = getComputedStyle(document.documentElement);
    const names = ['text-primary', 'text-secondary', 'text-muted', 'accent', 'success', 'warning', 'danger'];
    const luminance = (hex: string) => {
      const rgb = hex.replace('#', '').match(/../g)!.map(s => parseInt(s, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    return {
      route: '/demo', environment: navigator.userAgent, throttling: 'none; local desktop diagnostic',
      navigation: { responseEnd: navigation.responseEnd, domContentLoaded: navigation.domContentLoadedEventEnd },
      longTasksMs: (window as unknown as { fleetLongTasks: number[] }).fleetLongTasks,
      resources: resources.map(item => ({ name: item.name, bytes: item.encodedBodySize, duration: item.duration })),
      contrastAgainstWhite: Object.fromEntries(names.map(name => [name, 1.05 / (luminance(colors.getPropertyValue(`--${name}`).trim()) + .05)])),
    };
  });
  expect(report.resources.filter(item => /AircraftScene|\.glb(?:\?|$)/.test(item.name))).toEqual([]);
  for (const ratio of Object.values(report.contrastAgainstWhite)) expect(ratio).toBeGreaterThanOrEqual(4.5);
  await mkdir('../../artifacts/release-v2', { recursive: true });
  await writeFile('../../artifacts/release-v2/browser-performance.json', JSON.stringify(report, null, 2));
  await page.getByRole('button', { name: 'Explore interactive aircraft' }).click();
  await expect(page.getByRole('button', { name: 'Engine · customer trial', exact: true })).toBeVisible();
});
