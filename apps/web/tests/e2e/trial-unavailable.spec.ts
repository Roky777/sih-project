import {test,expect} from './workspaceTest';

test('disabled trial installation gives guidance without retrying a forbidden action',async({page})=>{
 await page.route('**/api/access/session',route=>route.fulfill({json:{id:'test-supervisor',role:'supervisor',authentication:'demonstration header',csrf_token:null}}));
 await page.route('**/api/demo/catalog',route=>route.fulfill({status:403,json:{detail:'Customer trials are available only in a configured demonstrator.'}}));
 await page.goto('/demo');
 await expect(page.getByRole('heading',{name:'Guided trials are unavailable in this installation'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Try again'})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Open workflow guidance'})).toHaveAttribute('href','/welcome');
 await expect(page.getByRole('link',{name:'Return to fleet overview'})).toHaveAttribute('href','/dashboard');
});
