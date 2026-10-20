import { expect, test, type Page } from "./workspaceTest";

const fleet = [
  { id:"ac-syn-01", tail_number:"SYN-001", label:"Synthetic demonstrator aircraft 1", provenance:"synthetic", component_ids:["cmp-eng-01"], components:1, open_tasks:1 },
  { id:"ac-syn-02", tail_number:"SYN-002", label:"Synthetic demonstrator aircraft 2", provenance:"synthetic", component_ids:["cmp-eng-02"], components:1, open_tasks:0 },
];
const alert = { id:"alert-1", component_id:"cmp-eng-01", state:"data_unavailable", reason:"Prediction unavailable; mandatory task remains active.", policy_version:"demo-v1", assessment_id:"asm-1", acknowledged_by:null, acknowledgements:[] };
const plan = { id:"plan-ui", status:"proposed", solver_status:"optimal", input_version:"snapshot-ui-v1", assignments:[{ task_id:"task-inspect", start:0, end:3 },{ task_id:"task-filter", start:4, end:6 }], diagnostics:[], created_at:"2026-10-04T04:00:00Z", approved_at:null, approved_by:null };

async function records(page: Page) {
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payloads: Record<string, unknown> = {
      "/api/access/session": { id: "demo-supervisor", role: "supervisor", authentication: "demonstration header", csrf_token: null },
      "/api/health/ready": { status:"ready", database:"ok" }, "/api/fleet":fleet, "/api/alerts":[alert], "/api/plans":[plan], "/api/jobs":[],
      "/api/inventory/arrivals": [],
      "/api/inventory":[{ id:"kit", name:"Synthetic inspection kit", on_hand:2, reserved:1, lead_time_slots:2, version:2, provenance:"synthetic" }],
      "/api/scenarios":[{ id:"scenario-ui", name:"Synthetic capacity reference", version:1, assumptions:{ aircraft_count:2, maintenance_capacity:1, horizon_hours:24 }, provenance:"synthetic" }],
      "/api/scenarios/runs/all":[],
      "/api/components/cmp-eng-01":{ id:"cmp-eng-01", aircraft_id:"ac-syn-01", serial_number:"ENG-SYN-001", kind:"engine", status:"monitoring", current_cycle:74, observations:[{ cycle:73, sensor:"sensor_2", value:642, unit:"unknown_dataset_unit", source_version:"demo-v1" },{ cycle:74, sensor:"sensor_2", value:643, unit:"unknown_dataset_unit", source_version:"demo-v1" }], assessment:{ id:"asm-1", state:"unavailable", estimate_cycles:null, lower_cycles:null, upper_cycles:null, model_version:null, input_version:"demo-v1", quality_findings:[{ code:"model_unavailable", severity:"warning", message:"No evaluated model artifact is installed." }] } },
    };
    if (path === "/api/events") return route.fulfill({ status:200, contentType:"text/event-stream", body:": fixture\n\n" });
    if (path in payloads) return route.fulfill({ json:payloads[path] });
    return route.fulfill({ status:404, json:{ detail:"Fixture endpoint unavailable" } });
  });
}

test.beforeEach(async ({ page }) => records(page));

test('workflow guide leads to the separate research register, evidence and maintenance options', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page).toHaveURL(/\/maintenance$/);
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'From a finding to recorded maintenance' })).toBeVisible();
  expect(requests.some(url => url.endsWith('.glb') || url.includes('/AircraftScene-'))).toBe(false);
  await page.goto('/research');
  await expect(page.getByRole('heading', { name: 'Technical sandbox', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Choose an engine record/ }).click();
  await page.locator('.o-aircraft-card').filter({hasText:'SYN-001'}).click();
  await page.getByRole('tab',{name:'Components',exact:true}).click();
  await page.getByRole('link',{name:/Open evidence/}).first().click();
  await expect(page.getByRole('heading', { name: 'Assessment & model evidence' })).toBeVisible();
  await page.getByRole('link', { name: 'Review maintenance options', exact: true }).first().click();
  await expect(page).toHaveURL(/component=cmp-eng-01/);
  await expect(page.getByText(/this selection does not restrict the solver/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate maintenance schedule' })).toBeVisible();
});

test('supporting tools keep keyboard focus and a route back to the main journey', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/overview');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(dialog.getByRole('link', { name: 'Parts & deliveries' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('link', { name: 'Parts & deliveries' }).click();
  await expect(page).toHaveURL(/\/spares\?.*dataset=research/);
  await expect(dialog).not.toBeVisible();
});

test('mobile research register remains readable and failed records never become an empty healthy fleet', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fleet/register');
  await expect(page.locator('.o-aircraft-card').filter({hasText:'SYN-001'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('start-mobile-fixture.png'), fullPage: true });
  await page.route('**/api/fleet', route => route.fulfill({ status: 503, json: { detail: 'Fixture fleet unavailable' } }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Fixture fleet unavailable');
  await expect(page.getByText('No aircraft records yet', { exact: true })).toHaveCount(0);
  await expect(page.locator('.workspace-research-context').getByRole('link', {name:'Return to fleet operations'})).toBeVisible();
});

test("fleet search and filters use the returned aircraft records", async ({ page }) => {
  await page.goto("/fleet/register");
  await expect(page.getByRole("heading", { name:"Aircraft", exact:true })).toBeVisible();
  await expect(page.getByRole("link", { name:/SYN-001/ })).toBeVisible();
  await page.getByRole("textbox", { name:"Search records" }).fill("SYN-002");
  await expect(page.getByRole("link", { name:/SYN-001/ })).toHaveCount(0);
  await page.getByRole("textbox", { name:"Search records" }).fill("SYN-002");
  await expect(page.getByRole("link", { name:/SYN-002/ })).toBeVisible();
  await expect(page.getByRole("link", { name:/SYN-001/ })).toHaveCount(0);
});

test("component evidence retains unavailable estimates and accessible observation values", async ({ page }) => {
  await page.goto("/components/cmp-eng-01");
  await expect(page.getByText("Prediction is unavailable", { exact:true })).toBeVisible();
  await expect(page.getByText("No model installed", { exact:true })).toBeVisible();
  await page.getByText("View observation values and sources", { exact:true }).click();
  await expect(page.getByRole("table", { name:"sensor_2 observation history" })).toContainText("unknown_dataset_unit");
  await expect(page.getByRole("img", { name:/sensor_2 values/ })).toBeVisible();
});

test("approval dialog reviews the exact proposal and restores focus when closed", async ({ page }) => {
  await page.goto("/planning");
  const trigger = page.getByRole("button", { name:"Review & approve" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("plan-ui");
  await expect(dialog).toContainText("snapshot-ui-v1");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("inventory uses physical on-hand minus reserved stock once", async ({ page }) => {
  await page.goto("/inventory");
  const row = page.getByRole("row").filter({ hasText:"Synthetic inspection kit" });
  await expect(row.getByRole("cell").nth(1)).toHaveText("1");
  await expect(row.getByRole("cell").nth(2)).toHaveText("2");
  await expect(row.getByRole("cell").nth(3)).toHaveText("1");
  await expect(row).toContainText("16 hours");
});

test("scenario outcomes remain empty until a result exists", async ({ page }) => {
  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name:"Scenario analysis", exact:true })).toBeVisible();
  await expect(page.getByText("Run a scenario to see its projected outcome", { exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Run simulation", exact:true })).toBeVisible();
  await expect(page.getByText("Simulated projections", { exact:true }).first()).toBeVisible();
});

test("failed requests show an actionable retry state without invented aircraft counts", async ({ page }) => {
  await page.route("**/api/fleet", (route) => route.fulfill({ status:503, json:{ detail:"Fleet service temporarily unavailable" } }));
  await page.goto("/fleet");
  await expect(page.getByRole("alert")).toContainText("Fleet service temporarily unavailable");
  await expect(page.getByRole("button", { name:"Try again" })).toBeVisible();
  await expect(page.getByRole("link", { name:/SYN-001/ })).toHaveCount(0);
});

test("mobile navigation traps focus, supports Escape and keeps the viewport contained", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto("/fleet");
  const trigger = page.getByRole("button", { name:"Open navigation" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name:"Workspace navigation" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  const overflow = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("main *")].filter((node) => node.getBoundingClientRect().right > window.innerWidth).map((node) => ({ tag:node.tagName, class:node.className, right:node.getBoundingClientRect().right })).slice(0,12) }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
});

test("mobile views retain readable controls without page overflow", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  for (const route of ["/alerts", "/planning", "/inventory", "/scenarios", "/components/cmp-eng-01"]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true);
  }
});

test("session sign-in shows denied credentials and opens the authenticated workspace", async ({ page }) => {
  let signedIn = false;
  await page.route("**/api/access/session", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.password !== "test-account-password") return route.fulfill({ status: 401, json: { detail: "Invalid credentials or unavailable account" } });
      signedIn = true;
    }
    return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { id: "test-reviewer", role: "supervisor", authentication: "server session", csrf_token: "fixture-csrf" } : { detail: "Authentication required" } });
  });
  await page.route("**/api/access/registration",route=>route.fulfill({json:{enabled:false}}));
  await page.goto("/fleet");
  await page.getByRole('button', { name: /Maintenance supervisor.*Plan maintenance/ }).click();
  await page.getByRole('button', { name: 'Select workspace', exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to AeroCare" })).toBeVisible();
  await page.getByLabel("Account ID").fill("test-reviewer");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({hasText:"Invalid credentials"})).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("test-account-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("dialog", {name:"A quick look around your dashboard"}).getByRole("button",{name:"Skip",exact:true}).click();
  await page.locator(".o-profile > summary").click();
  await expect(page.getByText("test-reviewer", { exact: true })).toBeVisible();
  await expect(page.getByText(/signed in/)).toBeVisible();
});

test("delivery receipt updates inventory and retains the reviewed quantity", async ({ page }) => {
  let delivery: Record<string, unknown> | null = null;
  await page.route("**/api/inventory/arrivals", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.quantity).toBe(2);
      expect(body.arrival_slot).toBe(4);
      expect(body.expected_part_version).toBe(2);
      delivery = { ...body, status: "expected", version: 1, created_at: "2026-10-04T04:00:00Z", received_at: null, provenance: "synthetic", slot_duration_hours: 8 };
      return route.fulfill({ json: delivery });
    }
    return route.fulfill({ json: delivery ? [delivery] : [] });
  });
  await page.route("**/api/inventory/arrivals/*/outcome", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe("receive");
    expect(body.expected_version).toBe(1);
    delivery = { ...delivery, status: "received", version: 2, received_at: "2026-10-04T05:00:00Z" };
    return route.fulfill({ json: delivery });
  });
  await page.goto("/inventory");
  await page.getByRole("combobox", { name: "Part", exact: true }).selectOption("kit");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Arrival slot", { exact: true }).fill("4");
  await page.getByLabel("Reason", { exact: true }).fill("Synthetic incoming shipment");
  await page.getByRole("button", { name: "Record expected delivery" }).click();
  await page.getByRole("button", { name: "Review delivery" }).click();
  await expect(page.getByText("Confirming receipt adds 2 units", { exact: false })).toBeVisible();
  await page.getByLabel("Outcome reason", { exact: true }).fill("Received labelled fixture units");
  await page.getByRole("button", { name: "Confirm received stock" }).click();
  await expect(page.getByRole("cell", { name: "received", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review delivery", exact: true })).toHaveCount(0);
});

test("stale proposal conflict never displays committed approval",async({page})=>{
 await page.route('**/api/plans/plan-ui/approve',route=>route.fulfill({status:409,json:{detail:'Inputs changed; calculate a fresh proposal'}}));
 await page.goto('/planning');await page.getByRole('button',{name:'Review & approve',exact:true}).click();
 await page.getByRole('button',{name:'Approve & reserve parts',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Inputs changed; calculate a fresh proposal');
 await expect(page.getByText('Plan approved',{exact:true})).toHaveCount(0);
});

test('empty optimal proposal is not presented as approvable work', async ({ page }) => {
 await page.route('**/api/plans', route => route.fulfill({ json: [{ ...plan, assignments: [] }] }));
 await page.goto('/planning');
 await expect(page.getByText('No approvable schedule', { exact: true })).toBeVisible();
 await expect(page.getByText('This proposal contains no scheduled work.', { exact: false })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Review & approve', exact: true })).toBeDisabled();
 await expect(page.getByText('Constraint-checked', { exact: true })).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Compare this saved plan', exact: true })).toHaveCount(0);
});

test('legacy work approval conflict explains the blocker and preserves review', async ({ page }) => {
 await page.route('**/api/plans/plan-ui/approve', route => route.fulfill({ status: 409, json: { detail: 'Active legacy work has no crew/bay booking. Reconcile or finish that work before creating a resource-aware proposal.' } }));
 await page.goto('/planning');
 await page.getByRole('button', { name: 'Review & approve', exact: true }).click();
 await page.getByRole('button', { name: 'Approve & reserve parts', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('Active legacy work has no crew/bay booking');
 await expect(page.getByText('Plan approved', { exact: true })).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Review & approve', exact: true })).toBeEnabled();
});

test('successful exact-plan approval refreshes retained reservation and work history',async({page})=>{
 let current:Record<string,unknown>=plan;
 await page.route('**/api/plans',route=>route.fulfill({json:[current]}));
 await page.route('**/api/plans/plan-ui/approve',route=>{current={...plan,status:'approved',approved_by:'test-supervisor',approved_at:'2026-10-04T05:00:00Z'};return route.fulfill({json:current});});
 await page.route('**/api/plans/plan-ui/commitment',route=>route.fulfill({json:{plan_id:'plan-ui',reservations:[{id:1,part_id:'fixture-kit',quantity:2,status:'reserved'}],work:[{id:'work-test',task_id:'task-inspect',status:'approved',version:1,consumed_quantity:0,notes:'Labelled test commitment',started_at:null,completed_at:null}]}}));
 await page.goto('/planning');await page.getByRole('button',{name:'Review & approve',exact:true}).click();
 await page.getByRole('button',{name:'Approve & reserve parts',exact:true}).click();
 await expect(page.getByRole('table',{name:'Part commitment records'})).toContainText('fixture-kit');
 await expect(page.getByRole('table',{name:'Work records'})).toContainText('work-test');
 await expect(page.getByRole('table',{name:'Work records'})).toContainText('Labelled test commitment');
});
