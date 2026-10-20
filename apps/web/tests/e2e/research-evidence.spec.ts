import { handleWorkspaceEntry } from "./workspaceEntry";
import { expect, test } from './workspaceTest';

test.beforeEach(async ({ page }) => {
  await handleWorkspaceEntry(page);
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'A quick look around your dashboard' }), async dialog => {
    await dialog.getByRole('button', { name: 'Skip', exact: true }).click();
  });
});

test('separate research datasets retain identity, counts, sensor history and withheld states', async ({ page, request }) => {
  await page.goto('/research?view=benchmarks');
  await expect(page.getByRole('heading', { name: 'FD001–FD004 prediction evidence' })).toBeVisible();
  for (const subset of ['FD001', 'FD002', 'FD003', 'FD004']) {
    await page.getByLabel('Research dataset', {exact: true}).selectOption(subset);
    const response = await request.get(`/api/evidence/research/${subset}`);
    expect(response.ok()).toBeTruthy();
    const report = await response.json();
    expect(report.subset).toBe(subset);
    expect(report.capped_primary.count + report.withheld_count).toBe(report.test_engine_count);
    await expect(page.locator('.research-engine-evidence strong')).toHaveText(report.engines[0].engine_id);
    await expect(page.getByText(report.engines[0].recommendation, {exact: true})).toBeVisible();
    const withheld = report.engines.find((e: {status: string}) => e.status === 'withheld');
    if (withheld) {
      await page.getByLabel('Research engine', {exact: true}).selectOption(withheld.engine_id);
      await expect(page.locator('.research-rul')).toHaveText('Withheld');
      await expect(page.getByText('No numerical range substituted')).toBeVisible();
    }
  }
  await page.getByRole('button', {name: 'Engineering register', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Component-to-drawing evidence register'})).toBeVisible();
  await expect(page.getByRole('cell', {name: /^pending$/i})).toHaveCount(20);
});

test('research API failures never substitute numerical evidence', async ({page}) => {
  await page.route(/\/api\/evidence\/research(?:\/.*)?$/, route => route.fulfill({status: 503,contentType:'application/json',body:JSON.stringify({detail:'Verified research evidence is unavailable'})}));
  await page.goto('/research?view=benchmarks');
  await expect(page.getByText('Verified research evidence is unavailable').first()).toBeVisible();
  await expect(page.locator('.research-rul')).toHaveCount(0);
});

test('research route remains usable on mobile without document overflow', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/research?view=benchmarks&subset=FD003');
  await expect(page.locator('.research-rul')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
});
