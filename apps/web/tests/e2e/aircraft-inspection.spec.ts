import {expect,test,type Page} from './workspaceTest';
const fleet=[{id:'a',tail_number:'SYN-A',label:'Synthetic test aircraft A',provenance:'synthetic',component_ids:['left','right'],components:2,open_tasks:1},{id:'b',tail_number:'SYN-B',label:'Synthetic test aircraft B',provenance:'synthetic',component_ids:['other'],components:1,open_tasks:0}];
async function fixture(page:Page){
 await page.route(url=>url.pathname.startsWith('/api/'),route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': test\n\n'});
  if(path==='/api/access/session')return route.fulfill({json:{id:'test-supervisor',role:'supervisor',authentication:'demonstration header',csrf_token:null}});
  if(path==='/api/health/ready')return route.fulfill({json:{status:'ready',database:'ok'}});
  if(path==='/api/assistant/status')return route.fulfill({json:{enabled:false,available:false,model:null,detail:'off',can_run_scenarios:false}});
  if(path==='/api/fleet')return route.fulfill({json:fleet});
  if(path==='/api/alerts')return route.fulfill({json:[]});
  // Labelled fixture for the shared workspace navbar, also present on research routes.
  if(path==='/api/fleet-health/alerts'||path==='/api/fleet-health/advisories')return route.fulfill({json:[]});
  if(path==='/api/workspace/summary')return route.fulfill({json:{awaiting_review:0,work_needing_action:0}});
  if(path==='/api/fleet-health/engine')return route.fulfill({json:{ready:true,runs:[]}});
  if(path==='/api/cases')return route.fulfill({json:{items:[],total:0,offset:0,limit:25}});
  const id=path.split('/')[3];
  if(path.endsWith('/maintenance'))return route.fulfill({json:{component_id:id,slot_duration_hours:8,tasks:[]}});
  if(path.startsWith('/api/components/'))return route.fulfill({json:{id,aircraft_id:id==='other'?'b':'a',kind:'engine',serial_number:`ENGINE-${id}`,status:'monitoring',current_cycle:31,observations:[],assessment:{id:`asm-${id}`,state:'unavailable',estimate_cycles:null,lower_cycles:null,upper_cycles:null,model_version:null,input_version:'labelled-test-fixture',quality_findings:[{code:'model_unavailable',severity:'warning',message:'Fixture: no evaluated model installed.'}]}}});
  return route.fulfill({status:404,json:{detail:'Test endpoint unavailable'}});
 });
}
test.beforeEach(async({page})=>fixture(page));
test('mapped hotspots and keyboard buttons select the same component',async({page})=>{
 const runtimeErrors:string[]=[];page.on('pageerror',error=>runtimeErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')runtimeErrors.push(message.text());});
 await page.goto('/fleet');
 const hotspot=page.getByRole('button',{name:'Inspect mapped Engine · ENGINE-right',exact:true});
 await expect(hotspot).toBeVisible({timeout:20000});
 await hotspot.click();
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-right');
 const list=page.locator('.scene-components').getByRole('button',{name:'Engine · ENGINE-left',exact:true});
 await list.focus();await page.keyboard.press('Enter');
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-left');
 await expect(page.getByRole('button',{name:'Inspect mapped Engine · ENGINE-left',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:/SYN-B/}).click();
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-other');
 await expect(page.locator('.scene-components')).not.toContainText('ENGINE-left');
 expect(runtimeErrors).toEqual([]);
});
test('failed aircraft asset retains component selection and evidence',async({page})=>{
 await page.route('**/models/aircraft.glb',route=>route.fulfill({status:503,body:'Asset unavailable'}));
 await page.goto('/fleet');
 await expect(page.getByText('3D view unavailable',{exact:true})).toBeVisible({timeout:25000});
 await page.locator('.scene-components').getByRole('button',{name:'Engine · ENGINE-right',exact:true}).click();
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-right');
 await expect(page.getByRole('link',{name:'Inspect history & evidence'})).toBeVisible();
});
test('no WebGL retains usable inspection controls',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.startsWith('webgl'))return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
 await page.goto('/fleet');await expect(page.getByText('3D view unavailable',{exact:true})).toBeVisible();
 await page.locator('.scene-components').getByRole('button',{name:'Engine · ENGINE-right',exact:true}).click();
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-right');
});
test('delayed previous component response cannot replace aircraft selection',async({page})=>{
 await page.route('**/api/components/left',async route=>{await new Promise(resolve=>setTimeout(resolve,900));await route.fallback();});
 await page.goto('/fleet');await page.getByRole('button',{name:/SYN-B/}).click();
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-other');
 await page.waitForTimeout(1200);
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-other');
});
test('lost WebGL context disables camera controls and preserves component buttons',async({page})=>{
 await page.goto('/fleet');await expect(page.getByRole('button',{name:'Overview',exact:true})).toBeEnabled({timeout:20000});
 await page.locator('.inspection-model canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await expect(page.getByText('3D view unavailable',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Overview',exact:true})).toBeDisabled();
 await expect(page.locator('.engine-hotspot')).toHaveCount(0);
 await page.locator('.scene-components').getByRole('button',{name:'Engine · ENGINE-right',exact:true}).click();
 await expect(page.locator('.inspection-evidence h2')).toHaveText('ENGINE-right');
});
