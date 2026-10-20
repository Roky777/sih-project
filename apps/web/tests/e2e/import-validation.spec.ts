import { expect, test } from './workspaceTest';

test.beforeEach(async ({ page }) => {
  // These form regressions must not depend on a live backend session.
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/fleet-health/engine') return route.fulfill({ json: { ready: true, runs: [] } });
    if (path === '/api/access/session') {
      return route.fulfill({ json: {
        id: 'demo', role: 'engineer', authentication: 'demonstration header', csrf_token: null,
      } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/aircraft-registry/REG-AUDIT', route => route.fulfill({ json: {
    id: 'REG-AUDIT', tail_number: 'AUDIT-001', serial_number: 'SERIAL-AUDIT',
    aircraft_type: 'Synthetic audit fixture', base: 'Test base', fleet_entry_date: '2026-10-01',
    as_of: '2026-10-20', flight_hours: null, cycles: null, components: [], records: [],
    limitations: 'Synthetic browser fixture; no assessment or clearance.',
  } }));
});

test('changing an import source while preview is pending cannot validate the new source', async ({ page }) => {
  let releasePreview!: () => void;
  const previewReleased = new Promise<void>(resolve => { releasePreview = resolve; });
  let markRequested!: () => void;
  const previewRequested = new Promise<void>(resolve => { markRequested = resolve; });
  await page.route('**/api/aircraft-registry/REG-AUDIT/records', async route => {
    markRequested();
    await previewReleased;
    await route.fulfill({ json: { accepted: 1, duplicates: 0, preview: true } });
  });
  await page.goto('/aircraft/registered/REG-AUDIT');
  const source = page.getByLabel('Source / document reference');
  await source.fill('Original source');
  await page.getByLabel('Upload JSON records').setInputFiles({
    name: 'records.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{ kind: 'usage', effective_date: '2026-10-01', flight_hours: 100, cycles: 20 }])),
  });
  await page.getByRole('button', { name: 'Validate import', exact: true }).click();
  await previewRequested;
  await source.fill('Changed source requiring its own preview');
  const response = page.waitForResponse('**/api/aircraft-registry/REG-AUDIT/records');
  releasePreview();
  await response;
  await expect(page.getByRole('button', { name: 'Validate import', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save validated records', exact: true })).toBeDisabled();
  await expect(page.getByText('Preview: 1 records; 0 duplicates skipped. No predictions inferred.', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Validate import', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save validated records', exact: true })).toBeEnabled();
});

test('clearing or replacing an upload discards its validated content', async ({ page }) => {
  await page.route('**/api/aircraft-registry/REG-AUDIT/records', route => route.fulfill({
    json: { accepted: 1, duplicates: 0, preview: true },
  }));
  await page.goto('/aircraft/registered/REG-AUDIT');
  await page.getByLabel('Source / document reference').fill('Synthetic source');
  const upload = page.getByLabel('Upload JSON records');
  const file = { name: 'original.json', mimeType: 'application/json', buffer: Buffer.from('[{"kind":"usage","cycles":20}]') };
  await upload.setInputFiles(file);
  const validate = page.getByRole('button', { name: 'Validate import', exact: true });
  const save = page.getByRole('button', { name: 'Save validated records', exact: true });
  await validate.click();
  await expect(save).toBeEnabled();
  await upload.setInputFiles([]);
  await expect(save).toBeDisabled();
  await expect(validate).toBeDisabled();
  await expect(page.getByText('Inspect imported content', { exact: true })).not.toBeVisible();
  await upload.setInputFiles({ ...file, name: 'replacement.json', buffer: Buffer.from('[{"kind":"usage","cycles":30}]') });
  await expect(validate).toBeEnabled();
  await expect(save).toBeDisabled();
  await validate.click();
  await expect(save).toBeEnabled();
});

test('a delayed file read cannot overwrite a replacement upload', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      if (this.name === 'delayed.json') {
        await new Promise<void>(resolve => window.addEventListener('audit:release-file', () => resolve(), { once: true }));
      }
      const content = await read.call(this);
      if (this.name === 'delayed.json') window.dispatchEvent(new Event('audit:file-read'));
      return content;
    };
  });
  await page.goto('/aircraft/registered/REG-AUDIT');
  await page.getByLabel('Source / document reference').fill('Synthetic source');
  const upload = page.getByLabel('Upload JSON records');
  await upload.setInputFiles({ name: 'delayed.json', mimeType: 'application/json', buffer: Buffer.from('[{"cycles":20}]') });
  await upload.setInputFiles({ name: 'replacement.json', mimeType: 'application/json', buffer: Buffer.from('[{"cycles":30}]') });
  await page.getByText('Inspect imported content', { exact: true }).click();
  await expect(page.locator('.registration-preview')).toHaveText('[{"cycles":30}]');
  await page.evaluate(() => new Promise<void>(resolve => {
    window.addEventListener('audit:file-read', () => setTimeout(resolve, 0), { once: true });
    window.dispatchEvent(new Event('audit:release-file'));
  }));
  await expect(page.locator('.registration-preview')).toHaveText('[{"cycles":30}]');
});
