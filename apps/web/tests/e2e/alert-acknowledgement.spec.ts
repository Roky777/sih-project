import { expect, test } from "./workspaceTest";
test("acknowledgement records review without changing the recorded alert state", async ({ page }) => {
  await page.goto("/alerts");
  const alert=page.locator('.attention-card').first();
  await expect(alert).toBeVisible();
  const state=await alert.locator('.badge').textContent();
  const review=alert.getByRole('button',{name:'Record technical review',exact:true});
  if(await review.count())await review.click();
  await expect(alert).toContainText('demo-engineer');
  await expect(alert.locator('.badge')).toHaveText(state!);
});
