import { expect, test } from '@playwright/test';

test('every workspace opens credentials before protected content', async ({ page }) => {
  const workspaces = [
    ['engineer', 'Maintenance engineer'], ['supervisor', 'Maintenance supervisor'],
    ['logistics', 'Logistics team'], ['fleet_manager', 'Fleet manager'],
  ];
  let protectedRequests = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/access/session') return route.fulfill({ status: 401, json: { detail: 'Authentication required' } });
    if (path === '/api/access/registration') return route.fulfill({ json: { enabled: false } });
    protectedRequests++;
    return route.fulfill({ status: 401, json: { detail: 'Authentication required' } });
  });
  await page.goto('/login');
  for (const [id, label] of workspaces) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?workspace=${id}$`));
    await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
    await expect(page.getByLabel('Account ID', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await expect(page.locator('.o-shell')).toHaveCount(0);
    await page.getByRole('button', { name: '← Choose another workspace' }).click();
  }
  expect(protectedRequests).toBe(0);
});

test('credentials are verified and account role switching requires a fresh login', async ({ page }) => {
  let signedIn = false;
  const identity = { id: 'engineer-fixture', role: 'engineer', authentication: 'server session', csrf_token: 'csrf-fixture' };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/session') {
      if (request.method() === 'POST') {
        const credentials = request.postDataJSON();
        expect(credentials.workspace).toBe('engineer');
        if (credentials.user_id !== identity.id || credentials.password !== 'test-password-fixture') {
          return route.fulfill({ status: 401, json: { detail: 'Invalid credentials or unavailable account' } });
        }
        signedIn = true;
      } else if (request.method() === 'DELETE') {
        expect(request.headers()['x-csrf-token']).toBe(identity.csrf_token);
        signedIn = false;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill(signedIn ? { json: identity } : { status: 401, json: { detail: 'Authentication required' } });
    }
    if (path === '/api/access/registration') return route.fulfill({ json: { enabled: false } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: /Maintenance engineer/ }).click();
  await page.getByLabel('Account ID', { exact: true }).fill(identity.id);
  await page.getByLabel('Password', { exact: true }).fill('incorrect');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  await expect(page.locator('.o-shell')).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill('test-password-fixture');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/advisories\?status=proposed$/);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('combobox', { name: 'Current role' }).selectOption('fleet_manager');
  await expect(page).toHaveURL(/\/login\?workspace=fleet_manager$/);
  await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
  await expect(page.locator('.o-shell')).toHaveCount(0);
  expect(signedIn).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('fleet:workspace-entry'))).toBeNull();
});
