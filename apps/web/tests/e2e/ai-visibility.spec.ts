import { expect, test, type Page } from "./workspaceTest";

async function records(page: Page, mismatch = false) {
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/access/session') return route.fulfill({ json: { id: 'fixture-reviewer', role: 'viewer', authentication: 'demonstration header', csrf_token: null } });
    if (path === '/api/health/ready') return route.fulfill({ json: { status: 'ready', database: 'ok' } });
    if (path === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    if (path === '/api/alerts') return route.fulfill({ json: [] });
    if (path === '/api/fleet') return route.fulfill({ json: [{ id: 'aircraft', tail_number: 'SYN-AI', label: 'Synthetic fixture', provenance: 'synthetic', components: 2, component_ids: ['estimated', 'withheld'], open_tasks: 0 }] });
    const id = path.split('/')[3];
    const available = id === 'estimated' || id === 'asm-estimated';
    const assessment = { id: available ? 'asm-estimated' : 'asm-withheld', state: available ? 'qualified' : 'withheld', estimate_cycles: available ? 42 : null, lower_cycles: available ? 22 : null, upper_cycles: available ? 62 : null, model_version: 'fixture-model', input_version: 'fixture-input', quality_findings: available ? [] : [{ code: 'insufficient_history', severity: 'warning', message: 'Fixture history is too short.' }] };
    if (path.startsWith('/api/components/')) return route.fulfill({ json: { id: mismatch ? 'different-component' : id, aircraft_id: 'aircraft', serial_number: `ENGINE-${id}`, kind: 'engine', status: 'monitoring', current_cycle: 31, observations: [], assessment } });
    if (path.startsWith('/api/assessments/')) return route.fulfill({ json: { ...assessment, component_id: available ? 'estimated' : 'withheld', cutoff_cycle: 31, explanation: { state: 'unavailable', reason: 'No explanation in this labelled fixture.' }, evidence: { calibration: { nominal_coverage: 0.9 } } } });
    return route.fulfill({ status: 404, json: { detail: 'No fixture endpoint' } });
  });
}

test('AI role is visible and selection retains authoritative estimate and unavailable state', async ({ page }, testInfo) => {
  await records(page);
  await page.goto('/ai');
  await expect(page.getByRole('heading', { name: 'Turn engine data into maintenance decisions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find a practical maintenance option' })).toBeVisible();
  await expect(page.getByText('22.0–62.0 cycles · Nominal 90% prediction interval', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('ai-desktop-fixture.png'), fullPage: true });
  await page.getByLabel('Component record').selectOption('withheld');
  await expect(page).toHaveURL(/component=withheld/);
  await expect(page).toHaveURL(/dataset=research/);
  await expect(page).toHaveURL(/view=models/);
  await expect(page.locator('.assessment-summary')).toContainText('Data unavailable');
  await expect(page.locator('.assessment-summary')).not.toContainText('42.0');
  await expect(page.getByText('Fixture history is too short.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inspect sensor history & quality' })).toHaveAttribute('href', '/components/withheld');
  await page.reload();
  await expect(page.getByLabel('Component record')).toHaveValue('withheld');
});

test('AI page rejects component identity mismatches', async ({ page }) => {
  await records(page, true);
  await page.goto('/ai?component=estimated');
  await expect(page.getByRole('alert')).toContainText('does not match');
  await expect(page.locator('.assessment-summary')).toHaveCount(0);
});

test('spatial research opens evidence for the selected component', async ({ page }) => {
  await records(page);
  await page.route('**/api/components/withheld/maintenance', route => route.fulfill({ json: { component_id:'withheld', slot_duration_hours:8, tasks:[] } }));
  await page.goto('/fleet?aircraft=aircraft&component=withheld');
  await expect(page.getByRole('heading', { name: 'Aircraft inspection', exact:true })).toBeVisible();
  await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-withheld');
  await expect(page.getByRole('link', { name: 'Inspect history & evidence' })).toHaveAttribute('href','/components/withheld');
});

test('mismatched assessment versions cannot display an AI estimate', async ({ page }) => {
  await records(page);
  await page.route('**/api/assessments/asm-estimated', route => route.fulfill({ json: { id: 'asm-estimated', component_id: 'estimated', input_version: 'different-input', model_version: 'fixture-model', state: 'qualified', estimate_cycles: 42, lower_cycles: 22, upper_cycles: 62, cutoff_cycle: 31, quality_findings: [], explanation: { state: 'unavailable', reason: 'Fixture' }, evidence: {} } }));
  await page.goto('/ai');
  await expect(page.getByRole('alert')).toContainText('Evidence does not match');
  await expect(page.locator('.assessment-summary')).toHaveCount(0);
});

test('AI explanation remains available when records fail and supports retry', async ({ page }) => {
  await records(page);
  await page.route('**/api/fleet', route => route.fulfill({ status: 503, json: { detail: 'Fixture records unavailable' } }));
  await page.goto('/ai');
  await expect(page.getByRole('heading', { name: 'Estimate remaining engine life' })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
  await page.unroute('**/api/fleet');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('Component record')).toBeVisible();
});

test('AI navigation and evidence fit a mobile viewport', async ({ page }, testInfo) => {
  await records(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ai');
  await expect(page.locator('.assessment-summary')).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Engine comparisons' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ai-mobile-fixture.png'), fullPage: true });
});
