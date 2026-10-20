import { expect, test } from '@playwright/test';

test('visitors choose a workspace before sign in and signup without protected requests', async ({ page }) => {
  let protectedRequests = 0;
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/access/session') return route.fulfill({ status: 401, json: { detail: 'Authentication required' } });
    if (path === '/api/access/registration') return route.fulfill({ json: { enabled: true } });
    protectedRequests++;
    return route.fulfill({ status: 401, json: { detail: 'Authentication required' } });
  });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Choose your workspace role' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select workspace', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Fleet manager.*Fleet dashboard/ }).click();
  await expect(page.getByRole('group', { name: 'Choose your workspace role' })).toBeVisible();
  await page.getByRole('button', { name: 'Select workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?workspace=fleet_manager$/);
  await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Choose your workspace role' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?workspace=fleet_manager$/);
  await expect(page.getByRole('heading', { name: 'Create your AeroCare account' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Display name')).toBeVisible();
  await expect(page.getByText('Your workspace access', { exact: true })).toBeVisible();
  expect(protectedRequests).toBe(0);
});

test('the public root asks for a workspace even with a restored server session', async ({ page }) => {
  let signedIn = true;
  let signedOut = 0;
  let protectedRequests = 0;
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/session') {
      if (request.method() === 'DELETE') {
        expect(request.headers()['x-csrf-token']).toBe('restored-csrf');
        signedIn = false; signedOut++;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill(signedIn ? { json: { id: 'restored', role: 'supervisor',
        authentication: 'server session', csrf_token: 'restored-csrf' } }
        : { status: 401, json: { detail: 'Authentication required' } });
    }
    if (path === '/api/access/registration') return route.fulfill({ json: { enabled: true } });
    protectedRequests++;
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Choose your workspace role' })).toBeVisible();
  expect(signedOut).toBe(0);
  await page.getByRole('button', { name: /Logistics team.*Secure parts/ }).click();
  await page.getByRole('button', { name: 'Select workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?workspace=logistics$/);
  await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
  expect(signedOut).toBe(1);
  expect(protectedRequests).toBe(0);
});

test('direct auth links without a valid workspace return to role selection', async ({ page }) => {
  await page.route('**/api/access/session', route => route.fulfill({ status: 401, json: { detail: 'Authentication required' } }));
  await page.route('**/api/access/registration', route => route.fulfill({ json: { enabled: true } }));
  for (const path of ['/login', '/signup', '/login?workspace=administrator']) {
    await page.goto(path);
    await expect(page.getByRole('group', { name: 'Choose your workspace role' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  }
});

test('all workspace choices lead to the matching login and fit a phone viewport', async ({ page }) => {
  await page.route('**/api/access/session', route => route.fulfill({ status: 401, json: { detail: 'Authentication required' } }));
  await page.route('**/api/access/registration', route => route.fulfill({ json: { enabled: true } }));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, workspace] of [['Maintenance engineer', 'engineer'], ['Maintenance supervisor', 'supervisor'], ['Logistics team', 'logistics'], ['Fleet manager', 'fleet_manager']]) {
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(label) }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Select workspace', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?workspace=${workspace}$`));
    await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
  }
});

test('credentials are verified and account role switching requires a fresh login', async ({ page }) => {
  let signedIn = false;
  const identity = { id: 'engineer-fixture', role: 'engineer', authentication: 'server session', csrf_token: 'csrf-fixture' };
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
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
  await page.goto('/login?workspace=engineer');
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
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Current role' }).selectOption('fleet_manager');
  await expect(page).toHaveURL(/\/login\?workspace=fleet_manager$/);
  await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
  await expect(page.locator('.o-shell')).toHaveCount(0);
  expect(signedIn).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('fleet:workspace-entry'))).toBeNull();
});
