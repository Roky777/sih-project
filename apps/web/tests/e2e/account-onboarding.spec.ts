import { expect, test, type Page } from '@playwright/test';

async function accessFixture(page: Page, enabled = true, role = 'viewer') {
  let signedIn = false;
  const posts: { path: string; body: Record<string, string> }[] = [];
  const identity = { id: 'new.viewer', role, authentication: 'server session', csrf_token: 'test-csrf' };
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST') posts.push({ path, body: request.postDataJSON() });
    if (path === '/api/access/registration') {
      return route.fulfill(request.method() === 'POST'
        ? { status: 201, json: { id: identity.id, role: 'viewer' } }
        : { json: { enabled } });
    }
    if (path === '/api/access/session') {
      if (request.method() === 'POST') signedIn = true;
      return route.fulfill(signedIn ? { json: identity } : { status: 401, json: { detail: 'Authentication required' } });
    }
    return route.fulfill({ json: [] });
  });
  return { posts };
}

async function fillSignup(page: Page) {
  await page.getByLabel('Display name', { exact: true }).fill('New Viewer');
  await page.getByLabel('Account ID', { exact: true }).fill('New.Viewer');
  await page.getByLabel('Password', { exact: true }).fill('private-test-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('private-test-password');
}

test('signup clears staff selection and returns to a usable viewer login', async ({ page }) => {
  const { posts } = await accessFixture(page);
  await page.goto('/login?workspace=supervisor');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await fillSignup(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Account created with viewer access');
  await expect(page.getByLabel('Account ID', { exact: true })).toHaveValue('new.viewer');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByLabel('Password', { exact: true }).fill('private-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('.o-shell')).toBeVisible();
  expect(posts[0].body).toEqual({ user_id: 'new.viewer', display_name: 'New Viewer', password: 'private-test-password' });
  expect(posts[1].body).toEqual({ user_id: 'new.viewer', password: 'private-test-password' });
  // A fresh tab/session-storage loss must not require role selection again.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.locator('.o-shell')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Choose your workspace role' })).toHaveCount(0);
  await page.goto('/account');
  await expect(page.getByText('Viewer (read only)', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Current role' })).toHaveCount(0);
});

for (const [role, home] of [
  ['engineer', '/advisories?status=proposed'], ['supervisor', '/maintenance'],
  ['logistics', '/spares?view=requests'], ['fleet_manager', '/dashboard'],
  ['planner', '/maintenance'], ['administrator', '/maintenance'],
]) {
  test(`${role} signs in directly to its assigned workspace`, async ({ page }) => {
    const { posts } = await accessFixture(page, true, role);
    await page.goto('/login');
    await page.getByLabel('Account ID', { exact: true }).fill('assigned-account');
    await page.getByLabel('Password', { exact: true }).fill('assigned-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname + url.search === home);
    expect(posts[0].body).toEqual({ user_id: 'assigned-account', password: 'assigned-password' });
  });
}

test('password mismatch stays on signup without submitting', async ({ page }) => {
  const { posts } = await accessFixture(page);
  await page.goto('/signup');
  await fillSignup(page);
  await page.getByLabel('Confirm password', { exact: true }).fill('a-different-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.');
  expect(posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
});

test('disabled signup explains how to get access and offers existing-account login', async ({ page }) => {
  const { posts } = await accessFixture(page, false);
  await page.goto('/signup');
  await expect(page.getByText(/Account creation is closed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
  await page.getByText('Forgot your account ID or password?').click();
  await expect(page.getByText(/Email recovery is not available/)).toBeVisible();
  expect(posts).toHaveLength(0);
});

test('registration errors allow correction and rate limits cannot be bypassed by changing forms', async ({ page }) => {
  await accessFixture(page);
  let attempts = 0;
  await page.route('**/api/access/registration', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { enabled: true } });
    attempts++;
    return route.fulfill(attempts === 1
      ? { status: 409, json: { detail: 'Account ID is already in use. Choose another or sign in.' } }
      : { status: 429, headers: { 'Retry-After': '30' }, json: { detail: 'Too many requests' } });
  });
  await page.goto('/signup');
  await fillSignup(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already in use');
  await page.getByLabel('Account ID', { exact: true }).fill('another.viewer');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: /Wait \d+s/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  // Even browser navigation between the routes retains the cooldown in SessionGate.
  await page.evaluate(() => { history.pushState(null, '', '/login'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('button', { name: /Wait \d+s/ })).toBeDisabled();
  expect(attempts).toBe(2);
});

test('an unreachable backend offers retry without an unusable login form', async ({ page }) => {
  await page.route(/^https?:\/\/[^/]+\/api\//, route => route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Demo backend offline' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});

test('signup options can be retried without losing ordinary sign-in', async ({ page }) => {
  await accessFixture(page);
  let available = false;
  await page.route('**/api/access/registration', route => route.fulfill(available
    ? { json: { enabled: true } } : { status: 503, json: { detail: 'Try later' } }));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('couldn’t check account creation');
  available = true;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
});

test('desktop and mobile expose signup without horizontal overflow', async ({ page }) => {
  await accessFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to AeroCare' })).toBeVisible();
  await page.screenshot({ path: '../../output/auth-flow/login-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeVisible();
  await page.screenshot({ path: '../../output/auth-flow/signup-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Create account', exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../output/auth-flow/signup-mobile.png', fullPage: true });
});
