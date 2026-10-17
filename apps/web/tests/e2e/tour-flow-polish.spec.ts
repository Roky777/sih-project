import { expect, test } from '@playwright/test';

for (const role of ['engineer','supervisor','logistics','fleet_manager']) {
  test(`${role} tour outlines stay inside their targets at desktop and mobile sizes`,async({page})=>{
    await page.addInitScript(role=>{sessionStorage.setItem('fleet:workspace-entry','local-demo');localStorage.setItem('ops:role',role);},role);
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      await page.goto('/advisories?status=proposed');
      await page.getByRole('button',{name:'Start overview',exact:true}).click();
      for(let i=0;i<6;i++){
        await expect(page.locator('.dashboard-overview-highlight')).toBeVisible();
        await expect.poll(()=>page.evaluate(()=>{
          const h=document.querySelector<HTMLElement>('.dashboard-overview-highlight')!;
          const destination=h.dataset.overviewTarget;
          const selector=destination==='assistant'?'.o-header .o-ask-ai':`.o-topnav > a[href="${destination}"]`;
          let target=document.querySelector<HTMLElement>(selector);
          if(!target?.getBoundingClientRect().width) target=document.querySelector('.o-header .o-mobile-only');
          if(!target)return false;
          const a=h.getBoundingClientRect(),b=target.getBoundingClientRect();
          const fits=a.left>=b.left+1&&a.right<=b.right-1&&a.top>=b.top+1&&a.bottom<=b.bottom-1;
          const neighbours=[...document.querySelectorAll<HTMLElement>('.o-topnav > a,.o-navmenu > summary,.o-header .o-ask-ai')].filter(e=>e!==target);
          return fits&&neighbours.every(e=>{const r=e.getBoundingClientRect();return !r.width||Math.min(a.right,r.right)<=Math.max(a.left,r.left)||Math.min(a.bottom,r.bottom)<=Math.max(a.top,r.top);});
        })).toBe(true);
        if(await page.getByRole('button',{name:'Finish overview',exact:true}).count()){
          await page.getByRole('button',{name:'Finish overview',exact:true}).click();break;
        }
        await page.getByRole('button',{name:'Next',exact:true}).click();
      }
      await expect(page.locator('.dashboard-overview')).toHaveCount(0);
    }
  });
}

test('workflow uses the reference single-row bar and unchanged live forecast',async({page,request})=>{
  await page.addInitScript(()=>{sessionStorage.setItem('fleet:workspace-entry','local-demo');localStorage.setItem('ops:role','engineer');});
  const summary=await(await request.get('/api/fleet-health/summary')).json();
  for(const path of ['/advisories?status=proposed','/maintenance','/spares?view=requests']){
    await page.goto(path);await page.getByRole('button',{name:'Skip',exact:true}).click();
    const flow=page.getByRole('navigation',{name:'Maintenance decision flow',exact:true});
    await expect(flow.getByRole('link')).toHaveCount(5);
    await expect(flow.locator('[data-stage="availability"] .o-flow-count')).toHaveText(`${Math.round(summary.forecast_30d.availability_mean*100)}%`);
    expect(await flow.locator('[data-stage="availability"] .o-flow-count').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});
      expect(await flow.evaluate((e,width)=>{
        const cards=[...e.querySelectorAll<HTMLElement>('.o-flow-step')];
        const bounds=cards.map(c=>c.getBoundingClientRect());
        return parseFloat(getComputedStyle(e).borderRadius)>=12
          && (width<1000 || bounds.every(b=>Math.abs(b.top-bounds[0].top)<1))
          && cards.every(c=>parseFloat(getComputedStyle(c).borderTopWidth)===0);
      },width)).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    }
  }
});
