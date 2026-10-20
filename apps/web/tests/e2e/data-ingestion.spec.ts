import { expect, test } from './workspaceTest';

test('ingestion rejects JSON null without a page exception and Reset sample clears the error', async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/ingest/sensor-readings')) writes.push(request.url());
  });
  await page.goto('/data');
  await page.getByRole('textbox', { name: 'Request body', exact: true }).fill('null');
  await page.getByRole('button', { name: 'Validate & ingest', exact: true }).click();
  await expect(page.getByText('Expected an object with a "readings" array.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Reset sample', exact: true }).click();
  await expect(page.getByText('Expected an object with a "readings" array.', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Request body', exact: true })).toHaveValue(/health_monitoring/);
});
