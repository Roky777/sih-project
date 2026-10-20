import { expect, test } from "./workspaceTest";

test("degraded data never displays a fabricated estimate", async ({ page }) => {
  await page.route('**/api/components/cmp-eng-02',route=>route.fulfill({json:{id:'cmp-eng-02',aircraft_id:'ac-syn-02',serial_number:'WITHHELD-FIXTURE',kind:'engine',status:'monitoring',current_cycle:20,observations:[],assessment:{id:'asm-withheld',state:'withheld',estimate_cycles:null,lower_cycles:null,upper_cycles:null,model_version:null,input_version:'labelled-fixture',quality_findings:[{code:'model_unavailable',severity:'warning',message:'No model installed'}]}}}));
  await page.goto("/components/cmp-eng-02");
  await expect(page.getByText("Prediction is unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("paragraph").filter({hasText:/^No model installed$/})).toBeVisible();
  await expect(page.getByText(/No numerical life estimate is substituted/i)).toBeVisible();
});
