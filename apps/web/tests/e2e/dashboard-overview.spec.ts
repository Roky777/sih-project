import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page, role: string) {
  await expect(page.getByRole('group',{name:'Choose your workspace role'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Select workspace',exact:true})).toBeDisabled();
  await page.locator('.entry-role-card').filter({has:page.getByText(role,{exact:true})}).click();
  await page.getByRole('button',{name:'Select workspace',exact:true}).click();
}

test('visual entry chooses the actual demo role, then overview repeats on refresh without repeating sign-in', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await enter(page,'Fleet manager');
  const invitation=page.getByRole('dialog',{name:'A quick look around your dashboard'});
  await expect(invitation).toBeVisible();
  await invitation.getByRole('button',{name:'Skip',exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Aircraft',exact:true}).click();
  await expect(invitation).toHaveCount(0);
  await page.reload();
  await expect(invitation).toBeVisible();
  await expect(page.getByRole('group',{name:'Choose your workspace role'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(invitation).toHaveCount(0);
});

test('engineer overview retains bookmarked aircraft and uses the chosen workspace role',async({page,request})=>{
  await page.goto('/aircraft/AC-026');
  const before=await(await request.get('/api/fleet-health/aircraft/AC-026')).json();
  await enter(page,'Maintenance engineer');
  await page.getByRole('button',{name:'Start overview',exact:true}).click();
  const titles=['Inspect the aircraft and component','Review the AI evidence','Hand a reviewed finding to maintenance','Ask for help in context'];
  for(let i=0;i<titles.length;i++){
    await expect(page.getByRole('dialog',{name:titles[i],exact:true})).toBeVisible();
    await expect(page.locator('.dashboard-overview-highlight')).toBeVisible();
    await page.getByRole('button',{name:i===titles.length-1?'Finish overview':'Next',exact:true}).click();
  }
  await expect(page).toHaveURL(/\/aircraft\/AC-026$/);
  expect((await(await request.get('/api/fleet-health/aircraft/AC-026')).json()).aircraft).toEqual(before.aircraft);
  expect(await page.evaluate(()=>localStorage.getItem('ops:role'))).toBe('engineer');
  expect((await request.post('/api/plans/proposals',{headers:{'X-Demo-Role':'engineer'}})).status()).toBe(403);
});

test('all four role cards open relevant work areas and their own overview',async({page})=>{
  const cases=[['Maintenance engineer','Inspect the aircraft and component','/advisories'],['Maintenance supervisor','Prioritise and schedule maintenance','/maintenance'],['Logistics team','Find the parts that need attention','/spares'],['Fleet manager','Your fleet at a glance','/dashboard']];
  await page.goto('/dashboard');
  for(const[label,title,path]of cases){
    await enter(page,label);
    await expect.poll(()=>new URL(page.url()).pathname).toBe(path);
    await page.getByRole('button',{name:'Start overview',exact:true}).click();
    await expect(page.getByRole('dialog',{name:title,exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Change workspace',exact:true}).click();
    await expect(page.getByRole('group',{name:'Choose your workspace role'})).toBeVisible();
    // Next selection starts at the normal entry route.
    await page.goto('/dashboard');
  }
});

test('mobile role cards, layered canvas and overview fit the screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/dashboard');
  await expect(page.locator('.workspace-entry canvas')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await enter(page,'Fleet manager');
  await page.getByRole('button',{name:'Start overview',exact:true}).click();
  const box=await page.locator('.dashboard-overview').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
});

test('server-assigned role cannot be elevated through workspace cards',async({page})=>{
  await page.route('**/api/access/session',route=>route.fulfill({json:{id:'engineer-fixture',role:'engineer',authentication:'server session',csrf_token:'fixture'}}));
  await page.goto('/dashboard');
  await expect(page.getByText('Your assigned workspace',{exact:true})).toBeVisible();
  await expect(page.locator('.entry-role-card:disabled')).toHaveCount(3);
  await page.locator('.entry-role-card:disabled').first().hover();
  await page.waitForTimeout(2200);
  await expect(page.locator('.entry-role-card.is-filling')).toHaveCount(0);
  await expect(page.locator('.entry-role-card.selected')).toContainText('Maintenance engineer');
  await page.getByRole('button',{name:'Select workspace',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Maintenance engineer');
  expect(await page.evaluate(()=>localStorage.getItem('ops:role'))).toBeNull();
});

test('real account sign-in retains validation and opens only the authenticated role',async({page})=>{
  let signedIn=false;
  await page.addInitScript(()=>sessionStorage.setItem('fleet:workspace-entry','logistics-demo:logistics'));
  await page.route('**/api/access/session',async route=>{
    if(route.request().method()==='POST'){
      expect(route.request().postDataJSON()).toEqual({user_id:'logistics-demo',password:'test-password-fixture'});
      signedIn=true;
    }
    await route.fulfill(signedIn?{json:{id:'logistics-demo',role:'logistics',authentication:'server session',csrf_token:'test-csrf'}}:{status:401,json:{detail:'Authentication required'}});
  });
  await page.route('**/api/access/registration',route=>route.fulfill({json:{enabled:false}}));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Logistics team/ }).click();
  await expect(page.getByRole('heading',{name:'Sign in to AeroCare'})).toBeVisible();
  await page.getByLabel('Account ID',{exact:true}).fill('logistics-demo');
  await page.getByLabel('Password',{exact:true}).fill('test-password-fixture');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('.entry-role-card.selected')).toContainText('Logistics team');
  await expect(page.locator('.entry-role-card:disabled')).toHaveCount(3);
});

test('team priorities use recorded responsibility and All teams retains shared context',async({page})=>{
  const record=(id:string,role:string)=>({id,dataset:'operational:fixture',aircraft_id:'AC-026',component_id:null,title:id,state:'awaiting_review',owner:null,owner_team:role,deadline:null,blocker:null,version:1,created_at:'2026-10-16T00:00:00Z',next_action:{label:'Review evidence',to:'/advisories',role},evidence_versions:[],links:[],review:null,work:[],proposals:[],audit:[]});
  await page.route('**/api/workspace/summary',route=>route.fulfill({json:{awaiting_review:2,work_needing_action:1,urgent_review:0,blocked_work:0,as_of:'2026-09-30',updated_at:null,dataset:'operational',actions:[record('Engineer case fixture','Maintenance engineer'),record('Supply case fixture','Logistics team')]}}));
  await page.goto('/dashboard');
  await enter(page,'Maintenance engineer');
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Overview',exact:true}).click();
  const priorities=page.getByRole('region',{name:'Priority actions',exact:true});
  await expect(priorities.getByText('Engineer case fixture',{exact:true})).toBeVisible();
  await expect(priorities.getByText('Supply case fixture',{exact:true})).toHaveCount(0);
  await priorities.getByRole('button',{name:'All teams',exact:true}).click();
  await expect(priorities.getByText('Supply case fixture',{exact:true})).toBeVisible();
});

test('liquid hover selects the role but entry requires Select workspace',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/login');
  const card=page.locator('.entry-role-card').filter({has:page.getByText('Logistics team',{exact:true})});
  await card.hover();
  await expect(card).toHaveClass(/is-filling/);
  await page.waitForTimeout(650);
  const fill=await card.evaluate(e=>({transform:getComputedStyle(e,'::before').transform,background:getComputedStyle(e,'::before').backgroundImage,mask:getComputedStyle(e,'::before').maskImage}));
  const rise=Number(fill.transform.split(',').at(-1)?.replace(')',''));
  expect(rise).toBeGreaterThan(0);
  expect(fill.mask).toContain('svg');
  expect(fill.background).toContain('rgb(236, 246, 237)');
  expect(fill.background).toContain('rgb(227, 240, 230)');
  await expect(card).toHaveAttribute('aria-pressed','true',{timeout:5000});
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(()=>sessionStorage.getItem('fleet:workspace-entry'))).toBeNull();
  await page.getByRole('button',{name:'Select workspace',exact:true}).click();
  await expect(page).toHaveURL(/\/spares\?view=requests$/);
  await expect(page.getByRole('dialog')).toContainText('Logistics team');
});

test('leaving, switching cards and hiding the page cancel incomplete hover entry',async({page})=>{
  await page.goto('/login');
  const cards=page.locator('.entry-role-card');
  await cards.nth(0).hover();await page.waitForTimeout(500);
  await cards.nth(1).hover();await page.waitForTimeout(500);
  await page.mouse.move(0,0);
  await expect(page.locator('.entry-role-card.is-filling')).toHaveCount(0);
  await page.waitForTimeout(2200);
  await expect(page).toHaveURL(/\/login$/);
  await cards.nth(2).hover();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(page.locator('.entry-role-card.is-filling')).toHaveCount(0);
  await page.waitForTimeout(2200);
  await expect(page).toHaveURL(/\/login$/);
});

test('touch and keyboard keep explicit entry',async({page})=>{
  await page.goto('/login');
  const card=page.locator('.entry-role-card').first();
  await card.dispatchEvent('pointerenter',{pointerType:'touch'});
  await expect(card).not.toHaveClass(/is-filling/);
  await card.focus();await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.entry-role-card.is-filling')).toHaveCount(0);
  await page.getByRole('button',{name:'Select workspace',exact:true}).click();
  await expect(page).toHaveURL(/\/advisories\?status=proposed$/);
});

test('reduced motion removes the sweep and never navigates without confirmation',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/login');
  const card=page.locator('.entry-role-card').filter({has:page.getByText('Fleet manager',{exact:true})});
  await card.hover();
  expect(await card.evaluate(e=>getComputedStyle(e,'::before').animationName)).toBe('none');
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/\/login$/);
  await expect(card).toHaveAttribute('aria-pressed','true',{timeout:5000});
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button',{name:'Select workspace',exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('entry warms engine readiness and waits to open live events until confirmation',async({page})=>{
  let engines=0,streams=0;
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/fleet-health/engine')engines++;if(new URL(r.url()).pathname==='/api/events')streams++;});
  const readiness=page.waitForResponse(r=>r.url().includes('/api/fleet-health/engine')&&r.ok());
  await page.goto('/login');
  await readiness;
  expect(engines).toBe(1);
  expect(streams).toBe(0);
  await enter(page,'Fleet manager');
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await expect(page.getByRole('region',{name:'Availability trend',exact:true})).toBeVisible();
  expect(engines).toBe(1);
  await expect.poll(()=>streams).toBe(1);
});

test('a stalled engine request becomes a retry state within the five-second deadline',async({page})=>{
  await page.route('**/api/fleet-health/engine',async route=>{await new Promise(r=>setTimeout(r,7000));await route.fulfill({status:503,json:{detail:'Test unavailable engine'}}).catch(()=>{});});
  await page.goto('/login');await enter(page,'Fleet manager');
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await expect(page.getByText('Fleet engine unavailable',{exact:true})).toBeVisible({timeout:6500});
  await expect(page.locator('.o-gate').getByRole('button',{name:'Retry',exact:true})).toBeVisible();
});

test('hidden workspaces release their live stream and reconnect on return',async({page})=>{
  await page.addInitScript(()=>{
    const Original=window.EventSource;
    const counts={opened:0,closed:0};Object.assign(window,{eventStreamCounts:counts});
    window.EventSource=class extends Original {
      constructor(url:string|URL,options?:EventSourceInit){super(url,options);counts.opened++;}
      close(){counts.closed++;super.close();}
    };
  });
  await page.goto('/login');await enter(page,'Fleet manager');
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  const counts=()=>page.evaluate(()=>(window as unknown as {eventStreamCounts:{opened:number;closed:number}}).eventStreamCounts);
  await expect.poll(async()=>(await counts()).opened).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(async()=>(await counts()).closed).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(async()=>(await counts()).opened).toBe(2);
});

test('workspace confirmation stays in view before and after role selection',async({page})=>{
  for(const [width,height] of [[1440,900],[1366,768],[1280,720],[1024,600],[820,1180],[390,844],[375,667],[320,568]]){
    await page.setViewportSize({width,height});
    await page.goto('/login');
    const button=page.getByRole('button',{name:'Select workspace',exact:true});
    await expect(button).toBeVisible();
    const inView=()=>button.evaluate(e=>{const b=e.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth;});
    expect(await inView()).toBe(true);
    await page.getByRole('button',{name:/Maintenance engineer/}).click();
    expect(await inView()).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(await page.locator('.entry-role-content').evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
    // The action area must not cover any role card.
    await page.locator('.entry-role-card').last().scrollIntoViewIfNeeded();
    expect(await page.locator('.entry-role-card').last().evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.entry-actions')!.getBoundingClientRect().top)).toBe(true);
    expect(await inView()).toBe(true);
  }
});
