import type { Page } from '@playwright/test';

/** Existing journey tests enter the local workspace explicitly before using their screens. */
export async function handleWorkspaceEntry(page: Page) {
  await page.addLocatorHandler(page.getByRole('group', { name: 'Choose your workspace role' }), async () => {
    await page.getByRole('button', { name: 'Maintenance supervisor', exact: false }).click();
    await page.getByRole('button', { name: 'Select workspace', exact: true }).click();
  });
}
