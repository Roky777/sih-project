import { expect, test } from './workspaceTest';

test('recorded work detail retains aircraft context in linked supply', async ({ page, request }) => {
  const response = await request.get('/api/fleet-health/work-orders');
  expect(response.ok()).toBe(true);
  const data = await response.json() as { recorded: {id: string; aircraft: string}[] };
  const work = data.recorded[0];
  expect(work).toBeTruthy();
  await page.goto(`/maintenance/work/${encodeURIComponent(work.id)}`);
  await expect(page.getByRole('heading',{name:'Work order',exact:true})).toBeVisible();
  await expect(page.locator('.o-kv')).toContainText(work.aircraft);
  await page.getByRole('link',{name:'Linked supply',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`spares\\?view=requests&aircraft=${work.aircraft}`));
  await page.goto('/maintenance/work/DOES-NOT-EXIST');
  await expect(page.getByText('Work order unavailable',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Return to work queue'}).click();
  await expect(page).toHaveURL(/\/maintenance$/);
});

test('parts detail displays recorded quantities and preserves request destinations', async ({ page }) => {
  await page.route('**/api/fleet-health/part-requests?include_closed=true', route => route.fulfill({json:[{
    id:'REQUEST-AUDIT',work_order_id:'WORK-AUDIT',aircraft:'AC-011',component_id:'AC-011-ENG-TRB',component_name:'Turbine',part:'PRP-230',description:'Audit fixture',quantity:2,received_quantity:1,needed_by:'2026-10-05',status:'ordered',eta:'2026-10-04',available_now:1,version:1,at_risk:false,updated_by:'Logistics team',
  }]}));
  await page.goto('/spares/requests/REQUEST-AUDIT');
  await expect(page.getByRole('heading',{name:'Parts request',exact:true})).toBeVisible();
  await expect(page.locator('.o-kv')).toContainText('2 / 1');
  await expect(page.getByRole('link',{name:'Manage request'})).toHaveAttribute('href','/spares?view=requests&request=REQUEST-AUDIT&aircraft=AC-011');
  await expect(page.getByRole('link',{name:'Record delivery'})).toHaveAttribute('href','/spares?view=deliveries&request=REQUEST-AUDIT');
  await expect(page.getByRole('link',{name:'WORK-AUDIT',exact:true})).toHaveAttribute('href','/maintenance/work/WORK-AUDIT');
  await page.goto('/spares/requests/DOES-NOT-EXIST');
  await expect(page.getByText('Parts request unavailable',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Return to requests'}).click();
  await expect(page).toHaveURL(/spares\?view=requests$/);
});

test('research mapped controls and long imported identifiers fit narrow screens', async ({ page, request }) => {
  test.setTimeout(60000);
  const response = await request.get('/api/fleet');
  expect(response.ok()).toBe(true);
  const fleet = await response.json() as {component_ids: string[]}[];
  const component = fleet.flatMap(row=>row.component_ids).sort((a,b)=>b.length-a.length)[0];
  expect(component).toBeTruthy();
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/fleet');
    await expect(page.locator('.scene-components button').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.goto(`/components/${encodeURIComponent(component)}`);
    await expect(page.getByRole('heading',{name:'Quality & applicability',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
