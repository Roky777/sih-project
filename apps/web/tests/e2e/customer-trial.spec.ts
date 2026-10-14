import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const artifactDir = '../../artifacts/ui-flow';
async function capture(page: Page, name: string) {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/${name}.png`, fullPage: true });
}
async function create(page: Page, name: string, cutoff = 140, stock = 0, usage = 12) {
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Create my trial' })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Aircraft / customer name' }).fill(name);
  await page.getByRole('spinbutton', { name: 'History through cycle' }).fill(String(cutoff));
  await page.getByRole('spinbutton', { name: 'Inspection kits in stock' }).fill(String(stock));
  await page.getByRole('spinbutton', { name: 'Usage (cycles / day)' }).fill(String(usage));
  await page.getByRole('button', { name: 'Create my trial' }).click();
  await expect(page).toHaveURL(/\/demo\?trial=trial-/);
  await expect(page.getByRole('button', { name: 'Calculate AI assessment', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Calculate AI assessment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recalculate AI assessment' })).toBeVisible({ timeout: 45_000 });
}

test('customer enters a case and follows real AI, schedule, supply comparison, approval and completed work', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demo');
  await expect(page.getByRole('img', { name: 'Illustrative aircraft for this customer case' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Engine · customer trial', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Explore interactive aircraft' }).click();
  await expect(page.getByRole('button', { name: 'Reset view', exact: true })).toBeEnabled({ timeout:20_000 });
  await capture(page, 'customer-trial-enter');
  await create(page, `Customer B ${Date.now()}`);
  const trialId = new URL(page.url()).searchParams.get('trial')!;
  const trial = await (await request.get(`/api/demo/trials/${trialId}`)).json();
  const component = await (await request.get(`/api/components/${trial.component_id}`)).json();
  const evidence = await (await request.get(`/api/assessments/${component.assessment.id}`)).json();
  expect(evidence.component_id).toBe(trial.component_id);
  expect(evidence.state).toBe('available');
  expect(evidence.input_version).toBe(trial.import_id);
  expect(evidence.cutoff_cycle).toBe(140);
  expect(evidence.estimate_cycles).toBeGreaterThanOrEqual(0);
  await capture(page, 'customer-trial-ai');
  await page.getByRole('button', { name: 'Use this evidence to test options' }).click();
  await page.getByRole('button', { name: 'Calculate my schedule' }).click();
  await expect(page.getByRole('heading', { name: 'A usable schedule was found' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Compare this saved plan' }).click();
  await expect(page.getByRole('table', { name: 'Assumption-based outcomes · downtime in aircraft hours' })).toBeVisible({ timeout:45_000 });
  await page.getByRole('button', { name: 'Run parts comparison' }).click();
  await expect(page.getByRole('table', { name: 'Simulated projections · matched workload' })).toBeVisible({ timeout: 45_000 });
  const downtime = page.getByRole('row', { name: 'Downtime (aircraft hours) 16.0 40.0' });
  await expect(downtime).toBeVisible();
  await expect(page.getByRole('row', { name: 'Waiting for parts (hours) 0.0 24.0' })).toBeVisible();
  const oldPlans = await (await request.get('/api/plans')).json();
  const old = oldPlans.find((p: {input_snapshot:{scope_component_id?:string}}) => p.input_snapshot.scope_component_id === trial.component_id);
  expect(old.assignments).toHaveLength(1);
  expect(old.assignments[0].start).toBe(3);
  expect(old.input_snapshot.advisory.assessment_id).toBe(evidence.id);
  const compared = await (await request.get(`/api/scenarios/runs/all?plan_id=${old.id}`)).json();
  expect(compared[0].metrics.plan_id).toBe(old.id);
  expect(compared[0].metrics.cases[0].actual.downtime_aircraft_hours).toBe(40);
  expect(compared[0].metrics.cases[0].actual.trace.find((e: {event:string}) => e.event === 'started').hour).toBe(24);
  await capture(page, 'customer-trial-options');
  await page.getByRole('button', { name: 'Review this decision' }).click();
  await expect(page.getByRole('button', { name: 'Approve this demo plan' })).toBeDisabled();
  await page.getByRole('button', { name: 'Record demo receipt & replan' }).click();
  await expect(page.getByRole('button', { name: 'Approve this demo plan' })).toBeEnabled({ timeout: 45_000 });
  const updated = await (await request.get('/api/plans')).json();
  const next = updated.find((p: {input_snapshot:{scope_component_id?:string}}) => p.input_snapshot.scope_component_id === trial.component_id);
  expect(next.id).not.toBe(old.id);
  expect(next.assignments[0].start).toBe(0);
  expect(updated.find((p: {id:string}) => p.id === old.id)).toEqual(old);
  await page.getByRole('button', { name: 'Compare this saved plan' }).click();
  await expect(page.getByRole('table', { name: 'Assumption-based outcomes · downtime in aircraft hours' })).toBeVisible({timeout:45_000});
  const revisedComparison = await (await request.get(`/api/scenarios/runs/all?plan_id=${next.id}`)).json();
  expect(revisedComparison[0].metrics.plan_sha256).not.toBe(compared[0].metrics.plan_sha256);
  expect(revisedComparison[0].metrics.cases[0].actual.downtime_aircraft_hours).toBe(16);
  await page.getByRole('button', { name: 'Approve this demo plan' }).click();
  await expect(page.getByRole('button', { name: 'Record work started' })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Record work started' }).click();
  await expect(page.getByRole('button', { name: 'Record inspection completed' })).toBeEnabled();
  await page.getByRole('button', { name: 'Record inspection completed' }).click();
  await expect(page.getByRole('heading', { name: 'Work record · awaiting verification' })).toBeVisible();
  await page.getByRole('button', { name: 'Verify demo inspection outcome', exact: true }).click();
  await expect(page.getByText('You’ve followed the full decision flow.')).toBeVisible();
  const commitment = await (await request.get(`/api/plans/${next.id}/commitment`)).json();
  expect(commitment.plan_id).toBe(next.id);
  expect(commitment.work[0].status).toBe('completed');
  expect(commitment.work[0].consumed_quantity).toBe(1);
  await capture(page, 'customer-trial-completed');
  await page.reload();
  await page.getByRole('button', { name: '4 Review & record work' }).click();
  await expect(page.getByText('You’ve followed the full decision flow.')).toBeVisible();
  await page.getByRole('button', { name: 'View entered data' }).click();
  await expect(page.locator('.trial-saved-inputs')).toContainText(trial.aircraft_label);
  expect(errors).toEqual([]);
});

test('short history withholds AI and cannot become a usable maintenance recommendation', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width:390, height:844 });
  await create(page, `Short history ${Date.now()}`, 25, 1);
  await expect(page.getByText('Provide at least 30 consecutive observed cycles.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use this evidence to test options' })).toHaveCount(0);
  await page.getByRole('button', { name: '3 Test maintenance options' }).click();
  await expect(page.getByRole('button', { name: 'Calculate my schedule' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, 'customer-trial-mobile-withheld');
});

test('entered usage can make the AI-informed window impossible without relaxing constraints', async ({ page }) => {
  test.setTimeout(60_000);
  await create(page, `Tight window ${Date.now()}`, 180, 1, 120);
  await page.getByRole('button', { name: 'Use this evidence to test options' }).click();
  await page.getByRole('button', { name: 'Calculate my schedule' }).click();
  await expect(page.getByRole('heading', { name: 'No usable schedule available' })).toBeVisible({ timeout:45_000 });
  await expect(page.getByText(/cannot fit in its window/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review this decision' })).toHaveCount(0);
});

test('customer supplied history is the actual imported input used by the AI', async ({ page, request }) => {
  test.setTimeout(60_000);
  const catalog = await (await request.get('/api/demo/catalog')).json();
  const supplied = catalog.history;
  supplied.source_version = `customer-file-${Date.now()}`;
  supplied.rows[139].values[4] += 0.25;
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Create my trial' })).toBeEnabled();
  const uploadedJson = JSON.stringify(supplied);
  await page.locator('input[type=file]').setInputFiles({name:'customer-history.json',mimeType:'application/json',buffer:Buffer.from(uploadedJson)});
  await expect(page.getByText('Your supplied history', {exact:true})).toBeVisible();
  await page.getByRole('textbox', {name:'Aircraft / customer name'}).fill(`Uploaded case ${Date.now()}`);
  await page.getByRole('button', {name:'Create my trial'}).click();
  await expect(page).toHaveURL(/\/demo\?trial=trial-/);
  const id = new URL(page.url()).searchParams.get('trial')!;
  const trial = await (await request.get(`/api/demo/trials/${id}`)).json();
  const imported = await (await request.get(`/api/demo/trials/${id}/history`)).json();
  expect(trial.history_origin).toBe('User-supplied FD001-format history');
  expect(imported.rows).toEqual(JSON.parse(uploadedJson).rows.slice(0,140));
  await page.getByRole('button', {name:'Calculate AI assessment',exact:true}).click();
  await expect(page.getByRole('button', {name:'Use this evidence to test options'})).toBeVisible({timeout:45_000});
  const component = await (await request.get(`/api/components/${trial.component_id}`)).json();
  const evidence = await (await request.get(`/api/assessments/${component.assessment.id}`)).json();
  expect(evidence.input_version).toBe(trial.import_id);
  expect(evidence.evidence.source_sha256).toBe(trial.history_sha256);
});

test('later observed health changes the actual AI review and window with identical logistics', async ({ page, request }) => {
  test.setTimeout(120_000);
  const decisions = [];
  for (const cutoff of [140, 180]) {
    await create(page, `Health replay ${cutoff} ${Date.now()}`, cutoff, 1, 12);
    const trialId = new URL(page.url()).searchParams.get('trial')!;
    const trial = await (await request.get(`/api/demo/trials/${trialId}`)).json();
    const component = await (await request.get(`/api/components/${trial.component_id}`)).json();
    const alerts = await (await request.get('/api/alerts')).json();
    await page.getByRole('button', { name: 'Use this evidence to test options' }).click();
    await page.getByRole('button', { name: 'Calculate my schedule' }).click();
    await expect(page.getByRole('heading', { name: cutoff === 140 ? 'A usable schedule was found' : 'No usable schedule available' })).toBeVisible({ timeout:45_000 });
    const plans = await (await request.get(`/api/plans?scope_component_id=${trial.component_id}`)).json();
    decisions.push({ estimate: component.assessment.estimate_cycles,
      state: alerts.find((a: {component_id:string}) => a.component_id === trial.component_id).state,
      window: plans[0].input_snapshot.advisory.effective_deadline_hours,
      mandatory: plans[0].input_snapshot.advisory.mandatory_deadline_hours });
  }
  expect(decisions[1].estimate).toBeLessThan(decisions[0].estimate);
  expect(decisions[0].state).toBe('normal');
  expect(decisions[1].state).toBe('critical');
  expect(decisions[1].window).toBeLessThan(decisions[0].window);
  expect(decisions.map(item => item.mandatory)).toEqual([112,112]);
});
