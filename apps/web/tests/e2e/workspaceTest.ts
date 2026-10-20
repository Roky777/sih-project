import { test as base, expect } from '@playwright/test';

/** Screen fixtures start inside the demo workspace. Entry/auth/tour specs use base test. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('fleet:workspace-entry', 'local-demo');
      for (const role of ['engineer', 'supervisor', 'logistics', 'fleet_manager']) {
        localStorage.setItem(`aerocare:overview-seen:${encodeURIComponent(`demo:${role}`)}`, '1');
      }
    });
    await use(page);
  },
});
export { expect };
export type { Page } from '@playwright/test';
