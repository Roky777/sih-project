import {expect,test} from "./workspaceTest";
test("live replay validates frames, runs shared assessments and retains mapped evidence",async({page,request},info)=>{
 test.skip(!process.env.FLEET_E2E_BASE_URL,"Select the local demo explicitly.");test.setTimeout(120000);
 const post=(url:string,data:object)=>request.post(url,{data,headers:{"X-Demo-Role":"engineer"}});
 const denied=await request.post('/api/telemetry',{headers:{'X-Demo-Role':'viewer'}});expect(denied.status()).toBe(403);
 const historical=await request.post('/api/telemetry?as_of=2026-09-01',{headers:{'X-Demo-Role':'engineer'}});expect(historical.status()).toBe(409);
 await page.goto('/telemetry');await page.getByRole('button',{name:'Create replay',exact:true}).click();await expect(page).toHaveURL(/stream=stream-/);
 const id=new URL(page.url()).searchParams.get('stream')!;await page.getByRole('button',{name:'Pause replay',exact:true}).click();
 await expect.poll(async()=> (await (await request.get(`/api/telemetry/${id}`)).json()).status).toBe('paused');
 await post(`/api/telemetry/${id}/control`,{status:'running'});
 const first=(await (await request.get(`/api/demo/catalog`)).json()).history.rows[0];
 const before=await (await request.get(`/api/telemetry/${id}`)).json();
 if(before.accepted_cycles===0){const frames={frames:[{...first,observed_at:new Date().toISOString()}]};const outcomes=await Promise.all([post(`/api/telemetry/${id}/frames`,frames),post(`/api/telemetry/${id}/frames`,frames)]);expect(outcomes.every(r=>r.ok())).toBe(true);}
 const invalid=await post(`/api/telemetry/${id}/replay`,{demonstrate_rejection:true});expect(invalid.ok()).toBe(true);
 for(let stage=1;stage<=6;stage++){
  let row=await (await request.get(`/api/telemetry/${id}`)).json();
  while(row.accepted_cycles<stage*30){row=await (await post(`/api/telemetry/${id}/replay`,{count:Math.min(10,stage*30-row.accepted_cycles)})).json();}
  await expect.poll(async()=>{const r=await(await request.get(`/api/telemetry/${id}`)).json();return r.assessment?.cutoff_cycle;},{timeout:30000}).toBe(stage*30);
 }
 const final=await(await request.get(`/api/telemetry/${id}`)).json();expect(final.status).toBe('completed');expect(final.rejection_count).toBeGreaterThan(0);expect(final.assessment.input_version).toContain('import-');
 const component=await(await request.get(`/api/components/${final.component_id}`)).json();expect(component.assessment.input_version).toBe(final.assessment.input_version);
 await page.reload();await expect(page.getByText('180 / 180',{exact:true})).toBeVisible();await expect(page.locator('.telemetry-plan')).toHaveAttribute('aria-label',new RegExp(final.assessment.requires_review?'review':'monitored'));
 await expect(page.locator('.telemetry-scene canvas')).toBeVisible();await expect(page.getByText('Loading aircraft asset…',{exact:true})).toHaveCount(0,{timeout:25000});await page.screenshot({path:info.outputPath('live-replay-desktop.png'),fullPage:true});
 await page.waitForTimeout(16000);await expect(page.getByText('completed · stale',{exact:true})).toBeVisible({timeout:8000});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);await page.screenshot({path:info.outputPath('live-replay-mobile.png'),fullPage:true});
 await page.getByRole('link',{name:'Open component evidence & review',exact:true}).click();await expect(page).toHaveURL(new RegExp('/components/'+final.component_id));
});

test('saved telemetry selector fits a narrow phone', async ({page}) => {
 await page.route('**/api/access/session',route=>route.fulfill({json:{id:'layout-reviewer',role:'supervisor',authentication:'demonstration header',csrf_token:null}}));
 await page.route('**/api/telemetry',route=>route.fulfill({json:[]}));
 await page.setViewportSize({width:320,height:844});
 await page.goto('/telemetry');
 await expect(page.getByLabel('Saved stream')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const select=await page.getByLabel('Saved stream').boundingBox();
 const card=await page.getByRole('region',{name:'Replay connection',exact:true}).boundingBox();
 expect(select!.x+select!.width).toBeLessThanOrEqual(card!.x+card!.width);
});
